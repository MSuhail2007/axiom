"""Import the GeoNames India country dump into a local indexed SQLite catalog."""

from __future__ import annotations

import csv
import sqlite3
import sys
import zipfile
from pathlib import Path

from catalog import DATA, normalize


def lines(path: Path):
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.upper().endswith("IN.TXT")]
            if not names:
                raise ValueError("Expected IN.txt inside the ZIP file")
            with archive.open(names[0]) as raw:
                import io
                yield from io.TextIOWrapper(raw, encoding="utf-8")
    else:
        with path.open(encoding="utf-8") as file:
            yield from file


def import_file(source: Path, destination: Path | None = None) -> tuple[int, int]:
    destination = destination or DATA / "geonames.sqlite"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()
    db = sqlite3.connect(destination)
    db.execute("CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT, state TEXT, country TEXT, lat REAL, lon REAL, population INTEGER, kind TEXT)")
    db.execute("CREATE TABLE aliases (alias TEXT, place_id TEXT, first_two TEXT, last_two TEXT, alias_len INTEGER, PRIMARY KEY (alias, place_id))")
    states: dict[str, str] = {}
    state_rows: list[list[str]] = []
    for row in csv.reader(lines(source), delimiter="\t"):
        if len(row) >= 11 and row[6] == "A" and row[7] == "ADM1":
            states[row[10]] = (row[2].removeprefix("State of ")
                               .removeprefix("Union Territory of ")
                               .removeprefix("National Capital Territory of "))
            state_rows.append(row)
    places = aliases = 0
    for row in state_rows:
        place_id, name, ascii_name, other_names = row[:4]
        state = states[row[10]]
        db.execute("INSERT OR IGNORE INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (place_id, state, state, "India", float(row[4]), float(row[5]), 0, "state"))
        places += 1
        for raw_alias in {name, ascii_name, state, *other_names.split(",")}:
            alias = normalize(raw_alias)
            if alias and len(alias) <= 100:
                db.execute("INSERT OR IGNORE INTO aliases VALUES (?, ?, ?, ?, ?)",
                           (alias, place_id, alias[:2], alias[-2:], len(alias)))
                aliases += 1
    for row in csv.reader(lines(source), delimiter="\t"):
        if len(row) < 15 or row[6] != "P":
            continue
        population = int(row[14] or 0)
        place_id, name, ascii_name, other_names = row[:4]
        state = states.get(row[10], "")
        try:
            lat, lon = float(row[4]), float(row[5])
        except ValueError:
            continue
        db.execute("INSERT OR IGNORE INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (place_id, name, state, "India", lat, lon, population, "city"))
        places += 1
        for raw_alias in {name, ascii_name, *other_names.split(",")}:
            alias = normalize(raw_alias)
            if not alias or len(alias) > 100:
                continue
            db.execute("INSERT OR IGNORE INTO aliases VALUES (?, ?, ?, ?, ?)",
                       (alias, place_id, alias[:2], alias[-2:], len(alias)))
            aliases += 1
        if places % 10000 == 0:
            db.commit()
    db.execute("CREATE INDEX aliases_prefix ON aliases (first_two, alias_len)")
    db.execute("CREATE INDEX aliases_suffix ON aliases (last_two, alias_len)")
    db.execute("CREATE INDEX aliases_place_id ON aliases (place_id)")
    db.commit()
    db.close()
    add_geography(source, destination)
    return places, aliases


def add_geography(source: Path, destination: Path) -> int:
    """Extend an existing catalog without replacing settlements or user reviews."""
    kinds = {"STM": "river", "CST": "coast", "RGN": "region", "RGNH": "historical region",
             "PLAT": "plateau", "ADM2": "district"}
    rows = [row for row in csv.reader(lines(source), delimiter="\t")
            if len(row) >= 15 and row[7] in kinds]
    with sqlite3.connect(destination) as db:
        for row in rows:
            kind = kinds[row[7]]
            name = row[1]
            db.execute("INSERT OR IGNORE INTO places VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (row[0], name, "", "India", float(row[4]), float(row[5]), int(row[14] or 0), kind))
            names = {name, row[2], *row[3].split(",")}
            if kind == "river":
                names.update(n.removesuffix(" River") for n in list(names))
            for value in names:
                alias = normalize(value)
                if alias and len(alias) <= 100:
                    db.execute("INSERT OR IGNORE INTO aliases VALUES (?, ?, ?, ?, ?)",
                               (alias, row[0], alias[:2], alias[-2:], len(alias)))
    return len(rows)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python import_geonames.py path\\to\\IN.zip")
    count, alias_count = import_file(Path(sys.argv[1]))
    print(f"Imported {count:,} places and processed {alias_count:,} aliases into data/geonames.sqlite")
