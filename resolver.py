"""Evidence-first place resolution with an explicit abstention path."""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from catalog import BUNDLED, DATA, Catalog, FuzzyMatch, Place, normalize
from photon import Photon

STATE_ALIASES = {
    "andhra pradesh": ("Andhra Pradesh", "आंध्र प्रदेश"),
    "arunachal pradesh": ("Arunachal Pradesh",),
    "assam": ("Assam", "असम"),
    "bihar": ("Bihar", "बिहार"),
    "chhattisgarh": ("Chhattisgarh", "छत्तीसगढ़"),
    "dadra and nagar haveli and daman and diu": ("Dadra and Nagar Haveli and Daman and Diu",),
    "goa": ("Goa", "गोवा"),
    "maharashtra": ("Maharashtra", "महाराष्ट्र", "महाराष्ट्‍र"),
    "telangana": ("Telangana", "तेलंगाना", "తెలంగాణ"),
    "karnataka": ("Karnataka", "कर्नाटक", "ಕರ್ನಾಟಕ"),
    "tamil nadu": ("Tamil Nadu", "तमिलनाडु", "தமிழ்நாடு"),
    "west bengal": ("West Bengal", "पश्चिम बंगाल", "পশ্চিমবঙ্গ"),
    "rajasthan": ("Rajasthan", "राजस्थान"),
    "delhi": ("Delhi", "दिल्ली"),
    "uttar pradesh": ("Uttar Pradesh", "उत्तर प्रदेश"),
    "gujarat": ("Gujarat", "गुजरात", "ગુજરાત"),
    "haryana": ("Haryana", "हरियाणा"),
    "himachal pradesh": ("Himachal Pradesh",),
    "jammu and kashmir": ("Jammu and Kashmir",),
    "jharkhand": ("Jharkhand", "झारखंड"),
    "kerala": ("Kerala", "केरल", "കേരളം"),
    "ladakh": ("Ladakh", "लद्दाख"),
    "madhya pradesh": ("Madhya Pradesh", "मध्य प्रदेश"),
    "manipur": ("Manipur",),
    "meghalaya": ("Meghalaya",),
    "mizoram": ("Mizoram",),
    "nagaland": ("Nagaland",),
    "odisha": ("Odisha", "ओडिशा"),
    "punjab": ("Punjab", "पंजाब"),
    "sikkim": ("Sikkim",),
    "tripura": ("Tripura",),
    "andaman and nicobar islands": ("Andaman and Nicobar Islands",),
    "chandigarh": ("Chandigarh",),
    "lakshadweep": ("Lakshadweep",),
    "puducherry": ("Puducherry", "Pondicherry"),
    "uttarakhand": ("Uttarakhand",),
}
COUNTRY_ALIASES = {"india": ("India", "भारत"), "pakistan": ("Pakistan", "पाकिस्तान")}
LATIN_WORD = re.compile(r"[A-Za-z][A-Za-z'’.-]*")
LOCATION_CUES = {"in", "near", "from", "at", "to", "around", "outside", "within", "across", "toward", "towards", "visited", "reached"}
SCAN_STOPWORDS = {"about", "after", "also", "among", "before", "between", "could", "district", "during", "flooding", "government", "heavy", "however", "india", "indian", "later", "local", "officials", "people", "police", "reports", "report", "rescue", "several", "state", "storm", "their", "there", "these", "those", "today", "tomorrow", "traffic", "weather", "where", "while", "would", "yesterday"}
ADMIN_TERMS = {normalize(alias) for group in (*STATE_ALIASES.values(), *COUNTRY_ALIASES.values()) for alias in group}
ADMIN_SKIP = {normalize(alias) for group in COUNTRY_ALIASES.values() for alias in group}
# Scope annotations do not geocode foreign names into similarly spelled Indian villages.
OUTSIDE_INDIA = {"europe", "africa", "antarctica", "north america", "south america", "lancashire"}


def has_term(text: str, term: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.IGNORECASE) is not None


def first_term(text: str, aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        if has_term(text, alias):
            return alias
    return None


def context_clues(text: str) -> tuple[dict[str, str], dict[str, str]]:
    states = {key: hit for key, aliases in STATE_ALIASES.items() if (hit := first_term(text, aliases))}
    countries = {key: hit for key, aliases in COUNTRY_ALIASES.items() if (hit := first_term(text, aliases))}
    return states, countries


def context_key(text: str) -> str:
    states, countries = context_clues(text)
    if states or countries:
        return json.dumps({"states": sorted(states), "countries": sorted(countries)}, sort_keys=True)
    return "text:" + hashlib.sha256(normalize(text).encode()).hexdigest()[:24]


@dataclass(frozen=True)
class Mention:
    text: str
    start: int
    end: int
    source: str


class ReviewStore:
    def __init__(self, path: Path | None = None):
        self.path = path or DATA / "reviews.sqlite"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.execute("""CREATE TABLE IF NOT EXISTS reviews (
            mention TEXT NOT NULL, context_key TEXT NOT NULL, place_id TEXT NOT NULL,
            note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (mention, context_key))""")
        self.db.commit()

    def get(self, mention: str, text: str) -> str | None:
        row = self.db.execute("SELECT place_id FROM reviews WHERE mention=? AND context_key=?",
                              (normalize(mention), context_key(text))).fetchone()
        return row[0] if row else None

    def save(self, mention: str, text: str, place_id: str, note: str = "") -> None:
        self.db.execute("""INSERT INTO reviews (mention, context_key, place_id, note)
            VALUES (?, ?, ?, ?) ON CONFLICT(mention, context_key)
            DO UPDATE SET place_id=excluded.place_id, note=excluded.note,
                          created_at=CURRENT_TIMESTAMP""",
            (normalize(mention), context_key(text), place_id, note[:500]))
        self.db.commit()


class Resolver:
    def __init__(self, catalog: Catalog | None = None, reviews: ReviewStore | None = None):
        self.catalog = catalog or Catalog()
        self.reviews = reviews or ReviewStore()
        self.photon = None
        self._nlp = None
        try:
            import spacy
            self._nlp = spacy.load("en_core_web_sm")
        except (ImportError, OSError):
            pass
        self._patterns = []
        for place in BUNDLED:
            for alias in place.aliases:
                self._patterns.append(alias)
        for aliases in STATE_ALIASES.values():
            self._patterns.extend(aliases)
        self._patterns = sorted(set(self._patterns), key=len, reverse=True)

    def extract(self, text: str) -> list[Mention]:
        found: list[Mention] = []
        for alias in self._patterns:
            flags = 0 if alias in {"BLR", "BOM", "MAA", "CCU"} else re.IGNORECASE
            for match in re.finditer(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", text, flags):
                found.append(Mention(match.group(), match.start(), match.end(), "alias"))
        ordinary = set()
        if self._nlp:
            doc = self._nlp(text)
            if hasattr(doc, "__iter__"):
                ordinary = {token.idx for token in doc if token.pos_ not in {"PROPN", "X"}}
            for ent in doc.ents:
                if ent.label_ in {"ORG", "PERSON", "DATE", "TIME", "MONEY", "CARDINAL", "ORDINAL", "QUANTITY"} and not self.catalog.lookup(ent.text):
                    if hasattr(ent, "__iter__"):
                        ordinary.update(token.idx for token in ent)
                if ent.label_ in {"GPE", "LOC", "FAC"} and normalize(ent.text) not in ADMIN_SKIP:
                    trimmed = re.sub(r"^(?:the|a|an)\s+", "", ent.text, flags=re.IGNORECASE)
                    found.append(Mention(trimmed, ent.end_char - len(trimmed), ent.end_char, "ner"))
        found.extend(self._spelling_mentions(text, ordinary))
        found.sort(key=lambda m: (m.start, -(m.end - m.start), m.source != "ner"))
        selected: list[Mention] = []
        for mention in found:
            if not any(mention.start < prior.end and prior.start < mention.end for prior in selected):
                selected.append(mention)
        return selected

    def _spelling_mentions(self, text: str, ordinary: set[int] | None = None) -> list[Mention]:
        """Find likely Latin-script names even when NER misses their misspellings."""
        words = list(LATIN_WORD.finditer(text))
        found = []
        for index, word in enumerate(words):
            token = word.group().strip(".'’- ")
            if ordinary and word.start() in ordinary:
                continue
            if token.casefold() in SCAN_STOPWORDS:
                continue
            previous = words[index - 1].group().lower().strip(".'’- ") if index else ""
            cue = previous in LOCATION_CUES
            if not (token[:1].isupper() or cue):
                continue
            if not token or token.casefold() in {"the", "a", "an"}:
                continue
            for end_index in range(index, min(index + 3, len(words))):
                if end_index > index:
                    prior, following = words[end_index - 1], words[end_index]
                    if not text[prior.end():following.start()].isspace() or not following.group()[:1].isupper():
                        break
                phrase = text[word.start():words[end_index].end()].strip(".'’- ")
                if not phrase or normalize(phrase) in ADMIN_SKIP:
                    continue
                if cue and token[:1].isupper() and end_index == index:
                    found.append(Mention(phrase, word.start(), word.start() + len(phrase), "location cue"))
                exact = self.catalog.lookup(phrase)
                if exact:
                    if cue or any(p.id in self.catalog.places or p.population >= 1000 or p.kind != "city" for p in exact):
                        found.append(Mention(phrase, word.start(), word.start() + len(phrase), "gazetteer scan"))
                    continue
                hits = self.catalog.fuzzy_matches(phrase, 3)
                if not hits:
                    continue
                best = hits[0]
                threshold = 0.80 if len(phrase) <= 5 else (0.84 if len(phrase) <= 7 else 0.86)
                # An unusual small village needs a stronger spelling match and a location cue.
                prominent = best.place.id in self.catalog.places or best.place.population >= 5000
                if best.score >= threshold and (prominent or (cue and best.score >= 0.92)):
                    found.append(Mention(phrase, word.start(), word.start() + len(phrase), "spelling scan"))
        return found

    def resolve(self, text: str, use_context: bool = True, use_llm: bool = False,
                mode: str = "auto", use_osm: bool = False, country: str = "") -> list[dict]:
        if not text or len(text) > 20000:
            raise ValueError("Text must contain 1 to 20,000 characters.")
        if mode not in {"auto", "names", "document"}:
            raise ValueError("Unknown search mode")
        if country not in {"", "IN"}:
            raise ValueError("Choose India or worldwide coverage")
        # Long prose must never become comma-separated fuzzy searches of sentence fragments.
        prose = len(text.split()) > 12 and bool(re.search(r"[.!?](?:\s|$)", text))
        if mode == "auto":
            mode = "document" if re.search(r"[.!?](?:\s|$)", text) else "names"
        elif mode == "names" and prose:
            mode = "document"
        if mode == "names":
            mentions = [Mention(m.group().strip(), m.start() + len(m.group()) - len(m.group().lstrip()),
                                m.end() - len(m.group()) + len(m.group().rstrip()), "entered name")
                        for m in re.finditer(r"[^,;\n]+", text) if m.group().strip()]
            if len(mentions) > 100:
                raise ValueError("Search up to 100 place names at a time")
        else:
            mentions = self.extract(text)
        output = []
        local_queries = {}
        for mention in mentions:
            # Geographic clues in another paragraph must not choose this mention's location.
            before = text.rfind("\n\n", 0, mention.start)
            after = text.find("\n\n", mention.end)
            paragraph = text[before + 2 if before >= 0 else 0:after if after >= 0 else len(text)]
            states, countries = context_clues(paragraph) if use_context else ({}, {})
            if country == "IN" and normalize(mention.text) in OUTSIDE_INDIA:
                output.append({"mention": mention.text, "start": mention.start, "end": mention.end,
                    "source": mention.source, "status": "out_of_scope", "selected": None, "candidates": [],
                    "score": None, "method": "outside India coverage", "threshold": 80,
                    "suggestions_required": False, "needs_review": False, "input_mode": mode,
                    "evidence": [{"quote": mention.text, "basis": "Recognized foreign geographic name; not matched to Indian places"}]})
                continue
            candidates = self.catalog.lookup(mention.text)
            if country:
                candidates = [p for p in candidates if p.country == "India"]
            match_type = "exact alias"
            exact_candidates = list(candidates)
            fuzzy_hits = ()
            if not candidates:
                fuzzy_hits = self.catalog.fuzzy_matches(mention.text, 10, broad=True)
                candidates = [hit.place for hit in fuzzy_hits]
                match_type = "spelling similarity"
            if country:
                fuzzy_hits = tuple(hit for hit in fuzzy_hits if hit.place.country == "India")
                candidates = [p for p in candidates if p.country == "India"]
            source_note = "Local GeoNames catalog searched"
            if use_osm:
                if self.photon is None:
                    self.photon = Photon()
                query_key = normalize(mention.text)
                if query_key not in local_queries:
                    local_queries[query_key] = self.photon.search(mention.text, country)
                external, source_note = local_queries[query_key]
                if external:
                    local = fuzzy_hits or tuple(FuzzyMatch(p, mention.text, 1.0) for p in candidates)
                    fuzzy_hits = tuple(sorted((*local, *external), key=lambda h: -h.score))
                    candidates = [hit.place for hit in fuzzy_hits]
            candidates = candidates[:20]
            selected: Place | None = None
            evidence = [{"quote": mention.text, "basis": match_type}, {"quote": "", "basis": source_note}]
            if fuzzy_hits:
                evidence.append({"quote": fuzzy_hits[0].alias,
                                 "basis": f"Closest known spelling ({fuzzy_hits[0].score:.0%} text similarity)"})
            method = "unresolved"
            reviewed = self.reviews.get(mention.text, text) if use_context else None
            if reviewed:
                selected = self.catalog.get(reviewed)
                if not selected and reviewed.startswith("osm:"):
                    if self.photon is None:
                        self.photon = Photon()
                    selected = self.photon.get(reviewed)
                if selected and country == "IN" and selected.country != "India":
                    selected = None
                if selected:
                    method = "human review"
                    evidence.append({"quote": "", "basis": "Prior correction with matching context"})
            if not selected and candidates:
                state_candidates = [p for p in exact_candidates if p.kind == "state"]
                regions = [p for p in exact_candidates if p.kind in {"coast", "region", "historical region", "plateau"}]
                rivers = [p for p in exact_candidates if p.kind == "river"]
                prefix = text[max(0, mention.start - 35):mention.start].lower()
                if len(rivers) == 1 and re.search(r"(?:on|along|across|down|banks of)\s+(?:the\s+)?$", prefix):
                    selected, method = rivers[0], "river context"
                elif len(regions) == 1 and mode == "document":
                    selected, method = regions[0], "geographic region"
                if selected:
                    pass
                elif (match_type == "exact alias" and len(state_candidates) == 1
                        and normalize(mention.text) in ADMIN_TERMS
                        and normalize(mention.text) not in {"delhi", "chandigarh", "puducherry"}):
                    selected, method = state_candidates[0], "administrative name"
                elif len(exact_candidates) == 1 and len(normalize(mention.text)) > 4:
                    selected, method = exact_candidates[0], "unambiguous alias"
                elif use_context:
                    # Weaker spelling alternatives must not block a strong context match.
                    eligible = {hit.place.id for hit in fuzzy_hits if hit.score >= fuzzy_hits[0].score - 0.03} if fuzzy_hits else {p.id for p in candidates}
                    state_matches = [p for p in candidates if normalize(p.state) in states and p.id in eligible]
                    if len(state_matches) == 1:
                        selected, method = state_matches[0], "state evidence"
                        evidence.append({"quote": states[normalize(selected.state)], "basis": "State named in document"})
                    else:
                        country_matches = [p for p in candidates if normalize(p.country) in countries]
                        if len(country_matches) == 1 and not state_matches:
                            selected, method = country_matches[0], "country evidence"
                            evidence.append({"quote": countries[normalize(selected.country)], "basis": "Country named in document"})
                if not selected and exact_candidates:
                    cities = sorted((p for p in exact_candidates if p.kind == "city"), key=lambda p: -p.population)
                    if cities and cities[0].population >= 100000 and (len(cities) == 1 or cities[0].population >= 10 * max(1, cities[1].population)):
                        selected, method = cities[0], "city prominence suggestion"
                        evidence.append({"quote": mention.text, "basis": "Exact historical/current alias of the dominant city; other namesakes retained for review"})
                if not selected and fuzzy_hits and not exact_candidates:
                    first = fuzzy_hits[0]
                    runner_up = fuzzy_hits[1].score if len(fuzzy_hits) > 1 else 0
                    rivals = [hit for hit in fuzzy_hits[1:] if hit.place.id in self.catalog.places
                              or hit.place.population >= 100000]
                    rival_score = rivals[0].score if rivals else 0
                    nearby_duplicate = (len(fuzzy_hits) > 1 and first.alias == fuzzy_hits[1].alias
                                        and first.place.country == fuzzy_hits[1].place.country
                                        and abs(first.place.lat - fuzzy_hits[1].place.lat) < 0.2
                                        and abs(first.place.lon - fuzzy_hits[1].place.lon) < 0.2)
                    if (first.score >= 0.84 and
                            (first.score - runner_up >= 0.06 or
                             (first.place.id in self.catalog.places and first.score - rival_score >= 0.06) or
                             (first.place.id in self.catalog.places and nearby_duplicate))):
                        selected, method = first.place, "spelling suggestion"
            if not selected and len(candidates) > 1 and use_context and use_llm and os.getenv("OPENAI_API_KEY"):
                choice = self._llm_choose(text, mention, candidates)
                if choice:
                    selected, quote = choice
                    method = "LLM suggestion"
                    evidence.append({"quote": quote, "basis": "Context quoted by model; verify before relying on it"})
            scores = {hit.place.id: round(hit.score * 100, 1) for hit in fuzzy_hits}
            if selected and selected.id not in scores and selected not in candidates:
                # A persisted human choice can be outside this request's candidate set.
                # Do not invent a perfect spelling score for it.
                from difflib import SequenceMatcher
                scores[selected.id] = round(100 * max(SequenceMatcher(None, normalize(mention.text), normalize(alias)).ratio()
                    for alias in (*selected.aliases, selected.name)), 1)
            score = scores.get(selected.id, 100.0) if selected else (round(fuzzy_hits[0].score * 100, 1) if fuzzy_hits else (100.0 if candidates else 0.0))
            if score < 80 and method != "human review":
                selected, method = None, "below 80% — review suggestions"
            output.append({
                "mention": mention.text, "start": mention.start, "end": mention.end,
                "source": mention.source, "input_mode": mode, "status": ("suggested" if (score < 100 or method in {"LLM suggestion", "city prominence suggestion"}) and method != "human review" else "resolved") if selected else "unresolved",
                "selected": selected.public() if selected else None,
                "candidates": [{**p.public(), "score": scores.get(p.id, 100.0)} for p in candidates], "method": method,
                "score": score, "score_label": "spelling similarity", "threshold": 80,
                "suggestions_required": score < 80,
                "evidence": evidence,
                "needs_review": not selected or ((score < 100 or method in {"LLM suggestion", "city prominence suggestion"}) and method != "human review"),
            })
        return output

    def _llm_choose(self, text: str, mention: Mention, candidates: list[Place]) -> tuple[Place, str] | None:
        # Only structured candidate IDs are allowed. The model may abstain.
        ids = [p.id for p in candidates]
        schema = {"type": "object", "additionalProperties": False,
                  "properties": {"chosen_id": {"type": "string", "enum": ids + ["ABSTAIN"]},
                                 "evidence_quote": {"type": "string"}},
                  "required": ["chosen_id", "evidence_quote"]}
        payload = {
            "model": os.getenv("PLACELENS_MODEL", "gpt-4o-mini"),
            "instructions": "Resolve only from the supplied candidates. Choose ABSTAIN if the text does not distinguish them. Return a short exact quote from the document that supports the choice. Never invent evidence.",
            "input": json.dumps({"text": text[max(0, mention.start - 500):min(len(text), mention.end + 500)],
                                 "mention": mention.text, "candidates": [p.public() for p in candidates]}, ensure_ascii=False),
            "text": {"format": {"type": "json_schema", "name": "place_choice",
                                 "strict": True, "schema": schema}},
        }
        request = urllib.request.Request(
            "https://api.openai.com/v1/responses", json.dumps(payload).encode(),
            {"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"], "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = json.load(response)
            blocks = [item for message in body.get("output", [])
                      for item in message.get("content", []) if item.get("type") == "output_text"]
            if not blocks:
                return None
            result = json.loads(blocks[0]["text"])
            chosen_id, quote = result.get("chosen_id"), result.get("evidence_quote", "").strip()
            if chosen_id not in ids or len(quote) < 3 or quote.casefold() not in text.casefold():
                return None
            if normalize(quote) == normalize(mention.text):
                return None
            chosen = next(p for p in candidates if p.id == chosen_id)
            quote_states, quote_countries = context_clues(quote)
            state_supported = normalize(chosen.state) in quote_states and sum(
                normalize(p.state) in quote_states for p in candidates) == 1
            country_supported = normalize(chosen.country) in quote_countries and sum(
                normalize(p.country) in quote_countries for p in candidates) == 1
            if not (state_supported or country_supported):
                return None
            return chosen, quote
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError):
            return None
