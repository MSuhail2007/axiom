import unittest
from pathlib import Path
from unittest.mock import Mock

from catalog import Catalog, FuzzyMatch, Place
from resolver import Resolver, ReviewStore


class HistoricalReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not Path("data/geonames.sqlite").exists():
            raise unittest.SkipTest("Full local catalog required")
        cls.resolver = Resolver(Catalog(), ReviewStore(Path(":memory:")))
        cls.text = Path(__file__).with_name("historical_report.txt").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.resolver.catalog.conn.close()
        cls.resolver.reviews.db.close()

    def test_full_user_report_with_local_osm_and_no_ten_name_cutoff(self):
        client = Mock()
        # A competing exact OSM name must not erase the trusted historical alias.
        def search(name, country):
            if name.lower() == "cochin":
                other = Place("osm:N:999", "Cochin", "Kerala", "India", 10, 76, ("Cochin",), source="OpenStreetMap")
                return (FuzzyMatch(other, "Cochin", 1),), "Local Photon searched"
            return (), "Local Photon searched"
        client.search.side_effect = search
        self.resolver.photon = client
        results = self.resolver.resolve(self.text, mode="names", country="IN", use_osm=True)
        expected = {"madras": "Chennai", "cochin": "Kochi", "trichinopoly": "Tiruchirappalli",
            "tanjore": "Thanjavur", "coimbatore": "Coimbatore", "bangalore": "Bengaluru",
            "calicut": "Kozhikode", "bombay": "Mumbai", "poona": "Pune", "allahabad": "Prayagraj",
            "calcutta": "Kolkata", "trivandrum": "Thiruvananthapuram", "quilon": "Kollam"}
        geographic = {"coromandel coast": "coast", "malabar": "coast", "deccan": "plateau",
                      "hooghly": "river", "bengal": "region"}
        allowed = set(expected) | set(geographic) | {"europe", "lancashire"}
        self.assertEqual(len(results), 30)
        self.assertEqual({r["mention"].lower() for r in results}, allowed)
        for result in results:
            name = result["mention"].lower()
            self.assertEqual(self.text[result["start"]:result["end"]], result["mention"])
            self.assertEqual(result["input_mode"], "document")
            if name in expected:
                self.assertEqual(result["selected"]["name"], expected[name], name)
                self.assertEqual(result["score"], 100, name)
            elif name in geographic:
                self.assertEqual(result["selected"]["kind"], geographic[name], name)
            else:
                self.assertEqual(result["status"], "out_of_scope")
                self.assertFalse(result["candidates"])
        queries = [args.args[0].lower() for args in client.search.call_args_list]
        self.assertEqual(len(queries), len(set(queries)))
        self.assertGreater(len(queries), 10)
        self.assertIn("quilon", queries)

    def test_ordinary_prose_does_not_become_locations(self):
        text = "Merchants report commercial activity in reasonable conditions. Orders arriving from mills are working at full capacity. The High Courts approved certain provisions."
        self.assertEqual(self.resolver.resolve(text, mode="document", country="IN"), [])
