"""Mobile bearer authentication. Player registration with no legacy data claiming."""
import asyncio
import hashlib
import hmac
import secrets
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/api/auth")
bearer = HTTPBearer(auto_error=False)
ITERATIONS = 600_000
TOKEN_DAYS = 30
_DUMMY = f"pbkdf2_sha256${ITERATIONS}$" + "00" * 16 + "$" + "00" * 32


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    try:
        algo, rounds, salt, digest = encoded.split("$")
        if algo != "pbkdf2_sha256" or not 600_000 <= int(rounds) <= 2_000_000:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(actual.hex(), digest)
    except (ValueError, TypeError):
        return False


def database(request: Request):
    db = request.app.state.golf_db
    if db is None:
        raise HTTPException(503, "Golf database is not configured")
    return db


async def authenticate(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None or credentials.scheme.lower() != "bearer" or len(credentials.credentials) > 512:
        raise HTTPException(401, "Sign in to the golf service", headers={"WWW-Authenticate": "Bearer"})
    db = database(request)
    hashed = hashlib.sha256(credentials.credentials.encode()).hexdigest()
    token = await db.golf_api_tokens.find_one({"tokenHash": hashed, "expiresAt": {"$gt": datetime.now(timezone.utc)}})
    user = await db.golf_users.find_one({"id": token["userId"], "disabled": {"$ne": True}}) if token else None
    if user is None:
        raise HTTPException(401, "Session expired or revoked", headers={"WWW-Authenticate": "Bearer"})
    request.state.golf_user = user
    request.state.golf_token_hash = hashed
    return user


async def editor(user=Depends(authenticate)):
    if user.get("role") != "editor":
        raise HTTPException(403, "An authorized course editor is required")
    return user


def ownership(request: Request) -> dict:
    return {"ownerId": request.state.golf_user["id"]}


async def _limit(db, key: str, maximum: int):
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // 900
    bucket = hashlib.sha256(f"{window}:{key}".encode()).hexdigest()
    row = await db.golf_login_limits.find_one_and_update(
        {"_id": bucket}, {"$inc": {"attempts": 1}, "$setOnInsert": {"expiresAt": now + timedelta(minutes=30)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    if row["attempts"] > maximum:
        raise HTTPException(429, "Too many sign-in attempts. Try again later.", headers={"Retry-After": "900"})


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    deviceName: str = Field(min_length=1, max_length=120)


class Registration(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=1024)


@router.post("/register", status_code=201)
async def register(body: Registration, request: Request):
    db = database(request)
    address = request.client.host if request.client else "unknown"
    await _limit(db, f"register-ip:{address}", 10)
    email = body.email.strip().casefold()
    name = body.name.strip()
    if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(422, "Enter a name and valid email address")
    # Always player: never trust a submitted role or claim legacy records.
    user = {"id": str(uuid.uuid4()), "email": email, "name": name, "role": "player",
            "passwordHash": await asyncio.to_thread(password_hash, body.password),
            "createdAt": datetime.now(timezone.utc)}
    try:
        await db.golf_users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(409, "An account already uses this email. Sign in instead.") from None
    # Registration does not issue a token. Sign-in is explicit, including after a timeout.
    return {"ok": True}


@router.post("/token")
async def login(body: Login, request: Request):
    db = database(request)
    email = body.email.strip().casefold()
    address = request.client.host if request.client else "unknown"
    # Proxy headers are trusted only when Uvicorn is configured with the host's actual proxy ranges.
    await _limit(db, f"ip:{address}", 50)
    await _limit(db, f"pair:{address}:{email}", 10)
    user = await db.golf_users.find_one({"email": email})
    valid = await asyncio.to_thread(password_matches, body.password, user.get("passwordHash", _DUMMY) if user else _DUMMY)
    if not valid or not user or user.get("disabled"):
        raise HTTPException(401, "Email or password is incorrect")
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    await db.golf_api_tokens.insert_one({
        "tokenHash": hashlib.sha256(token.encode()).hexdigest(), "userId": user["id"],
        "deviceName": body.deviceName, "expiresAt": expires,
    })
    return {"token": token, "tokenType": "Bearer", "expiresAt": expires.isoformat(),
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@router.get("/me")
async def current_account(user=Depends(authenticate)):
    # Read current server role; never disclose hashes, tokens or bootstrap settings.
    return {"id": user["id"], "name": user["name"], "email": user["email"],
            "role": "editor" if user.get("role") == "editor" else "player"}


@router.delete("/token")
async def logout(request: Request, user=Depends(authenticate)):
    await database(request).golf_api_tokens.delete_one({"tokenHash": request.state.golf_token_hash, "userId": user["id"]})
    return {"ok": True}


async def create_indexes(db):
    await db.golf_users.create_index("email", unique=True)
    await db.golf_users.create_index("id", unique=True)
    await db.golf_api_tokens.create_index("tokenHash", unique=True)
    await db.golf_api_tokens.create_index("expiresAt", expireAfterSeconds=0)
    await db.golf_login_limits.create_index("expiresAt", expireAfterSeconds=0)
    await db.golf_saved_courses.create_index([("ownerId", 1), ("courseId", 1)], unique=True)
    # Partial indexes leave unassigned legacy records untouched.
    for name in ("rounds", "shots", "bags", "settings"):
        await db[name].create_index([("ownerId", 1), ("id", 1)], unique=True,
                                    partialFilterExpression={"ownerId": {"$type": "string"}})


async def bootstrap_account(db, config):
    """Explicit, one-time provisioning for a fresh database on noninteractive hosts."""
    if config.get("GOLF_BOOTSTRAP_ENABLED") != "true" or await db.golf_users.count_documents({}):
        return False
    email = config.get("GOLF_BOOTSTRAP_EMAIL", "").strip().casefold()
    password = config.get("GOLF_BOOTSTRAP_PASSWORD", "")
    name = config.get("GOLF_BOOTSTRAP_NAME", "Golfer").strip()
    role = config.get("GOLF_BOOTSTRAP_ROLE", "player")
    if "@" not in email or len(email) > 320 or not 12 <= len(password) <= 1024 or not name or role not in ("player", "editor"):
        raise ValueError("Fresh-database bootstrap needs a valid email, 12+ character password, name and player/editor role")
    encoded = await asyncio.to_thread(password_hash, password)
    from pymongo.errors import DuplicateKeyError
    try:
        await db.golf_users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": name,
                                        "passwordHash": encoded, "role": role})
    except DuplicateKeyError:
        return False
    return True
