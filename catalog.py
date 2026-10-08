"""Gazetteer access and a small, attributed demonstration catalog."""

from __future__ import annotations

import sqlite3
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    # Unicode combining marks carry vowels in many Indian scripts.
    cleaned = "".join(ch if ch.isalnum() or unicodedata.category(ch).startswith("M") else " " for ch in value)
    return " ".join(cleaned.split())


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    state: str
    country: str
    lat: float
    lon: float
    aliases: tuple[str, ...]
    population: int = 0
    kind: str = "city"
    source: str = "GeoNames"

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "state": self.state,
                "country": self.country, "lat": self.lat, "lon": self.lon,
                "kind": self.kind, "source": self.source}


@dataclass(frozen=True)
class FuzzyMatch:
    place: Place
    alias: str
    score: float


# Coordinates and IDs are from GeoNames. These entries are an illustrative demo set.
BUNDLED = [
    Place("1278148", "Aurangabad", "Bihar", "India", 24.7520, 84.3742, ("Aurangabad", "Aurangābād", "औरंगाबाद")),
    Place("1278149", "Aurangabad", "Maharashtra", "India", 19.8776, 75.3423, ("Aurangabad", "Aurangābād", "औरंगाबाद", "Chhatrapati Sambhajinagar")),
    Place("1269843", "Hyderabad", "Telangana", "India", 17.3841, 78.4564, ("Hyderabad", "Hyd", "HYD", "हैदराबाद", "హైదరాబాద్")),
    Place("1176734", "Hyderabad", "Sindh", "Pakistan", 25.3969, 68.3772, ("Hyderabad", "Hyderābād", "Hyd")),
    Place("1275339", "Mumbai", "Maharashtra", "India", 19.0728, 72.8826, ("Mumbai", "Bombay", "मुंबई")),
    Place("1277333", "Bengaluru", "Karnataka", "India", 12.9762, 77.6033, ("Bengaluru", "Bangalore", "Bluru", "B'luru", "ಬೆಂಗಳೂರು")),
    Place("1264527", "Chennai", "Tamil Nadu", "India", 13.0878, 80.2785, ("Chennai", "Madras", "சென்னை")),
    Place("1275004", "Kolkata", "West Bengal", "India", 22.5626, 88.3630, ("Kolkata", "Calcutta", "কলকাতা")),
    Place("1261481", "New Delhi", "Delhi", "India", 28.6358, 77.2245, ("New Delhi", "नई दिल्ली")),
    Place("1269515", "Jaipur", "Rajasthan", "India", 26.9196, 75.7878, ("Jaipur", "जयपुर")),
    Place("1260086", "Patna", "Bihar", "India", 25.5941, 85.1376, ("Patna", "पटना")),
    Place("1261731", "Nashik", "Maharashtra", "India", 19.9973, 73.7910, ("Nashik", "Nasik", "नाशिक")),
    Place("1279259", "Agra", "Uttar Pradesh", "India", 27.1833, 78.0167, ("Agra", "आगरा")),
    Place("1259229", "Pune", "Maharashtra", "India", 18.5196, 73.8553, ("Pune", "Poona", "पुणे")),
    Place("1255364", "Surat", "Gujarat", "India", 21.1959, 72.8302, ("Surat", "સુરત")),
]


class Catalog:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DATA / "geonames.sqlite"
        self.places = {p.id: p for p in BUNDLED}
        self.aliases: dict[str, set[str]] = {}
        for p in BUNDLED:
            for alias in p.aliases:
                self.aliases.setdefault(normalize(alias), set()).add(p.id)
        self.conn = None
        if self.db_path.exists():
            self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row

    def get(self, place_id: str) -> Place | None:
        if place_id in self.places:
            return self.places[place_id]
        if self.conn:
            row = self.conn.execute("SELECT * FROM places WHERE id=?", (place_id,)).fetchone()
            if row:
                return Place(row["id"], row["name"], row["state"], row["country"],
                             row["lat"], row["lon"], (), row["population"], row["kind"])
        return None

    def lookup(self, value: str) -> list[Place]:
        key = normalize(value)
        ids = set(self.aliases.get(key, ()))
        if self.conn:
            rows = self.conn.execute("SELECT place_id FROM aliases WHERE alias=?", (key,)).fetchall()
            ids.update(row[0] for row in rows)
        matches = [self.get(i) for i in ids]
        return sorted((p for p in matches if p),
                      key=lambda p: (p.id not in self.places, -p.population, p.name, p.id))

    def terms(self) -> set[str]:
        return set(self.aliases)

    @lru_cache(maxsize=1)
    def all_terms(self) -> tuple[str, ...]:
        terms = set(self.aliases)
        if self.conn:
            terms.update(row[0] for row in self.conn.execute("SELECT DISTINCT alias FROM aliases"))
        return tuple(sorted(terms))

    @lru_cache(maxsize=4096)
    def fuzzy_matches(self, value: str, limit: int = 5, broad: bool = False) -> tuple[FuzzyMatch, ...]:
        key = normalize(value)
        if not key:
            return ()
        terms = {term for term in self.aliases if abs(len(term) - len(key)) <= 3}
        if broad:
            terms = self.all_terms()
        elif self.conn:
            rows = self.conn.execute(
                """SELECT DISTINCT alias FROM aliases
                   WHERE alias_len BETWEEN ? AND ? AND (first_two=? OR last_two=?)
                   LIMIT 15000""",
                (len(key) - 3, len(key) + 3, key[:2], key[-2:]),
            )
            terms.update(row[0] for row in rows)
        try:
            from rapidfuzz import fuzz, process
            scored = [(term, score / 100) for term, score, _ in
                      process.extract(key, sorted(terms) if isinstance(terms, set) else terms,
                                      scorer=fuzz.ratio, limit=100, score_cutoff=0 if broad else 75)]
        except ImportError:
            from difflib import SequenceMatcher
            scored = sorted(((term, SequenceMatcher(None, key, term).ratio()) for term in terms),
                            key=lambda item: -item[1])[:30]
        output: dict[str, FuzzyMatch] = {}
        for term, score in scored:
            if score <= 0 or (not broad and score < 0.75):
                continue
            for place in self.lookup(term):
                if place.id not in output or score > output[place.id].score:
                    output[place.id] = FuzzyMatch(place, term, score)
        return tuple(sorted(output.values(),
                            key=lambda hit: (-hit.score, hit.place.id not in self.places,
                                             -hit.place.population, hit.place.id))[:limit])

    def fuzzy(self, value: str, limit: int = 3) -> list[Place]:
        return [hit.place for hit in self.fuzzy_matches(value, limit)]
