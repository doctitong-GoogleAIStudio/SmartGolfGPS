"""Backend tests for iteration_4: Course Sharing + import + shareCode preservation on edit.

Uses REACT_APP_BACKEND_URL from /app/frontend/.env (shared backend).
"""
import os
import re
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from /app/frontend/.env (shared backend host)
def _load_base_url():
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE_URL = _load_base_url()

SHARE_CODE_RE = re.compile(r"^[A-HJ-NP-Z2-9]{6}$")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup(api):
    """Track created course ids so we can clean up test artifacts."""
    created = []
    yield created
    for cid in created:
        try:
            api.delete(f"{BASE_URL}/api/courses/{cid}")
        except Exception:
            pass


# ---- Share code ----
class TestShare:
    def test_share_demo_returns_6char_code(self, api):
        r = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share")
        assert r.status_code == 200
        data = r.json()
        assert "shareCode" in data
        assert isinstance(data["shareCode"], str)
        assert SHARE_CODE_RE.match(data["shareCode"]), f"Bad code: {data['shareCode']!r}"

    def test_share_is_idempotent(self, api):
        r1 = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share").json()
        r2 = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share").json()
        assert r1["shareCode"] == r2["shareCode"], "Share code must be stable/idempotent"

    def test_share_unknown_course_404(self, api):
        r = api.post(f"{BASE_URL}/api/courses/does-not-exist/share")
        assert r.status_code == 404

    def test_get_course_persists_share_code(self, api):
        code = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share").json()["shareCode"]
        c = api.get(f"{BASE_URL}/api/courses/demo-apo-davao").json()
        assert c.get("shareCode") == code


# ---- Import ----
class TestImport:
    def test_import_clones_course(self, api, cleanup):
        code = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share").json()["shareCode"]
        r = api.post(f"{BASE_URL}/api/courses/import", json={"code": code})
        assert r.status_code == 200
        clone = r.json()
        cleanup.append(clone["id"])

        # Data assertions
        assert clone["id"] != "demo-apo-davao"
        assert clone["name"].endswith("(Shared)")
        assert clone["shareCode"] in (None, ""), f"Cloned course must not carry shareCode: {clone['shareCode']!r}"
        assert clone["isDemo"] is False
        assert isinstance(clone.get("holes"), list)
        assert len(clone["holes"]) == 18

        # Verify holes have coords (tee + green center) — proof of deep clone
        h1 = clone["holes"][0]
        assert h1.get("tee") and h1["tee"].get("lat") is not None
        assert h1.get("greenCenter") and h1["greenCenter"].get("lat") is not None

        # GET verifies persistence
        got = api.get(f"{BASE_URL}/api/courses/{clone['id']}")
        assert got.status_code == 200
        assert got.json()["name"] == clone["name"]

    def test_import_invalid_code_404(self, api):
        r = api.post(f"{BASE_URL}/api/courses/import", json={"code": "ZZZZZZ"})
        assert r.status_code == 404

    def test_import_empty_code_400(self, api):
        r = api.post(f"{BASE_URL}/api/courses/import", json={"code": ""})
        assert r.status_code == 400

    def test_import_lowercase_code_works(self, api, cleanup):
        code = api.post(f"{BASE_URL}/api/courses/demo-apo-davao/share").json()["shareCode"]
        r = api.post(f"{BASE_URL}/api/courses/import", json={"code": code.lower()})
        assert r.status_code == 200
        cleanup.append(r.json()["id"])


# ---- PUT preserves shareCode ----
class TestEditPreservesShareCode:
    def test_put_course_does_not_wipe_share_code(self, api, cleanup):
        # 1) create a fresh course, then share it
        new = api.post(f"{BASE_URL}/api/courses", json={
            "name": "TEST_SHARECODE_PRESERVE",
            "location": "test",
            "latitude": 7.05,
            "longitude": 125.52,
            "holeCount": 9,
            "holes": [],
        }).json()
        cleanup.append(new["id"])
        code = api.post(f"{BASE_URL}/api/courses/{new['id']}/share").json()["shareCode"]
        assert SHARE_CODE_RE.match(code)

        # 2) PUT with shareCode omitted (client-side edit)
        updated = dict(new)
        updated["name"] = "TEST_SHARECODE_PRESERVE_EDITED"
        updated.pop("shareCode", None)  # ensure the client omits it
        r = api.put(f"{BASE_URL}/api/courses/{new['id']}", json=updated)
        assert r.status_code == 200

        # 3) GET verifies shareCode still there
        got = api.get(f"{BASE_URL}/api/courses/{new['id']}").json()
        assert got["name"] == "TEST_SHARECODE_PRESERVE_EDITED"
        assert got.get("shareCode") == code, "Editing a course must NOT wipe an issued shareCode"


# ---- Regression sanity ----
class TestRegression:
    def test_list_courses(self, api):
        r = api.get(f"{BASE_URL}/api/courses")
        assert r.status_code == 200
        assert any(c["id"] == "demo-apo-davao" for c in r.json())

    def test_demo_course_has_18_holes(self, api):
        c = api.get(f"{BASE_URL}/api/courses/demo-apo-davao").json()
        assert c["holeCount"] == 18
        assert len(c["holes"]) == 18

    def test_round_scores_update(self, api):
        # create -> update -> get to prove PUT /rounds/{id} still works
        r = api.post(f"{BASE_URL}/api/rounds", json={"courseId": "demo-apo-davao"})
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            scores = r.json()["scores"]
            scores[0]["score"] = 4
            scores[0]["putts"] = 2
            u = api.put(f"{BASE_URL}/api/rounds/{rid}", json={"scores": scores})
            assert u.status_code == 200
            got = api.get(f"{BASE_URL}/api/rounds/{rid}").json()
            assert got["scores"][0]["score"] == 4
            assert got["scores"][0]["putts"] == 2
        finally:
            api.delete(f"{BASE_URL}/api/rounds/{rid}")
