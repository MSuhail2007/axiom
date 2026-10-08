# PlaceLens

PlaceLens resolves place names in Indian news and records while showing the evidence behind each choice. It keeps ambiguous mentions unresolved when the document does not support a decision. A review action can save a context-scoped correction for future runs.

## Run the demo

Python 3.10+ is sufficient for the bundled demo; no package installation is required. This workspace also has a local GeoNames India catalog and a `.venv` with spaCy installed.

```powershell
.venv\Scripts\python.exe app.py
```

Open <http://127.0.0.1:8765>. Try the two Aurangabad examples in the UI. If the virtual environment is unavailable, `python app.py` runs the bundled alias demo without spaCy. The bundled gazetteer is deliberately small and is for demonstrating behavior, not measuring geographic coverage.

## Add full India place data

This workspace already has `data/geonames.sqlite`. To rebuild it, download `IN.zip` from [GeoNames](https://download.geonames.org/export/dump/) and import it:

```powershell
python import_geonames.py C:\path\to\IN.zip
```

This creates `data/geonames.sqlite`. The app uses it automatically on the next start. The importer reads all populated places, Indian states and union territories, and their alternate names from the country dump. The bundled aliases remain available for informal names and mixed-script examples. GeoNames data is [CC BY](https://www.geonames.org/export/); retain attribution when sharing results.

## Optional recognition and LLM selection

The demo recognizes exact aliases and scans likely place phrases for spelling errors without dependencies. RapidFuzz makes typo matching faster, and spaCy adds English NER for names outside the bundled list:

```powershell
python -m pip install -r requirements-optional.txt
python -m spacy download en_core_web_sm
```

Set `OPENAI_API_KEY` to enable the optional LLM checkbox for unresolved candidate sets. Set `PLACELENS_MODEL` to choose a supported model; the default is `gpt-4o-mini`. When the checkbox is selected, the app sends nearby document text, the mention, and candidate list to the API only when local evidence cannot resolve it. It accepts only a candidate ID or an abstention, and checks that quoted evidence appears in the document and distinguishes candidates. API calls have cost and require network access. Without a key, review remains fully usable.

## Review and evaluation

Review decisions are stored in `data/reviews.sqlite`. A correction applies to the same normalized mention and document context key (state or country), rather than globally overwriting an alias. Spelling matches are shown as suggestions requiring review. The app also exposes `POST /api/resolve` and `POST /api/review` for integration.

Run the included checks with `python -m unittest discover -s tests -v`. `python evaluate.py` compares the resolver with and without context on a small illustrative set. Replace that set with independently labeled examples before making accuracy claims.

## Scope

### Spelling searches and the 80% rule

Use **Place names** mode for arbitrary misspellings: enter one name per line, comma, or semicolon. Every nonempty entry returns a result, even when there is no match. **Document** mode extracts likely mentions and can still miss names. Full spelling search examines every local alias, without prefix/suffix restrictions or a minimum similarity cutoff. The UI lists candidate names, sources, and scores. Scores are normalized character similarity (best stored alias for GeoNames, returned name for Photon), not calibrated probabilities. Below 80%, automatic selection is blocked and suggestions require review. Higher scores can also require review when names are ambiguous. Human-confirmed choices retain their original spelling score.

The authorized second source is **OpenStreetMap via Photon**, enabled in the UI and optional per API request (`use_osm: true`). It sends searched place names, not document bodies. The public demo requires no key or paid account, but has no availability guarantee and can throttle heavy use: see [Photon terms and documentation](https://github.com/komoot/photon#demo-server). No paid service has been configured. Results are cached for seven days in `data/photon.sqlite`; saved OSM place records support human corrections. Requests are serialized to at most one per second, with a six-second network timeout and a per-resolution budget of ten names and about fifteen seconds (an in-flight request may finish later). Skipped or failed external searches are visible in each result. Select India or worldwide coverage; the local imported dataset remains India-focused. Production volume would require a separately approved hosted service or self-hosting.

OpenStreetMap data is attributed to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL. Neither source guarantees all places, and severe typos may have several plausible corrections.

The bundled data covers selected Indian cities and one Pakistan example. The imported GeoNames India catalog covers cities, villages, states, and union territories. The spelling scan can recover likely Latin-script typos missed by NER; these are shown as suggestions for review. The English spaCy model will still miss some regional-script and OCR variants. The curated aliases supplement that gap. An LLM explanation is a proposed reason, not a calibrated confidence score. The UI shows observable evidence and uses `unresolved` when it cannot justify a choice.
