"""Normalize captured official responses. No invented values or generated nutrition."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "Fixtures"
OUTPUT = ROOT / "Packages/ToucheGrasseCore/Sources/ToucheGrasseCore/Resources/catalog.json"


def prepare():
    norwegian = json.loads((FIXTURES / "matvaretabellen-foods-nb.json").read_text(encoding="utf-8"))["foods"]
    english = {f["foodId"]: f for f in json.loads((FIXTURES / "matvaretabellen-foods-en.json").read_text(encoding="utf-8"))["foods"]}
    result = []
    for f in norwegian:
        constituents = {n["nutrientId"]: n for n in f["constituents"]}
        records = {"kcal": f.get("calories", {}), "protein": constituents.get("Protein", {}),
                   "carbohydrate": constituents.get("Karbo", {}), "fat": constituents.get("Fett", {})}
        for key, record in records.items():
            if "quantity" in record:
                assert record["unit"] == ("kcal" if key == "kcal" else "g"), (f["foodId"], key)
        # Broad category searchKeywords are deliberately excluded: e.g. 'meat' must not make every dish an exact match.
        aliases = [english[f["foodId"]]["foodName"]] if f["foodId"] in english else []
        result.append({"id": "mvt:" + f["foodId"], "name": f["foodName"], "aliases": aliases,
                       "referenceUnit": "g", "nutrition": {key: record.get("quantity") for key, record in records.items()},
                       "gramsPerMeasure": {}, "provenance": {
                           "source": "matvaretabellen", "sourceID": f["foodId"], "sourceURL": f["uri"],
                           "retrievedAt": "2026-10-22", "nutrientSources": {key: record.get("sourceId", "") for key, record in records.items()}}})
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {"capturedOn": "2026-10-22", "foodCount": len(result), "attribution": "Matvaretabellen — Mattilsynet",
                "documentation": "https://www.matvaretabellen.no/api/", "files": {}}
    for name, url in [("matvaretabellen-foods-nb.json", "nb/foods.json"), ("matvaretabellen-foods-en.json", "en/foods.json"),
                      ("matvaretabellen-nutrients-nb.json", "nb/nutrients.json")]:
        manifest["files"][name] = {"url": "https://www.matvaretabellen.no/api/" + url,
                                    "sha256": hashlib.sha256((FIXTURES / name).read_bytes()).hexdigest()}
    manifest["catalogSHA256"] = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    (FIXTURES / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(result)} real source foods; {OUTPUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    prepare()
