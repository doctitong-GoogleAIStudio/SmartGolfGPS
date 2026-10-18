"""Run privately on the server. Prompts for a password; never accepts one on the command line."""
import argparse
import asyncio
import getpass
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from auth import create_indexes, password_hash


async def main():
    args = argparse.ArgumentParser(description="Create a golf API account without changing existing records")
    args.add_argument("email")
    args.add_argument("--name", required=True)
    args.add_argument("--editor", action="store_true", help="Grant course mapping privileges")
    opts = args.parse_args()
    email = opts.email.strip().casefold()
    if "@" not in email or len(email) > 320 or not opts.name.strip():
        raise SystemExit("Supply a valid email and display name")
    password = getpass.getpass("New account password (12+ characters): ")
    if len(password) < 12 or len(password) > 1024 or password != getpass.getpass("Confirm password: "):
        raise SystemExit("Password requirements or confirmation did not match")
    load_dotenv(Path(__file__).parent / ".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    try:
        db = client[os.environ["DB_NAME"]]
        await create_indexes(db)
        if await db.golf_users.find_one({"email": email}):
            raise SystemExit("Account already exists; no password or role was changed")
        await db.golf_users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": opts.name.strip(),
                                        "passwordHash": password_hash(password), "role": "editor" if opts.editor else "player"})
        print("Account created. Existing rounds, shots, settings and activation were not migrated.")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
