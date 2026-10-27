"""Unit-test actual geometry policy functions without importing services or touching MongoDB."""
import ast
import asyncio
import copy
import unittest
from pathlib import Path


def functions():
    tree = ast.parse((Path(__file__).parents[1] / "server.py").read_text(encoding="utf-8"))
    names = {"_apply_layout", "_ensure_layout", "backfill_layouts"}
    nodes = [copy.deepcopy(n) for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for node in nodes:
        node.decorator_list = []
    namespace = {}
    class NoDatabase:
        def __getattr__(self, name):
            raise AssertionError("Read/backfill policy must not access a database")
    namespace["db"] = NoDatabase()
    namespace["build_layout"] = lambda *a, **k: (_ for _ in ()).throw(AssertionError("Must not generate geometry"))
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), "geometry-policy", "exec"), namespace)
    return namespace


class GeometryPreservationTests(unittest.TestCase):
    def test_course_read_has_no_database_side_effect(self):
        fn = functions();course = {"id": "legacy", "layoutSource": "simulated", "holes": []}
        result = asyncio.run(fn["_ensure_layout"](course))
        self.assertEqual(result, course)
        self.assertEqual(result["holes"], [])

    def test_legacy_mapped_fields_are_preserved(self):
        fn = functions();course = {"id": "legacy", "layoutSource": "mapped", "customLegacyMetadata": {"keep": True}, "holes": [{"holeNumber": 1, "tee": None}]}
        snapshot = copy.deepcopy(course)
        self.assertEqual(asyncio.run(fn["_ensure_layout"](course)), snapshot)
        self.assertEqual(course, snapshot)

    def test_relocation_only_changes_directory_anchor(self):
        update = functions()["_apply_layout"]({"holes": [{"holeNumber": 1}], "clubhouse": {"lat": 1, "lng": 2}}, 3, 4, True)
        self.assertEqual(update, {"latitude": 3, "longitude": 4, "geocoded": True})
        self.assertNotIn("holes", update)
        self.assertNotIn("layoutSource", update)
        self.assertNotIn("clubhouse", update)

    def test_backfill_does_not_generate_or_reclassify_records(self):
        self.assertIsNone(asyncio.run(functions()["backfill_layouts"]()))


if __name__ == "__main__":
    unittest.main()
