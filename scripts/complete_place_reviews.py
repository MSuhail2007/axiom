"""Apply individually assessed review decisions through the existing local API."""
import argparse
import json
import sqlite3
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765/api/v1"
KEEP = {29, 38, 47, 48, 49, 56, 57, 62, 63, 69, 70, 80, 91, 98, 109}
REJECT = {
    6: "AAI refers to the aviation authority reviewing a proposal, not a place.",
    14: "Tamil verb describing services taking root, not a place name.",
    15: "Tamil word for station within an airport description, not a named location.",
    25: "Tamil reference to the British, not a place.",
    45: "THIS is part of the table heading, not a location.",
    51: "Buddha's refers to a person, not a place.",
    67: "Chandra is part of the person's name in the airport name, not a standalone place.",
    72: "EAST is a directional section heading, not East Delhi.",
    116: "EST. means established in the publication masthead, not a place.",
}
# Explicit selections assessed against each saved document snippet, not ranked scores.
GROUPS = {
    "1279290": [0,36],
    "1269771": [1,58],
    "1272648": [2,60],
    "1277897": [3,65,66],
    "1279233": [4,73,74],
    "1275812": [5,75,76],
    "1275004": [7,71,79],
    "1275637": [8,115],
    "1279105": [9,81,82],
    "1262180": [10,83,84],
    "1278149": [11,12,85,86],
    "1273755": [13,88],
    "1263780": [16,92+1,94],
    "1276509": [17,18,39,40,95],
    "1273800": [19,41,42,96],
    "1273865": [20,43,97,120],
    "1265873": [21,22,99,100,101,118],
    "1277333": [23,44,102,103,119,125,126],
    "1254163": [24,26,104,105,106],
    "1273874": [27,92,107,108,123],
    "1264527": [28,30,110,111,114,124,127],
    "1275339": [31,90,112],
    "1261481": [32],
    "1273294": [33,77],
    "1271439": [34,50],
    "1270927": [35,52],
    "1269633": [37,78],
    "1265206": [46],
    "1278994": [53,54,55,117],
    "7627085": [59],
    "1256312": [61],
    "1273468": [64],
    "1269909": [68],
    "1262811": [87],
    "1259229": [89],
    "1269723": [113],
    "1254649": [121],
    "1254388": [122],
}

def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    queue = json.loads((ROOT / "review-queue-before.json").read_text(encoding="utf-8-sig"))
    assert len(queue) == 128, "The assessed snapshot must contain 128 items."
    selected = {}
    for candidate_id, indices in GROUPS.items():
        for i in indices:
            assert i not in selected, f"Duplicate selection {i}"
            selected[i] = candidate_id
    assert not (set(selected) & (KEEP | set(REJECT)))
    assert set(selected) | KEEP | set(REJECT) == set(range(len(queue)))
    assert len(KEEP) == 15
    plan = []
    for i, item in enumerate(queue):
        row = {"index": i, "id": item["id"], "mention": item["mention"],
               "context": item["context_snippet"]}
        if i in KEEP:
            row.update(action="keep_pending", reason="Requires better candidates or corrected mention boundaries; no mapping forced.")
        elif i in REJECT:
            row.update(action="reject", reason=REJECT[i])
        else:
            candidates = [c for c in item["candidates"] if c["location_id"] == selected[i]]
            assert len(candidates) == 1, f"Missing/duplicate selected candidate at {i}"
            candidate = candidates[0]
            row.update(action="confirm", selected_canonical_id=selected[i],
                       canonical_name=candidate["canonical_name"], kind=candidate["kind"],
                       reason="Selected the city, state, district, or river identified by the document context, rather than a same-name unrelated candidate.")
        plan.append(row)
    plan_path = ROOT / "review-decisions-plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(Counter(r["action"] for r in plan)))
    if not args.apply:
        return
    live = request("/review/queue")
    assert {x["id"] for x in live} == {x["id"] for x in queue}, "Queue changed; reassess before applying."
    live_by_id = {x["id"]: x for x in live}
    for item in queue:
        current = live_by_id[item["id"]]
        assert current["mention"] == item["mention"] and current["candidates"] == item["candidates"], "Review evidence changed."
    backup_dir = ROOT / "review-backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir.mkdir(parents=True)
    for name in ("workspace.sqlite", "reviews.sqlite"):
        source_path = ROOT / "data" / name
        assert source_path.exists(), f"Missing database: {name}"
        with sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True) as source:
            with sqlite3.connect(backup_dir / name) as dest:
                source.backup(dest)
    (backup_dir / "queue-before.json").write_text(json.dumps(live, ensure_ascii=False, indent=2), encoding="utf-8")
    (backup_dir / "decisions.json").write_text(plan_path.read_text(encoding="utf-8"), encoding="utf-8")
    with (backup_dir / "applied.jsonl").open("w", encoding="utf-8") as log:
        for row in plan:
            if row["action"] == "keep_pending":
                continue
            result = request("/review/" + row["id"] + "/decision",
                             {"action": row["action"], "selected_canonical_id": row.get("selected_canonical_id")})
            log.write(json.dumps({**row, "result": result}, ensure_ascii=False) + "\n")
            log.flush()
    remaining = request("/review/queue")
    expected = {queue[i]["id"] for i in KEEP}
    assert {x["id"] for x in remaining} == expected, "Unexpected remaining queue; inspect audit log."
    print(json.dumps({"pending":len(remaining), "confirmed":len(selected),
                      "dismissed":len(REJECT), "backup":str(backup_dir)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
