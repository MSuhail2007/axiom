"""Small dependency-free local review UI and JSON API."""

from __future__ import annotations

import json
import socket
import mimetypes
from urllib.parse import urlsplit, parse_qs, unquote
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from resolver import Resolver
from workspace import Workspace, parse_upload

ROOT = Path(__file__).resolve().parent
resolver = Resolver()
workspace = Workspace(resolver)


class LocalServer(ThreadingHTTPServer):
    # Windows otherwise permits multiple Python servers to share this port,
    # leaving a previous resolver serving requests after a restart.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        query = parse_qs(urlsplit(self.path).query)
        if path.startswith("/api/v1/"):
            try:
                with workspace.lock:
                    if path == "/api/v1/analytics/overview":
                        result = workspace.overview()
                    elif path == "/api/v1/review/queue":
                        result = workspace.queue()
                    elif path == "/api/v1/catalog":
                        result = workspace.location_page(query.get("q", [""])[0][:100],
                            min(100, max(1, int(query.get("limit", [40])[0]))),
                            max(0, int(query.get("offset", [0])[0])))
                    elif path in {"/api/v1/locations", "/api/v1/locations/search"}:
                        result = workspace.locations(query.get("q", [""])[0][:100], min(100,max(1,int(query.get("limit", [40])[0]))))
                    elif path.startswith("/api/v1/locations/"):
                        result = workspace.detail(path.rsplit("/",1)[-1])
                    else:
                        self.json(404, {"detail": "Endpoint not found"})
                        return
                self.json(200, result)
            except ValueError as exc:
                self.json(400, {"detail": str(exc)})
        elif path.startswith("/assets/"):
            base = (ROOT / "frontend" / "dist").resolve()
            asset = (base / path.lstrip("/")).resolve()
            if asset.is_relative_to(base / "assets") and asset.is_file():
                self._send(200, asset.read_bytes(), mimetypes.guess_type(asset.name)[0] or "application/octet-stream")
            else:
                self.json(404, {"error": "Asset not found"})
        elif path == "/sthalam-logo.png":
            logo = ROOT / "frontend" / "dist" / "sthalam-logo.png"
            if not logo.exists():
                logo = ROOT / "frontend" / "public" / "sthalam-logo.png"
            if logo.is_file():
                self._send(200, logo.read_bytes(), "image/png")
            else:
                self.json(404, {"error": "Logo not found"})
        elif path == "/":
            index = ROOT / "frontend" / "dist" / "index.html"
            if not index.exists():
                index = ROOT / "static" / "index.html"
            self._send(200, index.read_bytes(), "text/html; charset=utf-8")
        elif path == "/legacy":
            self._send(200, (ROOT / "static" / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/app.js":
            self._send(200, (ROOT / "static" / "app.js").read_bytes(), "text/javascript; charset=utf-8")
        elif self.path == "/style.css":
            self._send(200, (ROOT / "static" / "style.css").read_bytes(), "text/css; charset=utf-8")
        elif path in {"/api/status", "/health"}:
            try:
                with socket.create_connection(("127.0.0.1", 2322), timeout=.3):
                    photon_ready = True
            except OSError:
                photon_ready = False
            self.json(200, {"spacy": resolver._nlp is not None,
                            "geonames": resolver.catalog.conn is not None,
                            "llm": False, "local_only": True, "photon": photon_ready, "country": "IN"})
        else:
            self.json(404, {"error": "Not found"})

    def json(self, status: int, payload: dict):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > (10_000_000 if self.path == "/api/v1/standardize/upload" else 100000):
                raise ValueError("Request body is too large or empty")
            if self.path == "/api/v1/standardize/upload":
                try:
                    text = parse_upload(self.headers.get("Content-Type", ""), self.rfile.read(size))
                except Exception as exc:
                    raise ValueError(f"Could not read document: {exc}") from exc
                self.json(200, workspace.analyze(text))
                return
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
            if self.path == "/api/v1/standardize":
                self.json(200, workspace.analyze(data.get("text", ""), data.get("mode", "auto"), data.get("use_osm", True) is True))
            elif self.path.startswith("/api/v1/review/") and self.path.endswith("/decision"):
                self.json(200, workspace.decide(self.path.split("/")[-2], data))
            elif self.path == "/api/resolve":
                text = data.get("text", "")
                with workspace.lock:
                    results = resolver.resolve(text, use_llm=False, mode=data.get("mode", "auto"), use_osm=data.get("use_osm") is True, country="IN")
                self.json(200, {"results": results, "text": text})
            elif self.path == "/api/review":
                text, mention, place_id = data["text"], data["mention"], str(data["place_id"])
                if not isinstance(text, str) or not isinstance(mention, str) or len(text) > 20000:
                    raise ValueError("Invalid review text")
                options = {"mode": data.get("mode", "auto"), "use_osm": data.get("use_osm") is True,
                           "country": "IN"}
                valid = next((r for r in resolver.resolve(text, use_llm=False, **options)
                              if r["mention"] == mention and any(p["id"] == place_id for p in r["candidates"])), None)
                if not valid:
                    raise ValueError("Review must select a candidate for a mention in this text")
                resolver.reviews.save(mention, text, place_id, str(data.get("note", "")))
                self.json(200, {"results": resolver.resolve(text, use_llm=False, **options)})
            else:
                self.json(404, {"error": "Not found"})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            self.json(400, {"error": str(exc), "detail": str(exc)})


if __name__ == "__main__":
    server = LocalServer(("127.0.0.1", 8765), Handler)
    print("PlaceLens running at http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
