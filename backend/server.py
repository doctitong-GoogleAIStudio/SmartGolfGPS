import os
import time
import uuid
import math
import json
import logging
import statistics
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from ph_courses import PH_COURSES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("golf")

R_EARTH = 6371000.0


def uid():
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R_EARTH * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def dest(lat, lon, bearing_deg, dist_m):
    br = math.radians(bearing_deg)
    d = dist_m / R_EARTH
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(br))
    l2 = l1 + math.atan2(math.sin(br) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return round(math.degrees(p2), 7), round(math.degrees(l2), 7)


# ---------- Models ----------
class LatLng(BaseModel):
    lat: float
    lng: float


class Hazard(BaseModel):
    id: str = Field(default_factory=uid)
    name: str = ""
    type: str = "BUNKER"
    lat: float
    lng: float
    carryLat: Optional[float] = None
    carryLng: Optional[float] = None


class Hole(BaseModel):
    holeNumber: int
    par: int = 4
    handicap: Optional[int] = None
    tee: Optional[LatLng] = None
    greenFront: Optional[LatLng] = None
    greenCenter: Optional[LatLng] = None
    greenBack: Optional[LatLng] = None
    hazards: List[Hazard] = []


class Course(BaseModel):
    id: str = Field(default_factory=uid)
    name: str
    location: str = ""
    latitude: float
    longitude: float
    holeCount: int = 18
    isDemo: bool = False
    holes: List[Hole] = []
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
    startLat: float
    startLng: float
    endLat: float
    endLng: float
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
    return await db.courses.find({}, {"_id": 0}).to_list(200)


@api.post("/courses")
async def create_course(course: Course):
    if not course.holes:
        # Sensible default par layout so scorecards work before mapping.
        # Standard par-72 front/back nine; par-36 for a 9-hole course.
        preset = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 5, 3, 4, 4, 3, 5, 4]
        course.holes = [
            Hole(holeNumber=i + 1, par=preset[i] if i < len(preset) else 4, handicap=i + 1)
            for i in range(course.holeCount)
        ]
    await db.courses.insert_one(course.model_dump())
    return course


@api.get("/courses/directory")
async def courses_directory():
    """Browsable catalog of major Philippine golf courses (for import)."""
    return PH_COURSES


@api.get("/courses/{course_id}")
async def get_course(course_id: str):
    c = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Course not found")
    return c


@api.put("/courses/{course_id}")
async def update_course(course_id: str, course: Course):
    course.id = course_id
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if existing and not course.shareCode:
        course.shareCode = existing.get("shareCode")  # never lose an issued code on edit
    res = await db.courses.replace_one({"id": course_id}, course.model_dump())
    if res.matched_count == 0:
        raise HTTPException(404, "Course not found")
    return course


@api.delete("/courses/{course_id}")
async def delete_course(course_id: str):
    await db.courses.delete_one({"id": course_id})
    return {"ok": True}


def _new_share_code():
    # Unambiguous chars (no O/0/I/1).
    import random
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


@api.post("/courses/{course_id}/share")
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


@api.post("/courses/import")
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


@api.get("/tools/activation-generator")
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
async def get_bag():
    b = await db.bags.find_one({"id": "default"}, {"_id": 0})
    if not b:
        b = default_bag().model_dump()
        await db.bags.insert_one({**b})
    b.pop("_id", None)
    return b


@api.put("/bag")
async def update_bag(bag: Bag):
    bag.id = "default"
    await db.bags.replace_one({"id": "default"}, bag.model_dump(), upsert=True)
    return bag


# ---------- Settings ----------
@api.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = Settings().model_dump()
        await db.settings.insert_one({**s})
    s.pop("_id", None)
    return s


@api.put("/settings")
async def update_settings(s: Settings):
    s.id = "default"
    await db.settings.replace_one({"id": "default"}, s.model_dump(), upsert=True)
    return s


# ---------- Rounds ----------
@api.post("/rounds")
async def create_round(rnd: Round):
    course = await db.courses.find_one({"id": rnd.courseId}, {"_id": 0})
    if course:
        rnd.courseName = course["name"]
        rnd.scores = [HoleScore(hole=h["holeNumber"], par=h.get("par", 4))
                      for h in course["holes"][:rnd.holeCount]]
    await db.rounds.insert_one(rnd.model_dump())
    return rnd


@api.get("/rounds")
async def list_rounds(status: Optional[str] = None):
    q = {"status": status} if status else {}
    return await db.rounds.find(q, {"_id": 0}).sort("startedAt", -1).to_list(200)


@api.get("/rounds/{round_id}")
async def get_round(round_id: str):
    r = await db.rounds.find_one({"id": round_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Round not found")
    return r


@api.put("/rounds/{round_id}")
async def update_round(round_id: str, upd: RoundUpdate):
    fields = {k: v for k, v in upd.model_dump(exclude_none=True).items()}
    if upd.scores is not None:
        fields["scores"] = [s.model_dump() for s in upd.scores]
    if fields.get("status") == "completed" and "endedAt" not in fields:
        fields["endedAt"] = now_iso()
    res = await db.rounds.update_one({"id": round_id}, {"$set": fields})
    if res.matched_count == 0:
        raise HTTPException(404, "Round not found")
    return await db.rounds.find_one({"id": round_id}, {"_id": 0})


@api.post("/rounds/{round_id}/track")
async def track_round(round_id: str, body: dict):
    points = body.get("points", [])
    if points:
        await db.rounds.update_one({"id": round_id}, {"$push": {"gpsPath": {"$each": points[:200]}}})
    return {"ok": True}


@api.delete("/rounds/{round_id}")
async def delete_round(round_id: str):
    await db.rounds.delete_one({"id": round_id})
    await db.shots.delete_many({"roundId": round_id})
    return {"ok": True}


# ---------- Shots ----------
@api.post("/shots")
async def create_shot(shot: Shot):
    shot.distanceMeters = round(haversine(shot.startLat, shot.startLng, shot.endLat, shot.endLng), 1)
    await db.shots.insert_one(shot.model_dump())
    return shot


@api.get("/shots")
async def list_shots(roundId: Optional[str] = None, club: Optional[str] = None):
    q = {}
    if roundId:
        q["roundId"] = roundId
    if club:
        q["club"] = club
    return await db.shots.find(q, {"_id": 0}).sort("timestamp", -1).to_list(1000)


@api.delete("/shots")
async def clear_shots():
    await db.shots.delete_many({})
    return {"ok": True}


@api.get("/club-stats")
async def club_stats():
    shots = await db.shots.find({}, {"_id": 0}).to_list(5000)
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
async def stats():
    rounds = await db.rounds.find({"status": "completed"}, {"_id": 0}).sort("startedAt", -1).to_list(500)
    shots = await db.shots.find({}, {"_id": 0}).to_list(5000)
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
        "recentRounds": summaries[:10],
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
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    key = os.environ.get("EMERGENT_LLM_KEY")
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
async def delete_all_data():
    await db.rounds.delete_many({})
    await db.shots.delete_many({})
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
                  latitude=base_lat, longitude=base_lng, holeCount=18, isDemo=True, holes=holes)


@app.on_event("startup")
async def seed():
    if not await db.courses.find_one({"id": "demo-apo-davao"}):
        await db.courses.insert_one(build_demo_course().model_dump())
        logger.info("Seeded demo course")
    if not await db.bags.find_one({"id": "default"}):
        await db.bags.insert_one(default_bag().model_dump())
    if not await db.settings.find_one({"id": "default"}):
        await db.settings.insert_one(Settings().model_dump())


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
