"""Windows checks of REAL bundled data and the exact application SQL, NOT Swift/iOS tests."""
import hashlib
import json
import plistlib
import re
import sqlite3
import tempfile
import time
import unittest
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "Packages/ToucheGrasseCore/Sources/ToucheGrasseCore/Resources"
CATALOG = json.loads((RESOURCES / "catalog.json").read_text(encoding="utf-8"))
SQL = (RESOURCES / "001_initial.sql").read_text(encoding="utf-8")


def normalized(text):
    text = text.lower().replace("æ", "ae").replace("ø", "o")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))
    return " ".join(re.findall(r"[^\W_]+", text))


def insert(db, food):
    db.execute("INSERT INTO foods(id,name,search_text,barcode,saved,payload) VALUES(?,?,?,?,?,?)", (
        food["id"], food["name"], normalized(" ".join([food["name"]] + food["aliases"])),
        food.get("barcode"), 0, json.dumps(food, ensure_ascii=False)))


class FoundationChecks(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SQL)

    def tearDown(self):
        self.db.close()

    def test_source_hashes_and_catalog_hash(self):
        manifest = json.loads((ROOT / "Fixtures/manifest.json").read_text())
        for name, metadata in manifest["files"].items():
            self.assertEqual(hashlib.sha256((ROOT / "Fixtures" / name).read_bytes()).hexdigest(), metadata["sha256"])
        self.assertEqual(hashlib.sha256((RESOURCES / "catalog.json").read_bytes()).hexdigest(), manifest["catalogSHA256"])

    def test_every_nutrient_matches_real_source_including_null(self):
        raw = json.loads((ROOT / "Fixtures/matvaretabellen-foods-nb.json").read_text(encoding="utf-8"))["foods"]
        source = {f["foodId"]: f for f in raw}
        self.assertEqual(len(CATALOG), 2121)
        self.assertEqual(len({f["id"] for f in CATALOG}), len(CATALOG))
        for food in CATALOG:
            original = source[food["provenance"]["sourceID"]]
            self.assertEqual(food["name"], original["foodName"])
            self.assertEqual(food["referenceUnit"], "g")
            self.assertEqual(food["nutrition"]["kcal"], original.get("calories", {}).get("quantity"))
            constituents = {c["nutrientId"]: c for c in original["constituents"]}
            for name, source_id in [("protein", "Protein"), ("carbohydrate", "Karbo"), ("fat", "Fett")]:
                value = constituents.get(source_id, {}).get("quantity")
                self.assertEqual(food["nutrition"][name], value)
                if value is not None:
                    self.assertGreaterEqual(value, 0)
                    self.assertLessEqual(value, 100)

    def test_migration_schema(self):
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        tables = {x[0] for x in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"foods", "food_search", "logs", "recipes", "draft", "search_events"} <= tables)

    def test_failed_initial_migration_rolls_back_schema_and_version(self):
        fresh = sqlite3.connect(":memory:")
        try:
            with self.assertRaises(sqlite3.OperationalError):
                fresh.executescript("BEGIN IMMEDIATE;\n" + SQL + "\nSELECT * FROM deliberately_missing_table;\nCOMMIT;")
            fresh.rollback()
            self.assertEqual(fresh.execute("PRAGMA user_version").fetchone()[0], 0)
            self.assertEqual(fresh.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(), [])
        finally:
            fresh.close()

    def test_fts_insert_update_delete_triggers(self):
        insert(self.db, CATALOG[0])
        food_id = CATALOG[0]["id"]
        self.assertEqual(self.db.execute("SELECT count(*) FROM food_search").fetchone()[0], 1)
        self.db.execute("UPDATE foods SET search_text='uniquepepper' WHERE id=?", (food_id,))
        self.assertEqual(self.db.execute("SELECT id FROM food_search WHERE food_search MATCH ?", ('"uniquepepper"*',)).fetchone()[0], food_id)
        self.db.execute("DELETE FROM foods WHERE id=?", (food_id,))
        self.assertEqual(self.db.execute("SELECT count(*) FROM food_search").fetchone()[0], 0)

    def test_search_real_norwegian_and_english_alias(self):
        for food in CATALOG:
            insert(self.db, food)
        for query in ['"olivenolje"*', '"olive"* AND "oil"*']:
            matches = {r[0] for r in self.db.execute("SELECT id FROM food_search WHERE food_search MATCH ?", (query,))}
            self.assertIn("mvt:08.019", matches)
        unrelated = self.db.execute("SELECT id FROM food_search WHERE food_search MATCH ?", ('"kylling"* AND "spaceship"*',)).fetchall()
        self.assertEqual(unrelated, [])

    def test_unique_barcode_and_transaction_rollback(self):
        self.db.execute("BEGIN IMMEDIATE")
        food = dict(CATALOG[0], barcode="1234567890123")
        insert(self.db, food)
        with self.assertRaises(sqlite3.IntegrityError):
            insert(self.db, dict(food, id="duplicate"))
        self.db.rollback()
        self.assertEqual(self.db.execute("SELECT count(*) FROM foods").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM food_search").fetchone()[0], 0)

    def test_historical_log_has_no_cascading_food_update(self):
        insert(self.db, CATALOG[0])
        original = json.dumps({"snapshot": CATALOG[0]})
        self.db.execute("INSERT INTO logs VALUES(?,?,?,?)", ("log-1", CATALOG[0]["id"], 1234, original))
        self.db.execute("UPDATE foods SET payload='changed' WHERE id=?", (CATALOG[0]["id"],))
        self.assertEqual(self.db.execute("SELECT payload FROM logs").fetchone()[0], original)

    def test_duplicate_log_id_and_date_boundaries(self):
        for recorded_at, log_id in [(100, "a"), (200, "b"), (300, "c"), (100, "a")]:
            self.db.execute("INSERT OR IGNORE INTO logs VALUES(?,?,?,?)", (log_id, "test", recorded_at, "{}"))
        self.assertEqual(self.db.execute("SELECT count(*) FROM logs").fetchone()[0], 3)
        self.assertEqual(self.db.execute("SELECT id FROM logs WHERE recorded_at>=? AND recorded_at<?", ("100", "300")).fetchall(), [("a",), ("b",)])

    def test_disk_reopen_preserves_fts_and_draft(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.sqlite"
            db = sqlite3.connect(path)
            db.executescript(SQL)
            insert(db, CATALOG[0])
            db.execute("INSERT INTO draft VALUES(1,?)", ('{"quantityText":"15,5"}',))
            db.commit(); db.close()
            db = sqlite3.connect(path)
            self.assertEqual(db.execute("SELECT payload FROM draft").fetchone()[0], '{"quantityText":"15,5"}')
            self.assertEqual(db.execute("SELECT count(*) FROM food_search").fetchone()[0], 1)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            db.close()

    def test_invalid_draft_primary_key(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO draft VALUES(2,'{}')")

    def test_privacy_manifest_and_project_paths(self):
        privacy = plistlib.loads((ROOT / "ToucheGrasse/Resources/PrivacyInfo.xcprivacy").read_bytes())
        self.assertFalse(privacy["NSPrivacyTracking"])
        self.assertEqual(privacy["NSPrivacyCollectedDataTypes"], [])
        for path in ["ToucheGrasse", "ToucheGrasseUITests", "Packages/ToucheGrasseCore/Package.swift"]:
            self.assertTrue((ROOT / path).exists())

    def test_exact_brand_tokens_and_semantic_contrast(self):
        source = (ROOT / "ToucheGrasse/Design/Tokens.swift").read_text()
        for token, color in {"ocean": "4B8299", "forrest": "44724F", "skyline": "99BFDF", "tangerine": "E99E26", "toffee": "DA682F", "salsa": "DB3100"}.items():
            self.assertIn(f"static let {token} = Color(hex: 0x{color})", source)
        def luminance(hex_value):
            values = [int(hex_value[i:i+2], 16) / 255 for i in (0, 2, 4)]
            values = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
            return sum(x * y for x, y in zip(values, [.2126, .7152, .0722]))
        report = {}
        for foreground, background in [("172B32", "FAF8F2"), ("52626A", "FAF8F2"), ("28566B", "FAF8F2"), ("FFFFFF", "28566B"), ("AC2B09", "FFFFFF"), ("172B32", "E6EFF1")]:
            low, high = sorted([luminance(foreground), luminance(background)])
            ratio = (high + .05) / (low + .05)
            report[f"#{foreground} on #{background}"] = round(ratio, 2)
            self.assertGreaterEqual(ratio, 4.5)
        (ROOT / "verification/contrast.json").write_text(json.dumps(report, indent=2) + "\n")


def benchmark():
    db = sqlite3.connect(":memory:")
    db.executescript(SQL)
    for food in CATALOG:
        insert(db, food)
    samples = []
    for _ in range(100):
        start = time.perf_counter()
        db.execute("SELECT id FROM food_search WHERE food_search MATCH ? LIMIT 40", ('"kylling"*',)).fetchall()
        samples.append((time.perf_counter() - start) * 1000)
    db.close()
    report = {"scope": "Windows Python SQLite FTS query only; NOT Swift ranking, UI latency, or iPhone performance",
              "sqliteVersion": sqlite3.sqlite_version, "foods": len(CATALOG), "samples": len(samples),
              "meanMs": sum(samples) / len(samples), "p95Ms": sorted(samples)[94]}
    (ROOT / "verification/windows-fts-benchmark.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(FoundationChecks)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():
        benchmark()
    raise SystemExit(0 if result.wasSuccessful() else 1)
