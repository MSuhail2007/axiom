"""Cached client for the local Photon/OpenStreetMap service."""
from __future__ import annotations

import json
import os
import math
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from catalog import DATA, FuzzyMatch, Place, normalize


class Photon:
    def __init__(self, path: Path | None = None):
        self.db = sqlite3.connect(path or DATA / "photon.sqlite", check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS cache (query TEXT PRIMARY KEY, body TEXT, fetched REAL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, body TEXT)")
        self.db.commit()
        self.lock = threading.Lock()
        self.last_request = 0.0

    def get(self, place_id: str) -> Place | None:
        with self.lock:
            row = self.db.execute("SELECT body FROM places WHERE id=?", (place_id,)).fetchone()
        return Place(**json.loads(row[0])) if row else None

    def search(self, query: str, country: str = "") -> tuple[tuple[FuzzyMatch, ...], str]:
        try:
            base_url = os.getenv("PLACELENS_PHOTON_URL", "http://127.0.0.1:2322/api/")
            endpoint = urllib.parse.urlsplit(base_url)
            if endpoint.scheme != "http" or endpoint.hostname not in {"127.0.0.1", "localhost", "::1"} or endpoint.username or endpoint.password:
                raise ValueError("Photon endpoint must be local")
            # Do not reuse public-provider results as proof of a local query.
            key = json.dumps([base_url, normalize(query), country])
            with self.lock:
                row = self.db.execute("SELECT body, fetched FROM cache WHERE query=?", (key,)).fetchone()
                if row and time.time() - row[1] < 7 * 86400:
                    body = json.loads(row[0])
                else:
                    # The local server is not subject to the public demo's request quota.
                    params = {"q": query, "limit": 10, "lang": "en"}
                    if country:
                        params["countrycode"] = country
                    request = urllib.request.Request(
                        base_url.rstrip("/") + "/?" + urllib.parse.urlencode(params),
                        headers={"User-Agent": "PlaceLens-local-prototype/0.2", "Accept": "application/json"})
                    self.last_request = time.monotonic()
                    with urllib.request.urlopen(request, timeout=6) as response:
                        body = json.load(response)
                    if not isinstance(body, dict) or not isinstance(body.get("features"), list):
                        raise ValueError("Invalid Photon response")
                    self.db.execute("INSERT OR REPLACE INTO cache VALUES (?, ?, ?)",
                                    (key, json.dumps(body), time.time()))
                    self.db.commit()
            hits = []
            for feature in body.get("features", []):
                props = feature.get("properties", {})
                name = props.get("name")
                coords = feature.get("geometry", {}).get("coordinates", [])
                osm_type, osm_id = props.get("osm_type"), props.get("osm_id")
                if (not isinstance(name, str) or not name or len(coords) != 2 or
                        osm_type not in {"N", "W", "R"} or not str(osm_id).isdigit()):
                    continue
                lon, lat = map(float, coords)
                if not all(map(math.isfinite, (lon, lat))) or abs(lat) > 90 or abs(lon) > 180:
                    continue
                if country and props.get("countrycode", "").upper() != country:
                    continue
                place = Place(f"osm:{osm_type}:{osm_id}", name, props.get("state", ""),
                              props.get("country", ""), lat, lon, (name,),
                              kind=props.get("osm_value", "place"), source="OpenStreetMap")
                try:
                    from rapidfuzz.fuzz import ratio
                    score = ratio(normalize(query), normalize(name)) / 100
                except ImportError:
                    from difflib import SequenceMatcher
                    score = SequenceMatcher(None, normalize(query), normalize(name)).ratio()
                hits.append(FuzzyMatch(place, name, score))
                with self.lock:
                    from dataclasses import asdict
                    self.db.execute("INSERT OR REPLACE INTO places VALUES (?, ?)",
                                    (place.id, json.dumps(asdict(place))))
                    self.db.commit()
            return tuple(sorted(hits, key=lambda h: -h.score)), "OpenStreetMap searched via Photon"
        except (OSError, urllib.error.URLError, ValueError, TypeError, KeyError) as exc:
            return (), f"OpenStreetMap unavailable ({type(exc).__name__}); showing local results only"
