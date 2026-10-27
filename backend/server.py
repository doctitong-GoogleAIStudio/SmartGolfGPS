import os
import time
import uuid
import math
import json
import asyncio
import hashlib
import logging
import statistics
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from ph_courses import PH_COURSES
from auth import router as auth_router, authenticate, editor, ownership, create_indexes, bootstrap_account

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=4000) if mongo_url and os.environ.get('DB_NAME') else None
db = client[os.environ['DB_NAME']] if client is not None else None

app = FastAPI()
app.state.golf_db = db
api = APIRouter(prefix="/api", dependencies=[Depends(authenticate)])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("golf")

R_EARTH = 6371000.0


@app.middleware("http")
async def private_api_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Do not echo passwords, tokens, GPS samples or other submitted values in errors.
    return JSONResponse({"detail": [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]}
                                    for item in error.errors()]}, status_code=422)


@app.get("/api/health")
async def health():
    from fastapi.responses import JSONResponse
    ready = False
    if db is not None:
        try:
            await db.command("ping")
            ready = True
        except Exception:
            pass
    return JSONResponse({"service": "smart-golf-gps", "apiVersion": "1", "status": "ok" if ready else "unavailable",
                         "authentication": "bearer", "databaseReady": ready}, status_code=200 if ready else 503,
                        headers={"Cache-Control": "no-store"})


def uid():
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    a = max(0, min(1, a))
    return R_EARTH * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def dest(lat, lon, bearing_deg, dist_m):
    br = math.radians(bearing_deg)
    d = dist_m / R_EARTH
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(br))
    l2 = l1 + math.atan2(math.sin(br) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return round(math.degrees(p2), 7), round(math.degrees(l2), 7)


# ---------- Geocoding (OSM Nominatim, keyless, best-effort) ----------
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_geo_lock = asyncio.Lock()
_geo_last = 0.0


async def _nominatim_get(q: str):
    """One rate-limited Nominatim request → (lat, lng) or None."""
    global _geo_last
    async with _geo_lock:
        wait = 1.1 - (time.monotonic() - _geo_last)
        if wait > 0:
            await asyncio.sleep(wait)
        _geo_last = time.monotonic()
        headers = {"User-Agent": os.environ.get("NOMINATIM_USER_AGENT", "SmartGolfGPS/1.0"), "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0), headers=headers) as hc:
            r = await hc.get(_NOMINATIM_URL, params={"q": q, "format": "jsonv2", "limit": 1, "accept-language": "en"})
            r.raise_for_status()
            rows = r.json()
            first = rows[0] if isinstance(rows, list) and rows else None
            if first and first.get("lat") and first.get("lon"):
                return (float(first["lat"]), float(first["lon"]))
    return None


async def _nominatim_search(q: str, limit: int = 6, viewbox: str | None = None):
    """Rate-limited Nominatim search → list of {name, lat, lng} (nearest-biased if viewbox)."""
    global _geo_last
    async with _geo_lock:
        wait = 1.1 - (time.monotonic() - _geo_last)
        if wait > 0:
            await asyncio.sleep(wait)
        _geo_last = time.monotonic()
        headers = {"User-Agent": os.environ.get("NOMINATIM_USER_AGENT", "SmartGolfGPS/1.0"), "Accept": "application/json"}
        params = {"q": q, "format": "jsonv2", "limit": limit, "accept-language": "en"}
        if viewbox:
            params["viewbox"] = viewbox
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0), headers=headers) as hc:
            r = await hc.get(_NOMINATIM_URL, params=params)
            r.raise_for_status()
            rows = r.json()
    out = []
    for row in (rows if isinstance(rows, list) else []):
        if row.get("lat") and row.get("lon"):
            out.append({"name": row.get("display_name", ""), "lat": float(row["lat"]), "lng": float(row["lon"])})
    return out


async def geocode_course(name: str, location: str, force: bool = False):
    """Forward-geocode a course to (lat, lng) via OSM Nominatim. Cached in Mongo
    (positive + negative), rate-limited to <=1 req/sec, and never raises — returns
    None on any failure so course creation/backfill keeps working offline."""
    name = (name or "").strip()
    location = (location or "").strip()
    if not name:
        return None
    key = hashlib.sha256(f"{name.casefold()}|{location.casefold()}".encode()).hexdigest()
    if not force:
        cached = await db.geocode_cache.find_one({"_id": key})
        if cached and (cached.get("lat") is not None or time.time() - cached.get("updated_at", 0) < 7 * 86400):
            return (cached["lat"], cached["lon"]) if cached.get("lat") is not None else None
    # "&" and pasted map-link locations hurt Nominatim; normalise + try variants.
    q_name = name.replace("&", "and")
    loc = "" if ("http" in location.lower() or "goo.gl" in location.lower()) else location
    variants = ([f"{q_name}, {loc}"] if loc else []) + [f"{q_name} Philippines"]
    result = None
    for q in variants:
        try:
            result = await _nominatim_get(q)
        except Exception as exc:
            logger.warning("Nominatim geocode failed for %r: %s", q, exc)
            result = None
        if result:
            break
    await db.geocode_cache.replace_one(
        {"_id": key},
        {"_id": key, "name": name, "location": location, "updated_at": time.time(),
         "lat": result[0] if result else None, "lon": result[1] if result else None},
        upsert=True,
    )
    return result


# ---------- Models ----------
class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class GpsPoint(LatLng):
    t: float = Field(ge=0, allow_inf_nan=False)


class TrackBody(BaseModel):
    points: List[GpsPoint] = Field(default_factory=list, max_length=200)


class Hazard(BaseModel):
    id: str = Field(default_factory=uid)
    name: str = ""
    type: str = "BUNKER"
    lat: float
    lng: float
    carryLat: Optional[float] = None
    carryLng: Optional[float] = None


class HolePolygon(BaseModel):
    type: str = "FAIRWAY"
    points: List[LatLng] = []


class Hole(BaseModel):
    model_config = ConfigDict(extra="allow")
    holeNumber: int
    par: int = 4
    handicap: Optional[int] = None
    tee: Optional[LatLng] = None
    greenFront: Optional[LatLng] = None
    greenCenter: Optional[LatLng] = None
    greenBack: Optional[LatLng] = None
    hazards: List[Hazard] = []
    polygons: List[HolePolygon] = []


class MappingReview(BaseModel):
    reviewer: str = Field(min_length=1, max_length=300)
    source: str = Field(min_length=1, max_length=1000)
    license: str = Field(min_length=1, max_length=1000)
    reviewedAt: str


class Course(BaseModel):
    model_config = ConfigDict(extra="allow")
    mappingReview: Optional[MappingReview] = None
    id: str = Field(default_factory=uid)
    name: str
    location: str = ""
    latitude: float
    longitude: float
    holeCount: int = 18
    isDemo: bool = False
    holes: List[Hole] = []
    clubhouse: Optional[LatLng] = None
    drivingRange: Optional[LatLng] = None
    practiceGreen: Optional[LatLng] = None
    parking: Optional[LatLng] = None
    layoutSource: str = "simulated"
    geocoded: bool = False
    createdAt: str = Field(default_factory=now_iso)
    shareCode: Optional[str] = None


class Club(BaseModel):
    id: str = Field(default_factory=uid)
    name: str
    carry: float = 0
    total: float = 0
    minComfort: float = 0
    maxComfort: float = 0


class Bag(BaseModel):
    id: str = "default"
    clubs: List[Club] = []


class Settings(BaseModel):
    id: str = "default"
    distanceUnit: str = "yd"
    windUnit: str = "kmh"
    tempUnit: str = "C"
    elevationAdj: bool = True
    windAdj: bool = True
    tempAdj: bool = False
    aiCaddie: bool = True
    tournamentMode: bool = False
    gpsTracking: bool = True
    gpsMode: str = "high"


class HoleScore(BaseModel):
    hole: int
    par: int = 4
    score: Optional[int] = None
    putts: Optional[int] = None
    fairway: Optional[bool] = None
    gir: Optional[bool] = None
    penalty: int = 0
    notes: str = ""


class Round(BaseModel):
    id: str = Field(default_factory=uid)
    courseId: str
    courseName: str = ""
    holeCount: int = 18
    player: str = "Golfer"
    tee: str = ""
    status: str = "active"
    currentHole: int = 1
    scores: List[HoleScore] = []
    gpsPath: List[dict] = []
    startedAt: str = Field(default_factory=now_iso)
    endedAt: Optional[str] = None


class RoundUpdate(BaseModel):
    currentHole: Optional[int] = None
    scores: Optional[List[HoleScore]] = None
    status: Optional[str] = None
    endedAt: Optional[str] = None


class Shot(BaseModel):
    id: str = Field(default_factory=uid)
    roundId: Optional[str] = None
    holeNumber: Optional[int] = None
    club: str = ""
    startLat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    startLng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    endLat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    endLng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    distanceMeters: float = 0
    targetDistanceMeters: Optional[float] = None
    playsLikeMeters: Optional[float] = None
    fairway: Optional[bool] = None
    direction: Optional[str] = None
    greenResult: Optional[str] = None
    timestamp: str = Field(default_factory=now_iso)


# ---------- Courses ----------
@api.get("/courses")
async def list_courses():
    courses = await db.courses.find({}, {"_id": 0}).to_list(200)
    return [await _ensure_layout(c) for c in courses]


@api.post("/courses", dependencies=[Depends(editor)])
async def create_course(course: Course):
    if not course.holes:
        n = course.holeCount
        dp, dh = default_pars(n), default_hcps(n)
        course.holes = [Hole(holeNumber=i + 1, par=dp[i], handicap=dh[i]) for i in range(n)]
    # A course pin is a directory location, never playing geometry.
    # Missing tees/greens/hazards stay missing until actually mapped.
    if not any(h.tee for h in course.holes):
        course.layoutSource = "unmapped"
    await db.courses.insert_one(course.model_dump())
    return course


@app.get("/api/courses/directory")
async def courses_directory():
    """Browsable catalog of major Philippine golf courses (for import)."""
    return PH_COURSES


class SaveDirectoryCourse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=300)


@api.get("/courses/saved")
async def saved_courses(request: Request):
    return await db.golf_saved_courses.find(ownership(request), {"_id": 0, "ownerId": 0}).to_list(200)


@api.post("/courses/directory/save")
async def save_directory_course(body: SaveDirectoryCourse, request: Request):
    # A player can bookmark an existing catalog entry, never submit shared geometry.
    entry = next((c for c in PH_COURSES if c["name"].casefold() == body.name.strip().casefold()), None)
    if entry is None:
        raise HTTPException(404, "Directory course not found")
    course_id = "ph-" + hashlib.sha256(entry["name"].casefold().encode()).hexdigest()[:24]
    course = Course(id=course_id, name=entry["name"], location=entry["location"],
                    latitude=entry["latitude"], longitude=entry["longitude"], holeCount=entry["holeCount"],
                    layoutSource="unmapped", holes=[Hole(holeNumber=i + 1) for i in range(entry["holeCount"])],
                    directoryName=entry["name"], scorecardTemplate=True)
    # Mongo's unique _id and setOnInsert make retries/concurrent saves idempotent.
    # Never replace a catalog course an editor has already mapped.
    from pymongo.errors import DuplicateKeyError
    try:
        await db.courses.update_one({"_id": "directory:" + course_id}, {"$setOnInsert": course.model_dump()}, upsert=True)
    except DuplicateKeyError:
        pass
    owner = ownership(request)["ownerId"]
    key = hashlib.sha256((owner + ":" + course_id).encode()).hexdigest()
    try:
        await db.golf_saved_courses.update_one({"_id": key}, {"$setOnInsert": {
            "ownerId": owner, "courseId": course_id, "directoryName": entry["name"], "savedAt": now_iso(),
        }}, upsert=True)
    except DuplicateKeyError:
        pass
    return await db.courses.find_one({"_id": "directory:" + course_id}, {"_id": 0})


@api.get("/courses/{course_id}")
async def get_course(course_id: str):
    c = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Course not found")
    return await _ensure_layout(c)


@api.put("/courses/{course_id}", dependencies=[Depends(editor)])
async def update_course(course_id: str, course: Course):
    course.id = course_id
    # Editing alone does not establish surveyed/reviewed boundaries.
    # The explicit mappingReview declaration is retained, never inferred.
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if existing and not course.shareCode:
        course.shareCode = existing.get("shareCode")  # never lose an issued code on edit
    res = await db.courses.replace_one({"id": course_id}, {**(existing or {}), **course.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Course not found")
    return course


@api.delete("/courses/{course_id}", dependencies=[Depends(editor)])
async def delete_course(course_id: str):
    await db.courses.delete_one({"id": course_id})
    return {"ok": True}


def _new_share_code():
    # Unambiguous chars (no O/0/I/1).
    import random
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


@api.post("/courses/{course_id}/share", dependencies=[Depends(editor)])
async def share_course(course_id: str):
    c = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Course not found")
    code = c.get("shareCode")
    if not code:
        # ensure uniqueness
        for _ in range(10):
            code = _new_share_code()
            if not await db.courses.find_one({"shareCode": code}):
                break
        await db.courses.update_one({"id": course_id}, {"$set": {"shareCode": code}})
    return {"shareCode": code}


@api.post("/courses/import", dependencies=[Depends(editor)])
async def import_course(body: dict):
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(400, "Share code required")
    src = await db.courses.find_one({"shareCode": code}, {"_id": 0})
    if not src:
        raise HTTPException(404, "No course found for that code")
    clone = dict(src)
    clone["id"] = uid()
    clone["name"] = f"{src.get('name', 'Course')} (Shared)"
    clone["isDemo"] = False
    clone["shareCode"] = None
    clone["createdAt"] = now_iso()
    for h in clone.get("holes", []):
        for hz in h.get("hazards", []):
            hz["id"] = uid()
    await db.courses.insert_one(clone)
    clone.pop("_id", None)
    return clone


class RelocateBody(BaseModel):
    latitude: float
    longitude: float


def _apply_layout(c: dict, lat: float, lng: float, geocoded: bool) -> dict:
    """Change a directory anchor only. Preserve every existing hole and POI."""
    return {"latitude": lat, "longitude": lng, "geocoded": geocoded}


async def _ensure_layout(c: dict) -> dict:
    """Read-only compatibility wrapper. Never synthesize or write playing data."""
    return c


@api.post("/courses/{course_id}/relocate", dependencies=[Depends(editor)])
async def relocate_course(course_id: str, body: RelocateBody):
    c = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Course not found")
    if c.get("layoutSource") == "mapped":
        raise HTTPException(400, "This course is hand-mapped — adjust it in the Course Editor instead.")
    upd = _apply_layout(c, body.latitude, body.longitude, True)  # human-confirmed location
    await db.courses.update_one({"id": course_id}, {"$set": upd})
    return {**c, **upd}


@api.post("/courses/geocode-all", dependencies=[Depends(editor)])
async def geocode_all():
    """Re-geocode all saved, non-mapped courses on demand (runs in the background)."""
    ids = [c["id"] async for c in db.courses.find({"id": {"$ne": "demo-apo-davao"}, "layoutSource": {"$ne": "mapped"}}, {"id": 1})]
    asyncio.create_task(_bulk_geocode(ids))
    return {"courses": len(ids)}


@api.get("/geocode/search")
async def geocode_search(q: str, lat: Optional[float] = None, lng: Optional[float] = None):
    """Nearby place search for the Confirm-Location screen — pick a pin by name."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    viewbox = None
    if lat is not None and lng is not None:
        d = 0.4
        viewbox = f"{lng - d},{lat + d},{lng + d},{lat - d}"
    try:
        results = await _nominatim_search(q, limit=6, viewbox=viewbox)
    except Exception as exc:
        logger.warning("Nominatim search failed for %r: %s", q, exc)
        results = []
    return {"results": results}


async def _bulk_geocode(ids):
    snapped = 0
    for cid in ids:
        c = await db.courses.find_one({"id": cid}, {"_id": 0})
        if not c or c.get("layoutSource") == "mapped":
            continue
        geo = await geocode_course(c.get("name", ""), c.get("location", ""), force=True)
        if not geo:
            continue
        await db.courses.update_one({"id": cid}, {"$set": _apply_layout(c, geo[0], geo[1], True)})
        snapped += 1
    logger.info("Bulk geocode complete: %d/%d snapped", snapped, len(ids))


@api.get("/tools/activation-generator", dependencies=[Depends(editor)])
async def download_activation_generator():
    """Serve the standalone, fully-offline Activation Generator HTML as a download.
    Open it once online to save it, then it runs with no internet."""
    path = Path(__file__).resolve().parent.parent / "tools" / "activation-generator.html"
    if not path.exists():
        raise HTTPException(404, "Generator not found")
    return FileResponse(str(path), media_type="text/html", filename="activation-generator.html")


# ---------- Bag ----------
DEFAULT_CLUBS = [
    ("Driver", 230, 250), ("3 Wood", 215, 230), ("5 Wood", 200, 212), ("3 Hybrid", 190, 200),
    ("4 Hybrid", 180, 190), ("4 Iron", 170, 178), ("5 Iron", 160, 168), ("6 Iron", 150, 157),
    ("7 Iron", 140, 146), ("8 Iron", 130, 135), ("9 Iron", 120, 124), ("Pitching Wedge", 110, 113),
    ("Gap Wedge", 95, 98), ("Sand Wedge", 80, 83), ("Lob Wedge", 65, 67), ("Putter", 0, 0),
]


def default_bag():
    clubs = [Club(name=n, carry=c, total=t, minComfort=max(0, c - 10), maxComfort=c + 8) for n, c, t in DEFAULT_CLUBS]
    return Bag(clubs=clubs)


@api.get("/bag")
async def get_bag(request: Request):
    b = await db.bags.find_one({"id": "default", **ownership(request)}, {"_id": 0, "ownerId": 0})
    if not b:
        b = default_bag().model_dump()
        # Read defaults without overwriting or claiming the unassigned legacy bag.
    b.pop("_id", None)
    return b


@api.put("/bag")
async def update_bag(bag: Bag, request: Request):
    bag.id = "default"
    await db.bags.replace_one({"id": "default", **ownership(request)}, {**bag.model_dump(), **ownership(request)}, upsert=True)
    return bag


# ---------- Settings ----------
@api.get("/settings")
async def get_settings(request: Request):
    s = await db.settings.find_one({"id": "default", **ownership(request)}, {"_id": 0, "ownerId": 0})
    if not s:
        s = Settings().model_dump()
        # Existing unassigned settings remain preserved for a deliberate migration.
    s.pop("_id", None)
    return s


@api.put("/settings")
async def update_settings(s: Settings, request: Request):
    s.id = "default"
    await db.settings.replace_one({"id": "default", **ownership(request)}, {**s.model_dump(), **ownership(request)}, upsert=True)
    return s


# ---------- Rounds ----------
@api.post("/rounds")
async def create_round(rnd: Round, request: Request):
    course = await db.courses.find_one({"id": rnd.courseId}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Course not found")
    if course:
        rnd.courseName = course["name"]
        rnd.scores = [HoleScore(hole=h["holeNumber"], par=h.get("par", 4))
                      for h in course["holes"][:rnd.holeCount]]
    from pymongo.errors import DuplicateKeyError
    try:
        await db.rounds.insert_one({**rnd.model_dump(), **ownership(request)})
    except DuplicateKeyError:
        raise HTTPException(409, "Round ID already exists; existing data was preserved")
    return rnd


@api.get("/rounds")
async def list_rounds(request: Request, status: Optional[str] = None):
    q = {**ownership(request), **({"status": status} if status else {})}
    return await db.rounds.find(q, {"_id": 0, "ownerId": 0}).sort("startedAt", -1).to_list(200)


@api.get("/rounds/{round_id}")
async def get_round(round_id: str, request: Request):
    r = await db.rounds.find_one({"id": round_id, **ownership(request)}, {"_id": 0, "ownerId": 0})
    if not r:
        raise HTTPException(404, "Round not found")
    return r


@api.put("/rounds/{round_id}")
async def update_round(round_id: str, upd: RoundUpdate, request: Request):
    fields = {k: v for k, v in upd.model_dump(exclude_none=True).items()}
    if upd.scores is not None:
        fields["scores"] = [s.model_dump() for s in upd.scores]
    if fields.get("status") == "completed" and "endedAt" not in fields:
        fields["endedAt"] = now_iso()
    res = await db.rounds.update_one({"id": round_id, **ownership(request)}, {"$set": fields})
    if res.matched_count == 0:
        raise HTTPException(404, "Round not found")
    return await db.rounds.find_one({"id": round_id, **ownership(request)}, {"_id": 0, "ownerId": 0})


@api.post("/rounds/{round_id}/track")
async def track_round(round_id: str, body: TrackBody, request: Request):
    if not await db.rounds.find_one({"id": round_id, **ownership(request)}):
        raise HTTPException(404, "Round not found")
    points = [p.model_dump() for p in body.points]
    if points:
        res = await db.rounds.update_one({"id": round_id, **ownership(request)}, {"$push": {"gpsPath": {"$each": points}}})
        if not res.matched_count:
            raise HTTPException(404, "Round not found")
    return {"ok": True}


@api.delete("/rounds/{round_id}")
async def delete_round(round_id: str, request: Request):
    result = await db.rounds.delete_one({"id": round_id, **ownership(request)})
    if not result.deleted_count:
        raise HTTPException(404, "Round not found")
    await db.shots.delete_many({"roundId": round_id, **ownership(request)})
    return {"ok": True}


# ---------- Shots ----------
@api.post("/shots")
async def create_shot(shot: Shot, request: Request):
    if shot.roundId and not await db.rounds.find_one({"id": shot.roundId, **ownership(request)}):
        raise HTTPException(404, "Round not found")
    shot.distanceMeters = round(haversine(shot.startLat, shot.startLng, shot.endLat, shot.endLng), 1)
    from pymongo.errors import DuplicateKeyError
    try:
        await db.shots.insert_one({**shot.model_dump(), **ownership(request)})
    except DuplicateKeyError:
        raise HTTPException(409, "Shot ID already exists; existing data was preserved")
    return shot


@api.get("/shots")
async def list_shots(request: Request, roundId: Optional[str] = None, club: Optional[str] = None):
    q = ownership(request)
    if roundId:
        q["roundId"] = roundId
    if club:
        q["club"] = club
    return await db.shots.find(q, {"_id": 0, "ownerId": 0}).sort("timestamp", -1).to_list(1000)


@api.delete("/shots")
async def clear_shots(request: Request):
    await db.shots.delete_many(ownership(request))
    return {"ok": True}


@api.get("/club-stats")
async def club_stats(request: Request):
    shots = await db.shots.find(ownership(request), {"_id": 0}).to_list(5000)
    by_club = {}
    for s in shots:
        if s.get("club"):
            by_club.setdefault(s["club"], []).append(s["distanceMeters"])
    out = []
    for club, dists in by_club.items():
        dists.sort()
        n = len(dists)
        trimmed = dists[max(1, n // 10):n - max(1, n // 10)] if n >= 5 else dists
        out.append({
            "club": club, "count": n,
            "medianMeters": round(statistics.median(dists), 1),
            "typicalMeters": round(statistics.mean(trimmed), 1) if trimmed else 0,
            "longestMeters": round(dists[-1], 1),
            "shortestMeters": round(dists[0], 1),
        })
    return out


# ---------- Stats ----------
@api.get("/stats")
async def stats(request: Request):
    rounds = await db.rounds.find({"status": "completed", **ownership(request)}, {"_id": 0}).sort("startedAt", -1).to_list(500)
    shots = await db.shots.find(ownership(request), {"_id": 0}).to_list(5000)
    summaries = []
    for r in rounds:
        played = [s for s in r["scores"] if s.get("score")]
        if not played:
            continue
        total = sum(s["score"] for s in played)
        par = sum(s["par"] for s in played)
        putts = sum(s.get("putts") or 0 for s in played)
        fw_holes = [s for s in played if s.get("fairway") is not None]
        gir_holes = [s for s in played if s.get("gir") is not None]
        summaries.append({
            "id": r["id"], "date": r["startedAt"], "course": r["courseName"],
            "score": total, "par": par, "toPar": total - par, "putts": putts,
            "fairwayPct": round(100 * sum(1 for s in fw_holes if s["fairway"]) / len(fw_holes)) if fw_holes else None,
            "girPct": round(100 * sum(1 for s in gir_holes if s["gir"]) / len(gir_holes)) if gir_holes else None,
        })
    driver = [s["distanceMeters"] for s in shots if s.get("club") == "Driver"]
    return {
        "roundsPlayed": len(summaries),
        "avgScore": round(statistics.mean([s["score"] for s in summaries]), 1) if summaries else None,
        "bestScore": min((s["score"] for s in summaries), default=None),
        "avgPutts": round(statistics.mean([s["putts"] for s in summaries]), 1) if summaries else None,
        "avgFairwayPct": round(statistics.mean([s["fairwayPct"] for s in summaries if s["fairwayPct"] is not None]), 1) if any(s["fairwayPct"] is not None for s in summaries) else None,
        "avgGirPct": round(statistics.mean([s["girPct"] for s in summaries if s["girPct"] is not None]), 1) if any(s["girPct"] is not None for s in summaries) else None,
        "avgDriverMeters": round(statistics.mean(driver), 1) if driver else None,
        "totalShots": len(shots),
        "recentRounds": summaries[:50],
    }


# ---------- Elevation (Open-Meteo, free, cached) ----------
_elev_cache = {}


async def fetch_elevations(points):
    keys = [(round(p[0], 4), round(p[1], 4)) for p in points]
    missing = [k for k in keys if k not in _elev_cache]
    if missing:
        lats = ",".join(str(k[0]) for k in missing)
        lngs = ",".join(str(k[1]) for k in missing)
        try:
            async with httpx.AsyncClient(timeout=8) as hc:
                r = await hc.get(f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lngs}")
                r.raise_for_status()
                elevs = r.json()["elevation"]
        except Exception:
            locs = "|".join(f"{k[0]},{k[1]}" for k in missing)
            async with httpx.AsyncClient(timeout=10) as hc:
                r = await hc.get(f"https://api.open-elevation.com/api/v1/lookup?locations={locs}")
                r.raise_for_status()
                elevs = [x["elevation"] for x in r.json()["results"]]
        for k, e in zip(missing, elevs):
            _elev_cache[k] = e
    return [_elev_cache[k] for k in keys]


@api.get("/elevation")
async def elevation(lat1: float, lng1: float, lat2: float, lng2: float):
    try:
        vals = await fetch_elevations([(lat1, lng1), (lat2, lng2)])
        return {"ball": vals[0], "target": vals[1], "diff": round(vals[1] - vals[0], 1), "available": True}
    except Exception as e:
        logger.warning(f"Elevation failed: {e}")
        return {"ball": None, "target": None, "diff": None, "available": False}


# ---------- Weather (Open-Meteo, free, cached 10 min) ----------
_weather_cache = {}


@api.get("/weather")
async def weather(lat: float, lng: float):
    key = (round(lat, 2), round(lng, 2))
    now = time.time()
    c = _weather_cache.get(key)
    if c and now - c[0] < 600:
        return c[1]
    try:
        async with httpx.AsyncClient(timeout=8) as hc:
            r = await hc.get(
                f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}"
                "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh"
            )
            r.raise_for_status()
            cur = r.json()["current"]
            out = {"available": True, "tempC": cur["temperature_2m"], "humidity": cur["relative_humidity_2m"],
                   "windSpeedKmh": cur["wind_speed_10m"], "windFromDeg": cur["wind_direction_10m"]}
    except Exception as e:
        logger.warning(f"Open-Meteo weather failed, trying wttr.in: {e}")
        try:
            async with httpx.AsyncClient(timeout=10) as hc:
                r = await hc.get(f"https://wttr.in/{lat},{lng}?format=j1", headers={"User-Agent": "curl/8"})
                r.raise_for_status()
                cur = r.json()["current_condition"][0]
                out = {"available": True, "tempC": float(cur["temp_C"]), "humidity": float(cur["humidity"]),
                       "windSpeedKmh": float(cur["windspeedKmph"]), "windFromDeg": float(cur["winddirDegree"])}
        except Exception as e2:
            logger.warning(f"Weather fallback failed: {e2}")
            return {"available": False}
    _weather_cache[key] = (now, out)
    return out


# ---------- AI Caddie ----------
@api.post("/caddie")
async def caddie(payload: dict):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "AI Caddie is not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    except ImportError:
        raise HTTPException(503, "AI Caddie integration is unavailable")
    system = (
        "You are a professional golf caddie. You receive structured, pre-calculated data. "
        "NEVER invent, recalculate, or change any distance/elevation/wind values - use them exactly as given. "
        "Give concise, practical strategy advice (club choice reasoning, hazard carry strategy, target line, miss side). "
        "Max 120 words. Plain text, no markdown headers."
    )
    chat = LlmChat(api_key=key, session_id=f"caddie-{uid()}", system_message=system).with_model("openai", "gpt-5.4-mini")
    msg = UserMessage(text=f"Here is my shot situation as structured data:\n{json.dumps(payload, indent=2)}\nWhat is your advice?")

    async def gen():
        try:
            async for ev in chat.stream_message(msg):
                if isinstance(ev, TextDelta):
                    yield f"data: {json.dumps({'t': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Caddie AI failed: {e}")
            yield f"data: {json.dumps({'error': 'AI Caddie temporarily unavailable'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- Privacy ----------
@api.delete("/data/all")
async def delete_all_data(request: Request):
    await db.rounds.delete_many(ownership(request))
    await db.shots.delete_many(ownership(request))
    await db.golf_saved_courses.delete_many(ownership(request))
    return {"ok": True}


# ---------- Demo course seed (Davao City, Philippines - simulated coordinates) ----------
DEMO_PARS = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4]
DEMO_HCP = [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 16, 2, 6, 10, 4, 18, 12, 14]


def build_demo_course():
    base_lat, base_lng = 7.0520, 125.5170
    holes = []
    for i, par in enumerate(DEMO_PARS):
        brg = (i * 20) % 360
        ring = 300 + (i % 3) * 250
        tee_lat, tee_lng = dest(base_lat, base_lng, brg, ring)
        hole_brg = (brg + 90) % 360
        length = {3: 155, 4: 350, 5: 470}[par]
        gc_lat, gc_lng = dest(tee_lat, tee_lng, hole_brg, length)
        gf_lat, gf_lng = dest(tee_lat, tee_lng, hole_brg, length - 14)
        gb_lat, gb_lng = dest(tee_lat, tee_lng, hole_brg, length + 14)
        hazards = []
        if par >= 4:
            hz_lat, hz_lng = dest(tee_lat, tee_lng, (hole_brg + 6) % 360, length - 55)
            cr_lat, cr_lng = dest(tee_lat, tee_lng, (hole_brg + 6) % 360, length - 35)
            hazards.append(Hazard(name="Greenside Bunker", type="BUNKER", lat=hz_lat, lng=hz_lng,
                                  carryLat=cr_lat, carryLng=cr_lng))
        if i in (4, 12):
            w_lat, w_lng = dest(tee_lat, tee_lng, hole_brg, 200)
            wc_lat, wc_lng = dest(tee_lat, tee_lng, hole_brg, 235)
            hazards.append(Hazard(name="Water Hazard", type="WATER", lat=w_lat, lng=w_lng,
                                  carryLat=wc_lat, carryLng=wc_lng))
        if i in (3, 16):
            f_lat, f_lng = dest(tee_lat, tee_lng, hole_brg, 230)
            hazards.append(Hazard(name="Fairway Bunker", type="BUNKER", lat=f_lat, lng=f_lng))
        holes.append(Hole(holeNumber=i + 1, par=par, handicap=DEMO_HCP[i],
                          tee=LatLng(lat=tee_lat, lng=tee_lng),
                          greenFront=LatLng(lat=gf_lat, lng=gf_lng),
                          greenCenter=LatLng(lat=gc_lat, lng=gc_lng),
                          greenBack=LatLng(lat=gb_lat, lng=gb_lng),
                          hazards=hazards))
    return Course(id="demo-apo-davao", name="Apo Highlands Demo (DEMO DATA)",
                  location="Davao City, Philippines (simulated coordinates)",
                  latitude=base_lat, longitude=base_lng, holeCount=18, isDemo=True, holes=holes,
                  clubhouse=_ll(dest(base_lat, base_lng, 0, 60)),
                  drivingRange=_ll(dest(base_lat, base_lng, 300, 140)),
                  practiceGreen=_ll(dest(base_lat, base_lng, 45, 90)),
                  parking=_ll(dest(base_lat, base_lng, 180, 120)))


def _ll(t):
    return LatLng(lat=t[0], lng=t[1])


# ---------- Generic simulated layout generator (used by every course) ----------
# City-level pins (from the directory) have no per-hole geometry. To make Course
# Navigation and all on-course features work everywhere, we synthesise a
# consistent layout (tees, F/C/B greens, a greenside bunker + the 4 POIs) around
# the course pin — the same technique as the Apo demo. Simulated, not surveyed.
PAR18 = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 5, 3, 4, 4, 3, 5, 4]
HCP18 = [7, 11, 3, 1, 15, 17, 5, 13, 9, 8, 12, 4, 2, 16, 18, 6, 14, 10]
HCP9 = [3, 7, 1, 5, 9, 2, 8, 4, 6]


def default_pars(n):
    return [PAR18[i] if i < len(PAR18) else 4 for i in range(n)]


def default_hcps(n):
    if n == 9:
        return [HCP9[i] if i < len(HCP9) else i + 1 for i in range(n)]
    return [HCP18[i] if i < len(HCP18) else i + 1 for i in range(n)]


def build_layout(base_lat, base_lng, n, pars=None, hcps=None):
    dp, dh = default_pars(n), default_hcps(n)
    pars = list(pars or [])[:n] + dp[len(pars or []):] if pars else dp
    hcps = list(hcps or [])[:n] + dh[len(hcps or []):] if hcps else dh
    holes = []
    for i in range(n):
        par = pars[i] or 4
        brg = (i * 20) % 360
        ring = 300 + (i % 3) * 250
        tee_lat, tee_lng = dest(base_lat, base_lng, brg, ring)
        hole_brg = (brg + 90) % 360
        length = {3: 155, 4: 350, 5: 470}.get(par, 350)
        gc = dest(tee_lat, tee_lng, hole_brg, length)
        gf = dest(tee_lat, tee_lng, hole_brg, length - 14)
        gb = dest(tee_lat, tee_lng, hole_brg, length + 14)
        hazards = []
        if par >= 4:
            hz = dest(tee_lat, tee_lng, (hole_brg + 6) % 360, length - 55)
            cr = dest(tee_lat, tee_lng, (hole_brg + 6) % 360, length - 35)
            hazards.append(Hazard(name="Greenside Bunker", type="BUNKER", lat=hz[0], lng=hz[1],
                                  carryLat=cr[0], carryLng=cr[1]))
        if par == 5:
            w = dest(tee_lat, tee_lng, hole_brg, length - 130)
            wc = dest(tee_lat, tee_lng, hole_brg, length - 95)
            hazards.append(Hazard(name="Fairway Water", type="WATER", lat=w[0], lng=w[1],
                                  carryLat=wc[0], carryLng=wc[1]))
        holes.append(Hole(holeNumber=i + 1, par=par, handicap=hcps[i] if i < len(hcps) else i + 1,
                          tee=LatLng(lat=tee_lat, lng=tee_lng),
                          greenFront=_ll(gf), greenCenter=_ll(gc), greenBack=_ll(gb),
                          hazards=hazards))
    pois = {
        "clubhouse": _ll(dest(base_lat, base_lng, 0, 60)),
        "drivingRange": _ll(dest(base_lat, base_lng, 300, 140)),
        "practiceGreen": _ll(dest(base_lat, base_lng, 45, 90)),
        "parking": _ll(dest(base_lat, base_lng, 180, 120)),
    }
    return holes, pois


@app.on_event("startup")
async def seed():
    if db is None:
        logger.warning("Golf database not configured; readiness returns 503")
        return
    await create_indexes(db)
    if await bootstrap_account(db, os.environ):
        logger.info("Explicit fresh-database golf account bootstrap completed; remove bootstrap secrets after verification")
    if os.environ.get("ENABLE_DEMO_COURSE_SEED") == "true" and not await db.courses.find_one({"id": "demo-apo-davao"}):
        await db.courses.insert_one(build_demo_course().model_dump())
        logger.info("Seeded explicitly enabled simulated demo")
    # Geocode + layout backfill runs in the background so startup isn't held open
    # for external Nominatim calls (rate-limited to <=1 req/sec).
    # No automatic course geometry backfill or remote geocoding on startup.


async def backfill_layouts():
    """Retained compatibility hook. Existing records are deliberately untouched."""
    return


app.include_router(auth_router)
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[s.strip() for s in os.environ.get('CORS_ORIGINS', '').split(',') if s.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if client is not None:
        client.close()
