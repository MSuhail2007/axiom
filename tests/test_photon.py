import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from photon import Photon


class PhotonTests(unittest.TestCase):
    def setUp(self):
        self.client = Photon(Path(":memory:"))

    def tearDown(self):
        self.client.db.close()

    def test_response_cached_and_place_persisted(self):
        body = {"features": [{"properties": {"name": "Chennai", "state": "Tamil Nadu", "country": "India",
            "countrycode": "IN", "osm_type": "N", "osm_id": 1, "osm_value": "city"},
            "geometry": {"coordinates": [80.2, 13.0]}}]}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(body).encode())) as request:
            hits, note = self.client.search("chenai", "IN")
            cached, _ = self.client.search("chenai", "IN")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(hits, cached)
        self.assertGreater(hits[0].score, .8)
        self.assertEqual(self.client.get("osm:N:1").name, "Chennai")

    def test_failure_visible_and_not_cached(self):
        with patch("urllib.request.urlopen", side_effect=URLError("offline")):
            hits, note = self.client.search("chenai")
        self.assertEqual(hits, ())
        self.assertIn("unavailable", note)
        self.assertEqual(self.client.db.execute("SELECT COUNT(*) FROM cache").fetchone()[0], 0)

    def test_loopback_lookalike_hostname_is_rejected(self):
        with patch.dict("os.environ", {"PLACELENS_PHOTON_URL": "http://localhost.example.com/api"}):
            with patch("urllib.request.urlopen") as request:
                hits, note = self.client.search("chennai")
        self.assertEqual(hits, ())
        self.assertIn("unavailable", note)
        request.assert_not_called()
