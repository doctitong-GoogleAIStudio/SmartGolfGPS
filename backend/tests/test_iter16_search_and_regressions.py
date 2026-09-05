"""Iteration 16 backend regressions & new endpoint:
- GET /api/geocode/search (nearby place search)
- POST /api/courses still returns full generated course
- POST /api/courses/{id}/relocate still 400/404 semantics
- POST /api/courses/geocode-all still excludes demo+mapped
"""
import os
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- geocode/search ----------------

class TestGeocodeSearch:
    def test_search_empty_query_returns_empty(self, sess):
        r = sess.get(f"{API}/geocode/search", params={"q": ""})
        assert r.status_code == 200
        assert r.json() == {"results": []}

    def test_search_short_query_returns_empty(self, sess):
        r = sess.get(f"{API}/geocode/search", params={"q": "a"})
        assert r.status_code == 200
        assert r.json() == {"results": []}

    def test_search_valid_query_shape(self, sess):
        # Bias near Manila metro
        r = sess.get(f"{API}/geocode/search", params={"q": "Wack Wack", "lat": 14.58, "lng": 121.04})
        assert r.status_code == 200
        body = r.json()
        assert "results" in body
        assert isinstance(body["results"], list)
        # Nominatim is best-effort; if it returns rows validate shape
        for row in body["results"]:
            assert "name" in row and isinstance(row["name"], str)
            assert "lat" in row and isinstance(row["lat"], float)
            assert "lng" in row and isinstance(row["lng"], float)

    def test_search_never_500s_on_junk(self, sess):
        # Random unicode blob — Nominatim may 0-hit; endpoint must degrade to {results:[]}
        r = sess.get(f"{API}/geocode/search", params={"q": "zzzzzzzqqqqxxx123"})
        assert r.status_code == 200
        assert "results" in r.json()


# ---------------- courses regression ----------------

class TestCoursesRegression:
    created_id = None

    def test_create_course_returns_full_generated_course(self, sess):
        payload = {
            "name": "TEST_Iter16_Search",
            "location": "Metro Manila, Philippines",
            "latitude": 14.58, "longitude": 121.04,
            "holeCount": 18, "holes": [],
        }
        r = sess.post(f"{API}/courses", json=payload)
        assert r.status_code == 200
        body = r.json()
        # Full generated course must include holes, POIs, layoutSource
        assert body["name"] == "TEST_Iter16_Search"
        assert "id" in body
        assert body["layoutSource"] == "simulated"
        assert isinstance(body.get("holes"), list) and len(body["holes"]) == 18
        # First hole must have tee + greenCenter (proof layout was generated)
        h0 = body["holes"][0]
        assert h0.get("tee") is not None
        assert h0.get("greenCenter") is not None
        # POIs
        for k in ("clubhouse", "drivingRange", "practiceGreen", "parking"):
            assert body.get(k) is not None
        TestCoursesRegression.created_id = body["id"]

    def test_relocate_missing_course_404(self, sess):
        r = sess.post(f"{API}/courses/does-not-exist-id/relocate",
                      json={"latitude": 14.58, "longitude": 121.04})
        assert r.status_code == 404

    def test_relocate_simulated_course_200(self, sess):
        cid = TestCoursesRegression.created_id
        assert cid, "create must have run"
        r = sess.post(f"{API}/courses/{cid}/relocate",
                      json={"latitude": 14.581, "longitude": 121.041})
        assert r.status_code == 200
        body = r.json()
        assert body["latitude"] == 14.581
        assert body["longitude"] == 121.041
        assert body["geocoded"] is True

    def test_relocate_mapped_course_400(self, sess):
        cid = TestCoursesRegression.created_id
        # Flip to mapped via PUT
        current = sess.get(f"{API}/courses/{cid}").json()
        current.pop("_id", None)
        put = sess.put(f"{API}/courses/{cid}", json=current)
        assert put.status_code == 200
        assert put.json()["layoutSource"] == "mapped"
        # Now relocate should 400
        r = sess.post(f"{API}/courses/{cid}/relocate",
                      json={"latitude": 14.6, "longitude": 121.05})
        assert r.status_code == 400

    def test_geocode_all_excludes_demo_and_mapped(self, sess):
        # Baseline set: demo (excluded), 2 simulated (Southpacific + Manila Golf)
        # plus our TEST_Iter16_Search (now mapped, excluded).
        all_courses = sess.get(f"{API}/courses").json()
        expected = sum(
            1 for c in all_courses
            if c.get("id") != "demo-apo-davao" and c.get("layoutSource") != "mapped"
        )
        r = sess.post(f"{API}/courses/geocode-all")
        assert r.status_code == 200
        body = r.json()
        assert body["courses"] == expected

    def test_zzz_cleanup(self, sess):
        cid = TestCoursesRegression.created_id
        if cid:
            sess.delete(f"{API}/courses/{cid}")
