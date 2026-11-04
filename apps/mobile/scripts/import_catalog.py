"""Reuse the preserved catalog and its captured official dietary fiber; no network fetch."""
import hashlib
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
source = ROOT / "Packages/ToucheGrasseCore/Sources/ToucheGrasseCore/Resources/catalog.json"
foods = json.loads(source.read_text(encoding="utf-8"))
fiber_source = ROOT / "Fixtures/matvaretabellen-foods-nb.json"
fiber_records = {f["foodId"]: next((n for n in f["constituents"] if n["nutrientId"] == "Fiber"), {})
                 for f in json.loads(fiber_source.read_text(encoding="utf-8"))["foods"]}
for food in foods:
    record = fiber_records[food["provenance"]["sourceID"]]
    if "quantity" in record:
        assert record["unit"] == "g", food["id"]
    food["nutrition"]["fiber"] = record.get("quantity")
    food["provenance"]["nutrientSources"]["fiber"] = record.get("sourceId", "")
    food["nutrition"] = {key: None if value is None else str(value) for key, value in food["nutrition"].items()}
    food["gramsPerMeasure"] = {key: str(value) for key, value in food["gramsPerMeasure"].items()}
    if food.get("gramsPerMilliliter") is not None:
        food["gramsPerMilliliter"] = str(food["gramsPerMilliliter"])
output = APP / "src/data/catalog.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(foods, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
manifest = {"count": len(foods), "capturedOn": "2026-10-22", "source": str(source.relative_to(ROOT)),
            "fiberSource": str(fiber_source.relative_to(ROOT)), "fiberSourceSHA256": hashlib.sha256(fiber_source.read_bytes()).hexdigest(),
            "sourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "catalogSHA256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "change": "Nutrient numbers serialized as decimal strings; original nutrients, names, IDs, aliases, units and provenance preserved; dietary fiber and its source ID added from the same official capture."}
(APP / "src/data/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Reused {len(foods)} real foods; {output.stat().st_size:,} bytes; no network access")
