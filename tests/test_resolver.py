import unittest
import json
import io
import os
from pathlib import Path
from unittest.mock import patch

from catalog import Catalog, FuzzyMatch, Place, normalize
from resolver import Mention, Resolver, ReviewStore


class ResolverTests(unittest.TestCase):
    def setUp(self):
        self.resolver = Resolver(Catalog(Path("data/missing.sqlite")), ReviewStore(Path(":memory:")))

    def tearDown(self):
        self.resolver.reviews.db.close()

    def place(self, text, mention="Aurangabad"):
        return next(r for r in self.resolver.resolve(text, use_llm=False) if r["mention"] == mention)

    def test_mixed_script_state_evidence_resolves_bihar(self):
        text = "Heavy rain closed roads in Aurangabad. बिहार disaster officials in Patna sent rescue teams."
        result = self.place(text)
        self.assertEqual(result["selected"]["state"], "Bihar")
        self.assertIn("बिहार", [e["quote"] for e in result["evidence"]])

    def test_ambiguous_name_without_clue_abstains(self):
        result = self.place("Heavy rain closed roads in Aurangabad. Officials sent rescue teams.")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(len(result["candidates"]), 2)

    def test_conflicting_states_abstain(self):
        result = self.place("Aurangabad was mentioned in reports from Bihar and Maharashtra.")
        self.assertEqual(result["status"], "unresolved")

    def test_correction_is_scoped(self):
        original = "Heavy rain closed roads in Aurangabad. Officials sent rescue teams."
        candidate = next(p for p in self.place(original)["candidates"] if p["state"] == "Bihar")
        self.resolver.reviews.save("Aurangabad", original, candidate["id"])
        self.assertEqual(self.place(original)["method"], "human review")
        other = self.place("Aurangabad hosted a public meeting. Officials spoke.")
        self.assertEqual(other["status"], "unresolved")

    def test_curated_alias_and_short_abbreviation(self):
        self.assertEqual(self.resolver.resolve("Flooding near Bombay.", use_llm=False)[0]["selected"]["name"], "Mumbai")
        hyd = next(r for r in self.resolver.resolve("Flights from Hyd were delayed.", use_llm=False) if r["mention"] == "Hyd")
        self.assertEqual(hyd["status"], "unresolved")

    def test_spelling_scan_works_without_ner(self):
        self.resolver._nlp = None
        results = self.resolver.resolve("Floods hit Bangalroe and Kolkta. Officials met in New Deli.", use_llm=False)
        found = {item["mention"]: item for item in results}
        self.assertEqual(found["Bangalroe"]["selected"]["name"], "Bengaluru")
        self.assertEqual(found["Kolkta"]["selected"]["name"], "Kolkata")
        self.assertEqual(found["New Deli"]["selected"]["name"], "New Delhi")
        self.assertTrue(all(found[name]["needs_review"] for name in found))

    def test_ordinary_report_does_not_create_place(self):
        self.assertEqual(self.resolver.resolve("Heavy rain disrupted traffic. Officials sent rescue teams.", use_llm=False), [])

    def test_full_catalog_finds_non_demo_place_and_typo(self):
        if not Path("data/geonames.sqlite").exists():
            self.skipTest("GeoNames catalog not imported")
        resolver = Resolver(Catalog(), ReviewStore(Path(":memory:")))
        resolver._nlp = None
        try:
            for mention in ("Ranchi", "Ranchii"):
                result = next(r for r in resolver.resolve(f"Heavy rain in {mention}. Jharkhand officials responded.", use_llm=False)
                              if r["mention"] == mention)
                self.assertEqual(result["selected"]["name"], "Ranchi")
            state = next(r for r in resolver.resolve("बिहार officials responded.", use_llm=False)
                         if r["mention"] == "बिहार")
            self.assertEqual(state["selected"]["kind"], "state")
        finally:
            resolver.reviews.db.close()
            resolver.catalog.conn.close()

    def test_unicode_vowel_marks_are_preserved(self):
        self.assertEqual(normalize("बिहार"), "बिहार")
        self.assertEqual(normalize("తెలంగాణ"), "తెలంగాణ")

    def test_every_entered_name_returns_scored_candidates(self):
        results = self.resolver.resolve("xumbaq\npne\nBangalroe\n???", mode="names")
        self.assertEqual([r["mention"] for r in results], ["xumbaq", "pne", "Bangalroe", "???"])
        weak = results[0]
        self.assertLess(weak["score"], 80)
        self.assertTrue(weak["suggestions_required"])
        self.assertIsNone(weak["selected"])
        self.assertTrue(any(p["name"] == "Mumbai" for p in weak["candidates"]))
        self.assertTrue(all("score" in p for r in results for p in r["candidates"]))
        self.assertEqual(results[-1]["score"], 0)

    def test_below_80_cannot_be_auto_selected_by_state_context(self):
        mumbai = self.resolver.catalog.get("1275339")
        with patch.object(self.resolver.catalog, "fuzzy_matches", return_value=(FuzzyMatch(mumbai, "mumbai", .79),)):
            result = self.resolver.resolve("xumbaq, Maharashtra", mode="names")[0]
        self.assertEqual(result["score"], 79)
        self.assertIsNone(result["selected"])
        self.assertTrue(result["needs_review"])

    def test_80_is_not_below_threshold(self):
        mumbai = self.resolver.catalog.get("1275339")
        with patch.object(self.resolver.catalog, "fuzzy_matches", return_value=(FuzzyMatch(mumbai, "mumbai", .80),)):
            result = self.resolver.resolve("xumbaq", mode="names")[0]
        self.assertEqual(result["score"], 80)
        self.assertFalse(result["suggestions_required"])

    def test_unknown_ner_mention_is_not_dropped(self):
        from types import SimpleNamespace
        self.resolver._nlp = lambda text: SimpleNamespace(ents=[SimpleNamespace(
            label_="GPE", text="zzzzz", start_char=0, end_char=5)])
        result = self.resolver.resolve("zzzzz was affected.", mode="document")[0]
        self.assertEqual(result["mention"], "zzzzz")

    def test_external_candidates_are_scored_and_reviewable(self):
        from unittest.mock import Mock
        place = Place("osm:N:123", "Testville", "", "Example", 1, 2, ("Testville",), source="OpenStreetMap")
        client = Mock()
        client.search.return_value = ((FuzzyMatch(place, "Testville", .7),), "OpenStreetMap searched via Photon")
        client.get.return_value = place
        self.resolver.photon = client
        result = self.resolver.resolve("tstvl", mode="names", use_osm=True)[0]
        self.assertTrue(any(p["source"] == "OpenStreetMap" and p["score"] == 70 for p in result["candidates"]))
        self.resolver.reviews.save("tstvl", "tstvl", place.id)
        reviewed = self.resolver.resolve("tstvl", mode="names", use_osm=True)[0]
        self.assertEqual(reviewed["selected"]["id"], place.id)
        self.assertEqual(reviewed["method"], "human review")
        self.assertEqual(reviewed["score"], 70)
        offline = self.resolver.resolve("tstvl", mode="names", use_osm=False)[0]
        self.assertEqual(offline["selected"]["id"], place.id)
        self.assertLess(offline["score"], 80)

    def test_external_failure_keeps_local_candidates(self):
        from unittest.mock import Mock
        self.resolver.photon = Mock()
        self.resolver.photon.search.return_value = ((), "OpenStreetMap unavailable; showing local results only")
        result = self.resolver.resolve("bangalroe", mode="names", use_osm=True)[0]
        self.assertTrue(any(p["name"] == "Bengaluru" for p in result["candidates"]))
        self.assertTrue(any("unavailable" in e["basis"] for e in result["evidence"]))

    def test_llm_choice_requires_candidate_specific_quote(self):
        candidates = self.resolver.catalog.lookup("Aurangabad")
        bihar = next(p for p in candidates if p.state == "Bihar")
        text = "Aurangabad was affected. बिहार officials responded."

        def fake_response(quote):
            choice = {"chosen_id": bihar.id, "evidence_quote": quote}
            body = {"output": [{"content": [{"type": "output_text", "text": json.dumps(choice)}]}]}
            return io.BytesIO(json.dumps(body).encode())

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            with patch("urllib.request.urlopen", return_value=fake_response("बिहार")):
                self.assertEqual(self.resolver._llm_choose(text, Mention("Aurangabad", 0, 10, "alias"), candidates)[0].id,
                                 bihar.id)
            with patch("urllib.request.urlopen", return_value=fake_response("was affected")):
                self.assertIsNone(self.resolver._llm_choose(text, Mention("Aurangabad", 0, 10, "alias"), candidates))


if __name__ == "__main__":
    unittest.main()
