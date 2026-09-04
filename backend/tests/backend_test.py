"""Backend API tests for Smart Golf GPS & AI Caddie."""
import os
import math
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Courses ----------
class TestCourses:
    def test_list_courses_has_demo(self, s):
        r = s.get(f"{API}/courses", timeout=15)
        assert r.status_code == 200
        courses = r.json()
        demo = next((c for c in courses if c["id"] == "demo-apo-davao"), None)
        assert demo is not None, "demo-apo-davao not seeded"
        assert demo["name"] == "Apo Highlands Demo (DEMO DATA)"
        assert demo["holeCount"] == 18
        assert len(demo["holes"]) == 18
        h1 = demo["holes"][0]
        for k in ("tee", "greenFront", "greenCenter", "greenBack"):
            assert h1[k] is not None
            assert "lat" in h1[k] and "lng" in h1[k]
        # at least one hazard exists on par 4/5 holes
        assert any(h["hazards"] for h in demo["holes"])

    def test_demo_course_has_pois(self, s):
        """Phase 1 addition: clubhouse/drivingRange/practiceGreen/parking seeded on demo course."""
        r = s.get(f"{API}/courses/demo-apo-davao", timeout=15)
        assert r.status_code == 200
        demo = r.json()
        for k in ("clubhouse", "drivingRange", "practiceGreen", "parking"):
            assert k in demo, f"POI {k} missing from demo course"
            assert demo[k] is not None, f"POI {k} is null"
            assert "lat" in demo[k] and "lng" in demo[k], f"POI {k} missing lat/lng"
            assert isinstance(demo[k]["lat"], (int, float))
            assert isinstance(demo[k]["lng"], (int, float))
        assert len(demo["holes"]) == 18

    def test_course_crud(self, s):
        payload = {"name": "TEST_Course_X", "location": "Nowhere", "latitude": 1.0, "longitude": 2.0, "holeCount": 9}
        r = s.post(f"{API}/courses", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        cid = created["id"]
        assert len(created["holes"]) == 9  # auto-filled
        # get
        r = s.get(f"{API}/courses/{cid}")
        assert r.status_code == 200
        # update
        upd = {**created, "name": "TEST_Course_Y"}
        r = s.put(f"{API}/courses/{cid}", json=upd)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Course_Y"
        # verify
        assert s.get(f"{API}/courses/{cid}").json()["name"] == "TEST_Course_Y"
        # delete
        r = s.delete(f"{API}/courses/{cid}")
        assert r.status_code == 200
        r = s.get(f"{API}/courses/{cid}")
        assert r.status_code == 404


# ---------- Bag ----------
class TestBag:
    def test_bag_default_16(self, s):
        r = s.get(f"{API}/bag")
        assert r.status_code == 200
        bag = r.json()
        assert len(bag["clubs"]) == 16
        names = [c["name"] for c in bag["clubs"]]
        assert "Driver" in names and "Putter" in names

    def test_bag_update_persists(self, s):
        bag = s.get(f"{API}/bag").json()
        original = bag["clubs"][0]["carry"]
        bag["clubs"][0]["carry"] = 999
        r = s.put(f"{API}/bag", json=bag)
        assert r.status_code == 200
        got = s.get(f"{API}/bag").json()
        assert got["clubs"][0]["carry"] == 999
        # restore
        bag["clubs"][0]["carry"] = original
        s.put(f"{API}/bag", json=bag)


# ---------- Settings ----------
class TestSettings:
    def test_settings_persist_and_restore(self, s):
        r = s.get(f"{API}/settings")
        assert r.status_code == 200
        settings = r.json()
        assert "distanceUnit" in settings
        # toggle
        settings["distanceUnit"] = "m"
        settings["tournamentMode"] = True
        r = s.put(f"{API}/settings", json=settings)
        assert r.status_code == 200
        got = s.get(f"{API}/settings").json()
        assert got["distanceUnit"] == "m"
        assert got["tournamentMode"] is True
        # restore per instructions
        settings["distanceUnit"] = "yd"
        settings["tournamentMode"] = False
        s.put(f"{API}/settings", json=settings)
        got = s.get(f"{API}/settings").json()
        assert got["distanceUnit"] == "yd"
        assert got["tournamentMode"] is False


# ---------- Rounds ----------
@pytest.fixture(scope="module")
def demo_round():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    payload = {"courseId": "demo-apo-davao", "holeCount": 18, "player": "TEST_Player"}
    r = sess.post(f"{API}/rounds", json=payload)
    assert r.status_code == 200
    rnd = r.json()
    yield rnd
    # cleanup
    sess.delete(f"{API}/rounds/{rnd['id']}")


class TestRounds:
    def test_create_round_prefills_scores(self, demo_round):
        assert demo_round["courseName"] == "Apo Highlands Demo (DEMO DATA)"
        assert len(demo_round["scores"]) == 18
        for i, sc in enumerate(demo_round["scores"]):
            assert sc["hole"] == i + 1
            assert sc["par"] in (3, 4, 5)

    def test_update_round_and_complete(self, s, demo_round):
        rid = demo_round["id"]
        scores = demo_round["scores"]
        scores[0]["score"] = 4
        scores[0]["putts"] = 2
        r = s.put(f"{API}/rounds/{rid}", json={"currentHole": 2, "scores": scores})
        assert r.status_code == 200
        assert r.json()["currentHole"] == 2
        assert r.json()["scores"][0]["score"] == 4
        # complete
        r = s.put(f"{API}/rounds/{rid}", json={"status": "completed"})
        assert r.status_code == 200
        assert r.json()["status"] == "completed"
        assert r.json()["endedAt"] is not None
        # filter
        r = s.get(f"{API}/rounds", params={"status": "completed"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert rid in ids


# ---------- Shots & Haversine ----------
class TestShots:
    def test_haversine_via_shot(self, s):
        # 0.01 deg lat ≈ 1111.9 m
        payload = {"club": "TEST_Driver", "startLat": 7.0520, "startLng": 125.5170,
                   "endLat": 7.0620, "endLng": 125.5170}
        r = s.post(f"{API}/shots", json=payload)
        assert r.status_code == 200
        d = r.json()["distanceMeters"]
        assert abs(d - 1111.9) < 2, f"expected ~1111.9 got {d}"

    def test_club_stats(self, s):
        # add another to build stats
        s.post(f"{API}/shots", json={"club": "TEST_Driver", "startLat": 7.05, "startLng": 125.5,
                                     "endLat": 7.052, "endLng": 125.5})
        r = s.get(f"{API}/club-stats")
        assert r.status_code == 200
        stats = r.json()
        row = next((x for x in stats if x["club"] == "TEST_Driver"), None)
        assert row is not None
        assert row["count"] >= 2
        assert row["medianMeters"] > 0

    def test_cleanup_shots(self, s):
        # Only clear TEST_ ones by filtering (but endpoint clears all) - so skip destructive cleanup unless safe
        # Get all shots and delete only test ones via cannot; endpoint has no per-id delete.
        # Use the wipe-all endpoint sparingly - only if all present shots are our TEST_ ones.
        shots = s.get(f"{API}/shots").json()
        if all(sh.get("club", "").startswith("TEST_") for sh in shots):
            s.delete(f"{API}/shots")


# ---------- Stats ----------
class TestStats:
    def test_stats_endpoint(self, s):
        r = s.get(f"{API}/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ("roundsPlayed", "totalShots", "recentRounds"):
            assert k in data


# ---------- Elevation ----------
class TestElevation:
    def test_elevation(self, s):
        r = s.get(f"{API}/elevation", params={"lat1": 7.052, "lng1": 125.517, "lat2": 7.055, "lng2": 125.52}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "ball" in data and "target" in data and "diff" in data and "available" in data
        if data["available"]:
            assert isinstance(data["ball"], (int, float))
            assert isinstance(data["target"], (int, float))


# ---------- Caddie SSE ----------
class TestCaddie:
    def test_caddie_sse_stream(self):
        payload = {
            "distanceToTarget_yd": 150, "elevationDiff_m": 2, "wind": {"speed": 5, "direction": "H"},
            "hole": {"par": 4, "hcp": 7}, "hazards": [], "club": "7 Iron"
        }
        with requests.post(f"{API}/caddie", json=payload, stream=True, timeout=60) as r:
            assert r.status_code == 200
            saw_token = False
            saw_done = False
            start = time.time()
            for line in r.iter_lines(decode_unicode=True):
                if time.time() - start > 55:
                    break
                if not line:
                    continue
                if line.startswith("data: "):
                    payload_str = line[6:]
                    if payload_str == "[DONE]":
                        saw_done = True
                        break
                    try:
                        j = json.loads(payload_str)
                        if "t" in j and j["t"]:
                            saw_token = True
                        if "error" in j:
                            pytest.fail(f"Caddie returned error: {j['error']}")
                    except json.JSONDecodeError:
                        pass
            assert saw_token, "No text tokens streamed"
            assert saw_done, "Did not receive [DONE] marker"
