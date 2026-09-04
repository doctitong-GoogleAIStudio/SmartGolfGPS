"""Backend tests for iteration 14: geocoded layout, mapper flip, robustness."""
import os
import requests
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')

# --- GET /api/courses returns geocoded layout + POIs on every course
def test_courses_layout_and_pois():
    r = requests.get(f"{BASE}/api/courses", timeout=15)
    assert r.status_code == 200
    courses = r.json()
    assert len(courses) >= 1
    for c in courses:
        assert c.get("holes"), f"{c['name']} has no holes"
        h0 = c["holes"][0]
        assert h0.get("tee") and h0.get("greenCenter"), f"{c['name']} hole1 missing tee/greenCenter"
        for k in ("clubhouse", "drivingRange", "practiceGreen", "parking"):
            assert c.get(k), f"{c['name']} missing POI {k}"
        assert c.get("layoutSource") in ("simulated", "mapped")
        assert isinstance(c.get("geocoded"), bool)

def test_demo_stays_simulated():
    c = requests.get(f"{BASE}/api/courses/demo-apo-davao", timeout=10).json()
    assert c["isDemo"] is True
    assert c["layoutSource"] == "simulated"

def test_manila_geocoded():
    courses = requests.get(f"{BASE}/api/courses", timeout=15).json()
    manila = next((c for c in courses if "Manila Golf" in c["name"]), None)
    assert manila is not None
    assert manila["geocoded"] is True
    assert 14.4 < manila["latitude"] < 14.7
    assert 120.9 < manila["longitude"] < 121.1

# --- POST auto-generates simulated layout
def test_post_auto_layout():
    payload = {"name": "TEST_AutoLayout Course", "location": "Cebu City",
               "latitude": 10.31, "longitude": 123.89, "holeCount": 18, "holes": []}
    r = requests.post(f"{BASE}/api/courses", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    cid = data["id"]
    try:
        assert data["layoutSource"] == "simulated"
        assert len(data["holes"]) == 18
        assert data["holes"][0]["tee"] and data["holes"][0]["greenCenter"]
        assert data.get("clubhouse") and data.get("drivingRange")
        # GET-verify persistence
        g = requests.get(f"{BASE}/api/courses/{cid}", timeout=10).json()
        assert g["layoutSource"] == "simulated"
        assert len(g["holes"]) == 18
    finally:
        requests.delete(f"{BASE}/api/courses/{cid}")

# --- PUT flips layoutSource to mapped
def test_put_flips_to_mapped():
    payload = {"name": "TEST_MapperFlip", "location": "Bogus",
               "latitude": 7.05, "longitude": 125.5, "holeCount": 9, "holes": []}
    created = requests.post(f"{BASE}/api/courses", json=payload, timeout=30).json()
    cid = created["id"]
    try:
        assert created["layoutSource"] == "simulated"
        # Save via editor
        r = requests.put(f"{BASE}/api/courses/{cid}", json=created, timeout=15)
        assert r.status_code == 200
        # GET-verify
        g = requests.get(f"{BASE}/api/courses/{cid}", timeout=10).json()
        assert g["layoutSource"] == "mapped"
    finally:
        requests.delete(f"{BASE}/api/courses/{cid}")

# --- POST with pasted maps URL as location must not fail (geocode returns None)
def test_post_with_maps_url_location_no_500():
    payload = {"name": "TEST_UrlLoc", "location": "https://maps.google.com/?q=abc",
               "latitude": 12.34, "longitude": 121.5, "holeCount": 18, "holes": []}
    r = requests.post(f"{BASE}/api/courses", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    cid = data["id"]
    try:
        # geocoded may be False; course must still have a full layout + POIs
        assert data["holes"][0]["tee"]
        assert data.get("clubhouse")
        assert data["layoutSource"] == "simulated"
    finally:
        requests.delete(f"{BASE}/api/courses/{cid}")
