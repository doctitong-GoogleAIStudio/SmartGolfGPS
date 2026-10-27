"""HTTP tests against the real ASGI app with an isolated async Mongo mock."""
import hashlib
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from mongomock_motor import AsyncMongoMockClient
with patch.dict(os.environ, {"MONGO_URL": "mongodb://127.0.0.1:27017", "DB_NAME": "isolated_unit_tests"}):
    import server  # Never import using a real deployment URI from the caller or .env.
from auth import create_indexes, password_hash, password_matches


class AuthenticatedApiTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = "test-only-long-password"
        cls.encoded = password_hash(cls.password)

    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient(tz_aware=True).golf_tests
        self.original_db = server.db
        server.db = self.db
        server.app.state.golf_db = self.db
        await create_indexes(self.db)
        for name, role in (("a", "player"), ("b", "player"), ("editor", "editor")):
            await self.db.golf_users.insert_one({"id": name, "email": f"{name}@example.test", "name": name,
                                                  "role": role, "passwordHash": self.encoded})
            await self.db.golf_api_tokens.insert_one({"userId": name, "tokenHash": hashlib.sha256(f"test-{name}".encode()).hexdigest(),
                                                       "expiresAt": datetime.now(timezone.utc) + timedelta(days=1)})
        await self.db.courses.insert_one({"id": "course", "name": "Synthetic test course", "holes": [{"holeNumber": 1, "par": 4}]})
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://golf.example.test")

    async def asyncTearDown(self):
        await self.client.aclose()
        server.db = self.original_db
        server.app.state.golf_db = self.original_db

    async def request(self, method, path, user="a", **kwargs):
        return await self.client.request(method, "/api" + path, headers={"Authorization": f"Bearer test-{user}"}, **kwargs)

    async def round(self, user="a", id="round"):
        r = await self.request("POST", "/rounds", user, json={"id": id, "courseId": "course", "holeCount": 9, "ownerId": "attacker"})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    async def test_directory_is_public_without_exposing_private_courses(self):
        result = await self.client.get("/api/courses/directory")
        self.assertEqual(result.status_code, 200)
        self.assertGreater(len(result.json()), 90)
        self.assertTrue(all("holes" not in row for row in result.json()))
        self.assertEqual((await self.client.get("/api/courses")).status_code, 401)

    async def test_registration_creates_only_player_and_requires_explicit_login(self):
        body = {"name": " New Golfer ", "email": " NEW@EXAMPLE.TEST ", "password": self.password, "role": "editor"}
        result = await self.client.post("/api/auth/register", json=body)
        self.assertEqual(result.status_code, 201, result.text)
        self.assertNotIn("token", result.json())
        row = await self.db.golf_users.find_one({"email": "new@example.test"})
        self.assertEqual(row["name"], "New Golfer")
        self.assertEqual(row["role"], "player")
        self.assertTrue(password_matches(self.password, row["passwordHash"]))
        self.assertNotIn(self.password, result.text)
        self.assertEqual((await self.client.post("/api/auth/register", json=body)).status_code, 409)
        login = await self.client.post("/api/auth/token", json={"email": body["email"], "password": self.password, "deviceName": "Test"})
        self.assertEqual(login.status_code, 200)
        headers = {"Authorization": "Bearer " + login.json()["token"]}
        self.assertEqual((await self.client.post("/api/courses", json={"name": "Forbidden"}, headers=headers)).status_code, 403)
        self.assertEqual((await self.client.get("/api/rounds", headers=headers)).json(), [])

    async def test_registration_validation_redacts_input_and_limits_attempts(self):
        for body in ({"name": " ", "email": "bad", "password": self.password},
                     {"name": "Test", "email": "test@example.test", "password": "tiny-Pw7!"}):
            response = await self.client.post("/api/auth/register", json=body)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(body["password"], response.text)
        import auth
        for _ in range(10):
            await auth._limit(self.db, "register-ip:127.0.0.1", 100)
        response = await self.client.post("/api/auth/register", json={"name": "Test", "email": "limited@example.test", "password": self.password})
        self.assertEqual(response.status_code, 429)
        self.assertIsNone(await self.db.golf_users.find_one({"email": "limited@example.test"}))


    async def test_private_routes_require_authentication(self):
        for method, path in (("GET", "/courses"), ("GET", "/rounds"), ("GET", "/shots"), ("GET", "/stats"),
                             ("GET", "/bag"), ("GET", "/settings"), ("DELETE", "/data/all"), ("GET", "/tools/activation-generator")):
            self.assertEqual((await self.client.request(method, "/api" + path)).status_code, 401)

    async def test_login_hashes_token_and_logout_revokes_only_current_session(self):
        result = await self.client.post("/api/auth/token", json={"email": " A@EXAMPLE.TEST ", "password": self.password, "deviceName": "Test device"})
        self.assertEqual(result.status_code, 200, result.text)
        token = result.json()["token"]
        row = await self.db.golf_api_tokens.find_one({"tokenHash": hashlib.sha256(token.encode()).hexdigest()})
        self.assertEqual(row["userId"], "a")
        self.assertNotIn(token, str(row))
        headers = {"Authorization": "Bearer " + token}
        self.assertEqual((await self.client.delete("/api/auth/token", headers=headers)).status_code, 200)
        self.assertEqual((await self.client.get("/api/rounds", headers=headers)).status_code, 401)
        self.assertEqual((await self.request("GET", "/rounds")).status_code, 200)

    async def test_passwords_are_salted_and_invalid_passwords_fail(self):
        self.assertTrue(password_matches(self.password, self.encoded))
        self.assertFalse(password_matches("wrong", self.encoded))
        self.assertFalse(password_matches(self.password, "malformed"))
        self.assertNotEqual(self.encoded, password_hash(self.password))
        result = await self.client.post("/api/auth/token", json={"email": "a@example.test", "password": "wrong", "deviceName": "Test"})
        self.assertEqual(result.status_code, 401)

    async def test_expired_tokens_and_disabled_users_fail(self):
        await self.db.golf_api_tokens.update_many({"userId": "a"}, {"$set": {"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)}})
        self.assertEqual((await self.request("GET", "/rounds")).status_code, 401)
        await self.db.golf_users.update_one({"id": "b"}, {"$set": {"disabled": True}})
        self.assertEqual((await self.request("GET", "/rounds", "b")).status_code, 401)

    async def test_login_rate_limit_is_shared_in_database(self):
        import auth
        key = "pair:127.0.0.1:a@example.test"
        for _ in range(10):
            await auth._limit(self.db, key, 10)
        with self.assertRaises(Exception) as error:
            await auth._limit(self.db, key, 10)
        self.assertEqual(error.exception.status_code, 429)

    async def test_round_reads_updates_tracks_deletes_are_owned(self):
        await self.round()
        self.assertEqual((await self.db.rounds.find_one({"id": "round"}))["ownerId"], "a")
        self.assertEqual((await self.request("GET", "/rounds", "b")).json(), [])
        for method, body in (("GET", None), ("PUT", {"currentHole": 2}), ("DELETE", None)):
            args = {"json": body} if body is not None else {}
            self.assertEqual((await self.request(method, "/rounds/round", "b", **args)).status_code, 404)
        response = await self.request("POST", "/rounds/round/track", "b", json={"points": [{"lat": 1, "lng": 2, "t": 1}]})
        self.assertEqual(response.status_code, 404)
        self.assertIsNotNone(await self.db.rounds.find_one({"id": "round", "ownerId": "a"}))

    async def test_duplicate_ids_preserve_existing_round(self):
        await self.round()
        response = await self.request("POST", "/rounds", json={"id": "round", "courseId": "course"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(await self.db.rounds.count_documents({"id": "round", "ownerId": "a"}), 1)

    async def test_bag_and_settings_are_per_account_and_preserve_legacy_defaults(self):
        await self.db.bags.insert_one({"id": "default", "clubs": [{"name": "Legacy"}]})
        await self.db.settings.insert_one({"id": "default", "distanceUnit": "m"})
        self.assertEqual((await self.request("PUT", "/bag", json={"clubs": [{"name": "Private club", "carry": 80}]})).status_code, 200)
        self.assertNotEqual((await self.request("GET", "/bag", "b")).json()["clubs"][0]["name"], "Private club")
        await self.request("PUT", "/settings", json={"distanceUnit": "m"})
        self.assertEqual((await self.request("GET", "/settings", "b")).json()["distanceUnit"], "yd")
        self.assertEqual((await self.db.bags.find_one({"ownerId": {"$exists": False}}))["clubs"][0]["name"], "Legacy")
        self.assertEqual((await self.db.settings.find_one({"ownerId": {"$exists": False}}))["distanceUnit"], "m")

    async def test_shots_cannot_reference_another_accounts_round(self):
        await self.round()
        shot = {"roundId": "round", "startLat": 1, "startLng": 2, "endLat": 1.001, "endLng": 2}
        self.assertEqual((await self.request("POST", "/shots", "b", json=shot)).status_code, 404)
        self.assertEqual((await self.request("POST", "/shots", json=shot)).status_code, 200)
        self.assertEqual((await self.request("GET", "/shots", "b")).json(), [])
        self.assertEqual((await self.request("GET", "/club-stats", "b")).json(), [])

    async def test_privacy_deletion_preserves_other_accounts_and_unassigned_records(self):
        for owner in ("a", "b", None):
            record = {"id": "private-" + str(owner), **({"ownerId": owner} if owner else {})}
            await self.db.rounds.insert_one(record.copy())
            await self.db.shots.insert_one(record.copy())
        self.assertEqual((await self.request("DELETE", "/data/all")).status_code, 200)
        for collection in (self.db.rounds, self.db.shots):
            self.assertEqual(await collection.count_documents({"ownerId": "a"}), 0)
            self.assertEqual(await collection.count_documents({"ownerId": "b"}), 1)
            self.assertEqual(await collection.count_documents({"ownerId": {"$exists": False}}), 1)

    async def test_course_edits_and_activation_tool_require_editor_role(self):
        for method, path, body in (("POST", "/courses", {"name": "Forbidden"}), ("DELETE", "/courses/course", None),
                                   ("POST", "/courses/geocode-all", None), ("GET", "/tools/activation-generator", None)):
            kwargs = {"json": body} if body else {}
            self.assertEqual((await self.request(method, path, **kwargs)).status_code, 403)
        response = await self.request("POST", "/courses", "editor", json={"name": "Unmapped", "role": "editor", "latitude": 0, "longitude": 0})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(all(h["tee"] is None for h in response.json()["holes"]))

    async def test_readiness_does_not_disclose_configuration(self):
        server.db = None
        response = await self.client.get("/api/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["service"], "smart-golf-gps")
        self.assertNotIn("MONGO_URL", response.text)

    async def test_tracking_rejects_invalid_points_and_oversized_batches_without_truncation(self):
        await self.round()
        for points in ([{"lat": 91, "lng": 2, "t": 1}], [{"lat": 0, "lng": 0, "t": 1}] * 201):
            response = await self.request("POST", "/rounds/round/track", json={"points": points})
            self.assertEqual(response.status_code, 422)
        self.assertEqual((await self.db.rounds.find_one({"id": "round"}))["gpsPath"], [])

    async def test_stats_and_shot_deletion_are_scoped(self):
        await self.db.shots.insert_one({"id": "a-shot", "ownerId": "a", "distanceMeters": 150, "club": "Driver"})
        await self.db.shots.insert_one({"id": "b-shot", "ownerId": "b", "distanceMeters": 250, "club": "Driver"})
        self.assertEqual((await self.request("GET", "/stats")).json()["avgDriverMeters"], 150)
        self.assertEqual((await self.request("GET", "/stats", "b")).json()["avgDriverMeters"], 250)
        await self.request("DELETE", "/shots")
        self.assertEqual(await self.db.shots.count_documents({"ownerId": "b"}), 1)

    async def test_validation_errors_do_not_echo_passwords(self):
        password = "private-test-value" * 100
        result = await self.client.post("/api/auth/token", json={"email": "a@example.test", "password": password, "deviceName": "Test"})
        self.assertEqual(result.status_code, 422)
        self.assertNotIn(password, result.text)
        self.assertEqual(result.headers["cache-control"], "no-store")

    async def test_bootstrap_is_explicit_and_never_overwrites_accounts_or_legacy_data(self):
        from auth import bootstrap_account
        empty = AsyncMongoMockClient().fresh_tests
        await create_indexes(empty)
        config = {"GOLF_BOOTSTRAP_ENABLED": "true", "GOLF_BOOTSTRAP_EMAIL": "first@example.test",
                  "GOLF_BOOTSTRAP_PASSWORD": self.password, "GOLF_BOOTSTRAP_NAME": "First player", "GOLF_BOOTSTRAP_ROLE": "editor"}
        self.assertFalse(await bootstrap_account(empty, {}))
        self.assertTrue(await bootstrap_account(empty, config))
        user = await empty.golf_users.find_one({})
        self.assertTrue(password_matches(self.password, user["passwordHash"]))
        self.assertEqual(user["role"], "editor")
        config["GOLF_BOOTSTRAP_PASSWORD"] = "another-test-password"
        self.assertFalse(await bootstrap_account(empty, config))
        self.assertEqual((await empty.golf_users.find_one({}))["passwordHash"], user["passwordHash"])
        self.assertFalse(await bootstrap_account(self.db, config))


if __name__ == "__main__":
    unittest.main()
