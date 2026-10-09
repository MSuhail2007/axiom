# STHALAM webpage annotator — v1.3

This standalone Chrome extension automatically scans readable webpage text and displays canonical place names **above the original words**. Its toolbar button opens a floating glass-style popup for controls. It uses the existing local resolver unchanged. Original text, links and HTML structure are not replaced: a separate overlay tracks text ranges during scrolling and resizing.

## Update or install
1. Keep your existing PlaceLens app running on `http://127.0.0.1:8765` and India Photon on port 2322.
2. Open `chrome://extensions`. If already installed, click **Reload** for STHALAM. Otherwise enable Developer mode, choose **Load unpacked**, and select `D:\Axiom\chrome-extension`.
3. Chrome may ask for the updated permission to read and change webpages. Automatic annotations require site access. Choose access for the sites where you want it to run.
4. For local `file:///` pages or PDFs, open the extension details and enable **Allow access to file URLs**.
5. **Refresh your webpage** after updating the extension. The toolbar button opens the floating popup. No copying, pasting or click on Find places is required for webpage scanning.

If a page reports “Extension context invalidated”, Chrome is holding an older content script after an extension reload. Click **Reload** in `chrome://extensions`, then refresh that webpage once. The page badge will explain this same recovery action if the local request is interrupted.

Document upload remains in the main STHALAM workspace. Choose **Document upload** in the popup to open that workspace; the popup intentionally does not duplicate the upload control.

The popup has a **Stop scanning this page** button and a separate **Scan PDF text layers too** setting. Ordinary web PDF viewers and Acrobat-style HTML text layers can be scanned when their text is present in the page DOM. Chrome's built-in PDF viewer is a restricted browser page and cannot be injected into; use the main workspace upload for those PDFs.

Purple labels show resolved canonical names. Amber labels prefixed with `?` are suggestions that need review, including scores below 80%. Click a label to see the original name, score, place type, source and alternatives. Names already canonical are not labelled unless uncertain. Known outside-India references are left unannotated.

**Pause / Resume** controls the current page. **Rescan** clears that page's in-memory cache and runs again. The popup has a global automatic-scanning toggle plus optional manual lookup. Automatic scanning defaults to on. Hidden tabs wait until visible. Dynamic page text is rescanned after it settles; long pages are processed in chunks without a fixed total page-length cutoff.

## Scope and privacy
- Readable main-frame page text is sent automatically **only** to `http://127.0.0.1:8765/api/resolve` through the extension service worker. Requests force Document mode, India, local Photon on, and LLM off. There is no external AI API.
- Forms, input fields, editable regions, hidden text, scripts, code blocks and canvas are skipped. Automatic scanning can include other readable text on signed-in pages; use the toggle or Chrome site access settings to control it.
- Chrome internal pages, Web Store pages, PDFs without ordinary HTML text, embedded frames, closed shadow roots, and canvas-rendered text are not supported. Loopback sites are excluded so the existing STHALAM app is not annotated.
- The existing model's language coverage and confidence rules are unchanged. Splitting extremely long paragraphs can reduce available context near a chunk boundary.
- Automatic page annotations do not submit reviews or create analytics documents. The existing resolver can update its normal local Photon cache. Page text and response cache live only in the content script's memory; no page archive is created by this extension.
- The manual selection handoff uses session memory, and only the automatic-scanning preference uses local extension storage. No synced storage.
- Overlays can overlap tightly packed text on some layouts. Pausing hides all overlays immediately. The original DOM text remains intact.

## Validation
`node --test tests/*.test.mjs` tests request constraints, thresholds, Unicode offsets, inline-node mapping, repeated mentions, chunking, stale spans and selection handoff. `node tests/live.mjs` tests the existing local API with Photon disabled to avoid cache writes.

Manual Chrome checks: refresh a news article; watch labels appear automatically; scroll and resize; change dynamic text; click an amber label; pause/resume; disable scanning globally; stop the local app and use Rescan to check the error.

Chrome implementation references: [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [Action popups](https://developer.chrome.com/docs/extensions/develop/ui/add-popup).
