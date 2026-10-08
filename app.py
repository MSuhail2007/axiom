"""Small dependency-free local review UI and JSON API."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from resolver import Resolver

ROOT = Path(__file__).resolve().parent
resolver = Resolver()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            self._send(200, (ROOT / "static" / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/app.js":
            self._send(200, (ROOT / "static" / "app.js").read_bytes(), "text/javascript; charset=utf-8")
        elif self.path == "/style.css":
            self._send(200, (ROOT / "static" / "style.css").read_bytes(), "text/css; charset=utf-8")
        elif self.path == "/api/status":
            self.json(200, {"spacy": resolver._nlp is not None,
                            "geonames": resolver.catalog.conn is not None,
                            "llm": bool(__import__("os").getenv("OPENAI_API_KEY"))})
        else:
            self.json(404, {"error": "Not found"})

    def json(self, status: int, payload: dict):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 100000:
                raise ValueError("Request body is too large or empty")
            data = json.loads(self.rfile.read(size))
            if self.path == "/api/resolve":
                text = data.get("text", "")
                self.json(200, {"results": resolver.resolve(text, use_llm=data.get("use_llm") is True,
                    mode=data.get("mode", "auto"), use_osm=data.get("use_osm") is True, country=data.get("country", "")), "text": text})
            elif self.path == "/api/review":
                text, mention, place_id = data["text"], data["mention"], str(data["place_id"])
                if not isinstance(text, str) or not isinstance(mention, str) or len(text) > 20000:
                    raise ValueError("Invalid review text")
                options = {"mode": data.get("mode", "auto"), "use_osm": data.get("use_osm") is True,
                           "country": data.get("country", "")}
                valid = next((r for r in resolver.resolve(text, use_llm=False, **options)
                              if r["mention"] == mention and any(p["id"] == place_id for p in r["candidates"])), None)
                if not valid:
                    raise ValueError("Review must select a candidate for a mention in this text")
                resolver.reviews.save(mention, text, place_id, str(data.get("note", "")))
                self.json(200, {"results": resolver.resolve(text, use_llm=False, **options)})
            else:
                self.json(404, {"error": "Not found"})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            self.json(400, {"error": str(exc)})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("PlaceLens running at http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
