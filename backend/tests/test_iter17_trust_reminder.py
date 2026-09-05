"""Iteration 17 backend regressions:
- POST /api/courses simulates + reflects geocoded flag correctly (LOW when no geocode)
- POST /api/rounds still creates a round
- GET /api/geocode/search still works
Cleanup: deletes any TEST_ courses created.
"""
import os
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    for cid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/courses/{cid}", timeout=10)
        except Exception:
            pass


def test_create_course_low_accuracy_no_geocode(created_ids):
    # A gibberish name+location that Nominatim shouldn't resolve → geocoded=false → LOW
    payload = {
        "name": "TEST_Iter17_ZZ_Range_QA",
        "location": "Nowhereville_QQXX_ZZZZ",
        "latitude": 14.5,
        "longitude": 121.0,
        "holeCount": 18,
    }
    r = requests.post(f"{BASE_URL}/api/courses", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["id"]
    assert c["name"] == payload["name"]
    assert c["layoutSource"] == "simulated"
    assert c.get("geocoded") is False, f"Expected geocoded=false for gibberish location, got {c.get('geocoded')}"
    assert len(c["holes"]) == 18
    assert c["holes"][0].get("tee") is not None
    created_ids.append(c["id"])

    # Verify GET returns same
    g = requests.get(f"{BASE_URL}/api/courses/{c['id']}", timeout=10)
    assert g.status_code == 200
    assert g.json()["geocoded"] is False


def test_create_round_on_low_course(created_ids):
    assert created_ids, "prev test created a course"
    cid = created_ids[0]
    r = requests.post(f"{BASE_URL}/api/rounds", json={"courseId": cid, "holeCount": 18, "player": "TEST_QA"}, timeout=15)
    assert r.status_code == 200, r.text
    rnd = r.json()
    assert rnd["id"]
    assert rnd["courseId"] == cid
    assert rnd["status"] == "active"
    assert len(rnd["scores"]) == 18
    # cleanup this round
    requests.delete(f"{BASE_URL}/api/rounds/{rnd['id']}", timeout=10)


def test_geocode_search_still_works():
    r = requests.get(f"{BASE_URL}/api/geocode/search", params={"q": "Manila Golf", "lat": 14.6, "lng": 121.05}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert isinstance(body["results"], list)


def test_geocode_search_short_query_returns_empty():
    r = requests.get(f"{BASE_URL}/api/geocode/search", params={"q": "a"}, timeout=10)
    assert r.status_code == 200
    assert r.json() == {"results": []}


def test_medium_course_reflects_geocoded_true():
    # Southpacific / Manila Golf should already exist as MEDIUM (geocoded=true) baseline
    r = requests.get(f"{BASE_URL}/api/courses", timeout=10)
    assert r.status_code == 200
    courses = r.json()
    non_demo = [c for c in courses if not c.get("isDemo")]
    # At least one non-demo course should be geocoded (MEDIUM)
    assert any(c.get("geocoded") for c in non_demo), "expected at least one MEDIUM (geocoded) baseline course"
