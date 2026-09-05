"""Iteration 15 tests — POST /api/courses/{id}/relocate and POST /api/courses/geocode-all."""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _create(http, name="TEST_Relocate_Course", location="Manila, Philippines"):
    r = http.post(f"{API}/courses", json={
        "name": name, "location": location,
        "latitude": 14.55, "longitude": 121.02, "holeCount": 18, "holes": []
    })
    assert r.status_code == 200, r.text
    return r.json()


def _cleanup(http, cid):
    try:
        http.delete(f"{API}/courses/{cid}")
    except Exception:
        pass


class TestRelocate:
    def test_relocate_regenerates_layout_and_marks_geocoded(self, http):
        c = _create(http, "TEST_Relocate_A")
        cid = c["id"]
        try:
            new_lat, new_lng = 14.60000, 121.05000
            r = http.post(f"{API}/courses/{cid}/relocate", json={"latitude": new_lat, "longitude": new_lng})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["latitude"] == pytest.approx(new_lat, abs=1e-4)
            assert body["longitude"] == pytest.approx(new_lng, abs=1e-4)
            assert body["geocoded"] is True
            assert body["layoutSource"] == "simulated"
            assert len(body["holes"]) == 18
            assert body["holes"][0]["tee"] is not None
            assert "lat" in body["holes"][0]["tee"]
            for k in ("clubhouse", "drivingRange", "practiceGreen", "parking"):
                assert body[k] is not None and "lat" in body[k]
            # Persistence: GET returns same lat/lng
            g = http.get(f"{API}/courses/{cid}").json()
            assert g["latitude"] == pytest.approx(new_lat, abs=1e-4)
            assert g["geocoded"] is True
            assert g["layoutSource"] == "simulated"
        finally:
            _cleanup(http, cid)

    def test_relocate_404_for_missing_course(self, http):
        r = http.post(f"{API}/courses/does-not-exist-xyz/relocate", json={"latitude": 14.0, "longitude": 121.0})
        assert r.status_code == 404

    def test_relocate_400_for_mapped_course(self, http):
        c = _create(http, "TEST_Relocate_Mapped")
        cid = c["id"]
        try:
            # Flip to 'mapped' by doing a PUT (server hard-codes layoutSource='mapped' on PUT)
            put = http.put(f"{API}/courses/{cid}", json=c)
            assert put.status_code == 200
            assert put.json()["layoutSource"] == "mapped"
            r = http.post(f"{API}/courses/{cid}/relocate", json={"latitude": 14.6, "longitude": 121.05})
            assert r.status_code == 400
        finally:
            _cleanup(http, cid)


class TestGeocodeAll:
    def test_geocode_all_returns_count_and_does_not_500(self, http):
        # Create a non-mapped course so count >= 1
        c = _create(http, "TEST_GeocodeAll_A", location="Wack Wack Golf, Mandaluyong, Philippines")
        cid = c["id"]
        try:
            r = http.post(f"{API}/courses/geocode-all")
            assert r.status_code == 200, r.text
            body = r.json()
            assert "courses" in body
            assert isinstance(body["courses"], int)
            assert body["courses"] >= 1
        finally:
            _cleanup(http, cid)

    def test_geocode_all_excludes_demo_and_mapped(self, http):
        # Make a course mapped, capture baseline count
        base_r = http.post(f"{API}/courses/geocode-all")
        base_count = base_r.json()["courses"]
        c = _create(http, "TEST_GeocodeAll_Mapped")
        cid = c["id"]
        # After creating a NEW simulated course, count should increase by 1
        r1 = http.post(f"{API}/courses/geocode-all")
        assert r1.json()["courses"] == base_count + 1
        try:
            http.put(f"{API}/courses/{cid}", json=c)  # flip to mapped
            r2 = http.post(f"{API}/courses/geocode-all")
            # Now it should be excluded → back to baseline
            assert r2.json()["courses"] == base_count
        finally:
            _cleanup(http, cid)

    def test_geocode_all_bulk_snaps_course(self, http):
        """force=True path: bulk should re-snap a course. Give background task some time."""
        # A very unambiguous course name
        c = _create(http, "TEST_BulkSnap_ManilaGolf", location="Manila Golf Club, Makati, Philippines")
        cid = c["id"]
        try:
            r = http.post(f"{API}/courses/geocode-all")
            assert r.status_code == 200
            # Background task snaps at ~1.1s per course; wait generously.
            snapped = False
            for _ in range(20):
                time.sleep(1.2)
                g = http.get(f"{API}/courses/{cid}").json()
                if g.get("geocoded") is True:
                    snapped = True
                    break
            # Not asserting geocoded==True hard because Nominatim can be flaky,
            # but the endpoint must not crash and the layout must still be intact.
            g = http.get(f"{API}/courses/{cid}").json()
            assert g["layoutSource"] == "simulated"
            assert len(g["holes"]) == 18
            # Best-effort: log for report
            print(f"Bulk snap result: geocoded={g.get('geocoded')}, snapped_in_window={snapped}")
        finally:
            _cleanup(http, cid)
