# STHALAM + PlaceLens

The STHALAM React frontend is merged into this workspace, backed by PlaceLens's local India resolver. It includes document analysis, highlighted mentions, an inspector with candidate scores and sources, a location explorer, a persistent review queue, real analytics, and JSON export. TXT, DOCX and text-based PDF uploads are parsed locally (10 MB, 100 PDF pages, 20,000 extracted characters). Scanned PDFs require OCR beforehand.

The original STHALAM source in Downloads remains unchanged. Its demo backend, synthetic statistics and external fonts are not used. The app uses the existing local GeoNames database and India Photon service. Transport codes BLR, MAA, BOM and CCU are curated city aliases; coordinates describe the city, not airport terminals. Short codes can require review.

Start the existing India Photon service as before, then run `.venv\Scripts\python.exe app.py` from `D:\Axiom` and open http://127.0.0.1:8765. The production frontend is already built. After frontend edits, run `npm run build` from `D:\Axiom\frontend`; the development server uses port 5173 and proxies to the Python server. The older interface remains at `/legacy`.

Analyses and pending reviews are stored in `data/workspace.sqlite`; approved corrections use `data/reviews.sqlite`. Repeating the same text, mode and source setting replaces its analytics snapshot. Review confirmation applies to the existing resolver's context key; reanalyze to update a document snapshot. REST endpoints under `/api/v1` are documented in the app. All HTTP resolution routes enforce India-only, local processing with LLM calls disabled.

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

The resolver library retains an optional LLM implementation for earlier experiments, but the local application disables it for every HTTP request, regardless of API-key environment variables.

## Review and evaluation

The default input mode is Automatic. Paragraphs are extracted as documents; long prose pasted into Place names mode is also treated as a document, rather than searched as comma-separated sentence fragments. Historical aliases are matched against the downloaded GeoNames aliases. Exact matches remain exact when Photon adds candidates. Dominant-city choices with namesakes remain reviewable suggestions, even at 100% alias similarity.

The catalog now also imports rivers, coasts, regions, plateaus, and districts from the existing India dump. `add_geography` in `import_geonames.py` can extend an existing database without replacing its city records or reviews. Region coordinates are representative points, not boundaries. Document clues are scoped to their paragraph. Known out-of-India references are annotated instead of being corrected to Indian places; the scope annotation vocabulary is limited, not a worldwide gazetteer.

Local Photon queries are deduplicated per document and are no longer subject to the old public-service ten-query cutoff or one-second delay. The cache includes the endpoint in its key, so older public-service responses are not reused as local results. The complete historical report supplied by the user is a regression fixture in `tests/historical_report.txt`.

Review decisions are stored in `data/reviews.sqlite`. A correction applies to the same normalized mention and document context key (state or country), rather than globally overwriting an alias. Spelling matches are shown as suggestions requiring review. The app also exposes `POST /api/resolve` and `POST /api/review` for integration.

Run the included checks with `python -m unittest discover -s tests -v`. `python evaluate.py` compares the resolver with and without context on a small illustrative set. Replace that set with independently labeled examples before making accuracy claims.

## Scope

### Spelling searches and the 80% rule

Use **Place names** mode for arbitrary misspellings: enter one name per line, comma, or semicolon. Every nonempty entry returns a result, even when there is no match. **Document** mode extracts likely mentions and can still miss names. Full spelling search examines every local alias, without prefix/suffix restrictions or a minimum similarity cutoff. The UI lists candidate names, sources, and scores. Scores are normalized character similarity (best stored alias for GeoNames, returned name for Photon), not calibrated probabilities. Below 80%, automatic selection is blocked and suggestions require review. Higher scores can also require review when names are ambiguous. Human-confirmed choices retain their original spelling score.

The authorized second source is **OpenStreetMap via a local Photon server**, enabled in the UI and optional per API request (`use_osm: true`). Searched names are sent only to `http://127.0.0.1:2322`; the client rejects non-local Photon URLs. Results are cached for seven days in `data/photon.sqlite`; saved OSM place records support human corrections. The UI is intentionally India-only and uses the India Photon extract plus the imported India GeoNames dataset.

OpenStreetMap data is attributed to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL. Neither source guarantees all places, and severe typos may have several plausible corrections.

The bundled data covers selected Indian cities and one Pakistan example. The imported GeoNames India catalog covers cities, villages, states, and union territories. The spelling scan can recover likely Latin-script typos missed by NER; these are shown as suggestions for review. The English spaCy model will still miss some regional-script and OCR variants. The curated aliases supplement that gap. An LLM explanation is a proposed reason, not a calibrated confidence score. The UI shows observable evidence and uses `unresolved` when it cannot justify a choice.
