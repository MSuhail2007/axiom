"""STHALAM workspace features backed by the local PlaceLens resolver."""
from collections import Counter
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import threading
import time
import xml.etree.ElementTree as ET
import zipfile

from catalog import DATA, normalize
from resolver import context_key


def profile(place):
    return {**place, "location_id": place["id"], "canonical_name": place["name"],
            "latitude": place["lat"], "longitude": place["lon"],
            "confidence": place.get("score", 0) / 100, "external_id": place["id"]}


def present(item, text):
    selected = item["selected"]
    # Browser strings use UTF-16 indices; Python spans use Unicode code points.
    utf16 = lambda offset: len(text[:offset].encode("utf-16-le")) // 2
    return {**item, **(profile(selected) if selected else {}),
        "location_id": selected["id"] if selected else None,
        "canonical_name": selected["name"] if selected else None,
        "start_char": utf16(item["start"]), "end_char": utf16(item["end"]),
        "confidence": item["score"] / 100 if item["score"] is not None else None,
        "resolution_method": item["method"],
        "status": "OUT_OF_SCOPE" if item["status"] == "out_of_scope" else "AMBIGUOUS" if item["needs_review"] else "RESOLVED",
        "candidates": [profile(p) for p in item["candidates"]],
        "explanation": " · ".join(f'{e["quote"]}: {e["basis"]}' if e["quote"] else e["basis"] for e in item["evidence"])}


def parse_upload(content_type, body):
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body)
    parts = [part for part in message.walk() if part.get_filename()]
    if len(parts) != 1:
        raise ValueError("Upload one TXT, DOCX or PDF file")
    part = parts[0]
    suffix = Path(part.get_filename()).suffix.lower()
    data = part.get_payload(decode=True)
    if suffix == ".txt":
        text = data.decode("utf-8-sig")
    elif suffix == ".docx":
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if archive.getinfo("word/document.xml").file_size > 20_000_000:
                raise ValueError("DOCX contents are too large")
            root = ET.fromstring(archive.read("word/document.xml"))
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text = "\n\n".join("".join(t.text or "" for t in p.findall(".//w:t", ns)) for p in root.findall(".//w:p", ns))
    elif suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("Upload an unencrypted PDF")
        if len(reader.pages) > 100:
            raise ValueError("PDFs may contain up to 100 pages")
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        raise ValueError("Supported file types: TXT, DOCX and PDF")
    if not text.strip():
        raise ValueError("No readable text found. Scanned PDFs require OCR before upload.")
    return text


class Workspace:
    def __init__(self, resolver, path=None):
        self.resolver = resolver
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path or DATA / "workspace.sqlite", check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, text TEXT, payload TEXT, created TEXT);
            CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY, text TEXT, item TEXT, status TEXT DEFAULT 'PENDING');
        """)
        self.db.commit()

    def analyze(self, text, mode="auto", use_osm=True):
        if not isinstance(text, str):
            raise ValueError("Text must be a string")
        started = time.perf_counter()
        with self.lock:
            results = self.resolver.resolve(text, mode=mode, country="IN", use_osm=use_osm, use_llm=False)
            items = [present(r, text) for r in results]
            scores = [r["confidence"] for r in items if r["confidence"] is not None]
            payload = {"original_text": text, "locations": items, "total_detected": len(items),
                "total_standardized": sum(r["status"] == "RESOLVED" for r in items),
                "ambiguous_count": sum(r["needs_review"] for r in items),
                "avg_confidence": sum(scores) / len(scores) if scores else 0,
                "score_label": "Name / alias similarity, not probability",
                "processing_time_ms": round((time.perf_counter() - started) * 1000, 1)}
            identity = hashlib.sha256(json.dumps([text, mode, use_osm]).encode()).hexdigest()
            self.db.execute("INSERT OR REPLACE INTO analyses VALUES (?, ?, ?, ?)",
                (identity, text, json.dumps(payload), datetime.now(timezone.utc).isoformat()))
            for item in items:
                if item["needs_review"]:
                    key = hashlib.sha256((normalize(item["mention"]) + context_key(text)).encode()).hexdigest()
                    self.db.execute("INSERT OR IGNORE INTO queue (id,text,item) VALUES (?,?,?)", (key, text, json.dumps(item)))
            self.db.commit()
            return payload

    def queue(self):
        with self.lock:
            rows = self.db.execute("SELECT id,text,item FROM queue WHERE status='PENDING' ORDER BY rowid DESC").fetchall()
        return [{**json.loads(item), "id": key, "context_snippet": text[max(0,json.loads(item)["start"]-90):json.loads(item)["end"]+90]}
                for key,text,item in rows]

    def decide(self, key, decision):
        action = decision.get("action")
        if action not in {"confirm", "reject"}:
            raise ValueError("Choose confirm or reject")
        with self.lock:
            row = self.db.execute("SELECT text,item,status FROM queue WHERE id=?", (key,)).fetchone()
            if not row:
                raise ValueError("Review item not found")
            if row[2] != "PENDING":
                raise ValueError("This item has already been reviewed")
            text, item = row[0], json.loads(row[1])
            selected = None
            if action == "confirm":
                selected = next((c for c in item["candidates"] if c["location_id"] == str(decision.get("selected_canonical_id"))), None)
                if not selected:
                    raise ValueError("Select one of this mention's candidates")
                self.resolver.reviews.save(item["mention"], text, selected["location_id"])
            self.db.execute("UPDATE queue SET status=? WHERE id=?", ("CONFIRMED" if selected else "REJECTED", key))
            self.db.commit()
            return {"status": "CONFIRMED" if selected else "REJECTED", "canonical_name": selected["canonical_name"] if selected else None}

    def overview(self):
        with self.lock:
            rows = self.db.execute("SELECT payload FROM analyses ORDER BY created DESC").fetchall()
            pending = self.db.execute("SELECT COUNT(*) FROM queue WHERE status='PENDING'").fetchone()[0]
        items = [item for row in rows for item in json.loads(row[0])["locations"]]
        resolved = [x for x in items if x["status"] == "RESOLVED"]
        scores = [x["confidence"] for x in items if x["confidence"] is not None]
        return {"documents_processed": len(rows), "locations_detected": len(items), "locations_standardized": len(resolved),
            "avg_confidence": round(100 * sum(scores) / len(scores), 1) if scores else 0,
            "ambiguous_count": sum(x["needs_review"] for x in items), "pending_reviews_count": pending,
            "resolution_methods": dict(Counter(x["resolution_method"] for x in items)),
            "top_canonical_locations": [{"name": k, "count": v} for k,v in Counter(x["canonical_name"] for x in resolved).most_common(8)],
            "top_aliases": [{"mention": k, "count": v} for k,v in Counter(x["mention"] for x in resolved).most_common(8)],
            "recent_activity": [{"id": i, "mention": x["mention"], "canonical_name": x["canonical_name"] or x["status"],
                                 "confidence": round((x["confidence"] or 0)*100,1), "method": x["resolution_method"]} for i,x in enumerate(items[:8])]}

    def detail(self, place_id):
        catalog = self.resolver.catalog
        place = catalog.get(place_id)
        if not place and self.resolver.photon:
            place = self.resolver.photon.get(place_id)
        if not place or place.country != "India":
            raise ValueError("Indian location not found")
        aliases = set(place.aliases)
        if catalog.conn:
            aliases.update(row[0] for row in catalog.conn.execute("SELECT alias FROM aliases WHERE place_id=? LIMIT 300", (place_id,)))
        return {**profile(place.public()), "aliases": [{"alias": a, "alias_type": "catalog"} for a in sorted(aliases)],
                "aliases_count": len(aliases), "aliases_preview": sorted(aliases)[:5]}

    def locations(self, query="", limit=40):
        catalog = self.resolver.catalog
        if query:
            places = catalog.lookup(query)
            if not places and catalog.conn:
                rows = catalog.conn.execute("SELECT DISTINCT place_id FROM aliases WHERE alias LIKE ? LIMIT ?", (normalize(query)+"%", limit)).fetchall()
                places = [catalog.get(row[0]) for row in rows]
            if not places:
                places = catalog.fuzzy(query, 10)
        elif catalog.conn:
            places = [catalog.get(row[0]) for row in catalog.conn.execute("SELECT id FROM places WHERE kind='city' ORDER BY population DESC LIMIT ?", (limit,))]
        else:
            places = list(catalog.places.values())
        return [self.detail(p.id) for p in places if p and p.country == "India"][:limit]

    def location_page(self, query="", limit=40, offset=0):
        catalog = self.resolver.catalog
        term = normalize(query)
        if catalog.conn:
            condition = "country='India'"
            params = []
            if term:
                bundled = [p.id for p in catalog.places.values() if p.country == 'India'
                           and any(normalize(a).startswith(term) for a in (*p.aliases, p.name))]
                placeholders = ','.join('?' for _ in bundled) or 'NULL'
                condition += f" AND (id IN (SELECT place_id FROM aliases WHERE alias LIKE ?) OR id IN ({placeholders}))"
                params = [term + '%', *bundled]
            total = catalog.conn.execute(f"SELECT COUNT(*) FROM places WHERE {condition}", params).fetchone()[0]
            rows = catalog.conn.execute(f"SELECT id FROM places WHERE {condition} ORDER BY population DESC, id LIMIT ? OFFSET ?",
                                        [*params, limit, offset]).fetchall()
            places = [catalog.get(row[0]) for row in rows]
        else:
            matches = sorted((p for p in catalog.places.values() if p.country == 'India'
                              and (not term or any(normalize(a).startswith(term) for a in (*p.aliases, p.name)))),
                             key=lambda p: (-p.population, p.id))
            total, places = len(matches), matches[offset:offset+limit]
        suggested = False
        if term and total == 0:
            matches = [p for p in catalog.fuzzy(query, 20) if p.country == 'India']
            total, places, suggested = len(matches), matches[offset:offset+limit], True
        return {"items": [self.detail(p.id) for p in places], "total": total,
                "offset": offset, "limit": limit, "suggested": suggested}
