import {resolvePlaces, label} from './client.mjs';
const $ = id => document.getElementById(id);
chrome.storage.local.get({autoScan:true}, options => { $('auto-scan').checked = options.autoScan !== false; });
$('auto-scan').addEventListener('change', () => chrome.storage.local.set({autoScan:$('auto-scan').checked}));
chrome.storage.local.get({pdfScan:true}, options => { $('pdf-scan').checked = options.pdfScan !== false; });
function setPdfScanning(enabled) {
  chrome.storage.local.set({pdfScan:enabled});
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, {type:'STHALAM_PDF_TOGGLE', enabled}, () => void chrome.runtime.lastError);
}
$('pdf-scan').addEventListener('change', () => setPdfScanning($('pdf-scan').checked));
let activeTabId;
function setPageButton(paused) {
  $('page-toggle').textContent = paused ? 'Resume scanning this page' : 'Stop scanning this page';
  $('page-toggle').classList.toggle('stopped', paused);
}
async function loadPageState() {
  try {
    const tabs = await chrome.tabs.query({active:true, currentWindow:true});
    activeTabId = tabs[0]?.id;
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, {type:'STHALAM_GET_STATE'}, response => {
      if (chrome.runtime.lastError) return;
      setPageButton(response?.paused === true);
    });
  } catch {}
}
$('page-toggle').addEventListener('click', () => {
  if (!activeTabId) return status('Open an ordinary webpage first.', true);
  const stopped = $('page-toggle').classList.contains('stopped');
  chrome.tabs.sendMessage(activeTabId, {type:'STHALAM_TOGGLE_PAGE', paused:!stopped}, response => {
    if (chrome.runtime.lastError) {status('Refresh this webpage to reconnect STHALAM.', true); return;}
    setPageButton(response?.paused === true);
    status(response?.paused ? 'Scanning stopped on this page.' : 'Scanning resumed on this page.');
  });
});
let controller;
let revision = 0;
function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function syncMode() {
  const mode = $('mode').value;
  const documentMode = mode === 'document';
  const textMode = mode === 'names';
  $('text-wrap').style.display = textMode ? 'block' : 'none';
  $('document-wrap').style.display = documentMode ? 'block' : 'none';
  $('find').textContent = documentMode ? 'Analyze document →' : 'Check places →';
  $('actions').style.display = textMode ? 'flex' : 'none';
  $('clear').style.display = documentMode ? 'none' : 'inline-block';
}
function reset() {
  ++revision;
  controller?.abort();
  $('find').disabled = false;
  $('results').replaceChildren();
}
function node(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function render(items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const card = node('article', '', 'card');
    const state = label(item);
    card.append(node('div', item.mention, 'original'),
      node('h2', item.selected?.name || (state === 'Outside India' ? state : 'Choose a suggestion')),
      node('span', state, `flag ${state === 'Resolved' ? 'resolved' : ''}`),
      node('span', item.score == null ? 'Not scored' : `${item.score}% similarity`, 'score'));
    if (item.selected) card.append(node('p', [item.selected.state,item.selected.country,item.selected.kind].filter(Boolean).join(' · '), 'state'),
      node('p', `${item.selected.source} · ${item.selected.lat}, ${item.selected.lon}`, 'meta'));
    card.append(node('p', item.method, 'meta'));
    for (const evidence of item.evidence || []) card.append(node('p', [evidence.quote,evidence.basis].filter(Boolean).join(' — '), 'evidence'));
    const candidates = [...new Map((item.candidates || []).map(p => [p.id,p])).values()];
    if (candidates.length) {
      const details = node('details', '');
      details.append(node('summary', `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} and scores`));
      if (state === 'Needs review') details.open = true;
      for (const p of candidates) {
        const row = node('div', '', 'candidate');
        row.append(node('strong', `${p.name} · ${p.score}%`), node('div', [p.state,p.country,p.kind,p.source].filter(Boolean).join(' · ')));
        details.append(row);
      }
      card.append(details);
    }
    fragment.append(card);
  }
  $('results').replaceChildren(fragment);
}
$('form').addEventListener('submit', async event => {
  event.preventDefault(); reset();
  const current = revision;
  controller = new AbortController();
  const requestController = controller;
  const timer = setTimeout(() => requestController.abort(), 180000);
  $('find').disabled = true; status('Finding places on your computer…');
  try {
    const items = await resolvePlaces($('text').value, $('mode').value, $('osm').checked, controller.signal);
    if (current !== revision) return;
    render(items);
    status(items.length ? `${items.length} mention${items.length === 1 ? '' : 's'} found.` : 'No places detected. Try Place names mode for individual names. Non-English paragraph detection is limited.');
  } catch (error) {
    if (current !== revision) return;
    const invalidated = /context invalidated/i.test(error.message || '');
    status(invalidated ? 'This popup belongs to an older extension version. Reload STHALAM in chrome://extensions, then refresh the page.' : error.name === 'AbortError' ? 'The local request timed out. Try a shorter passage.' : error instanceof TypeError ? 'Cannot reach the local app. Start PlaceLens on 127.0.0.1:8765, then try again.' : error.message, true);
  } finally {
    clearTimeout(timer);
    if (current === revision) $('find').disabled = false;
  }
});
$('text').addEventListener('input', () => {reset(); status('Ready to find places.');});
for (const id of ['mode','osm']) $(id).addEventListener('change', () => {reset(); syncMode(); status('Options changed. Find places again to update results.');});
let selectionKey;
$('clear').addEventListener('click', () => {
  reset(); $('text').value = ''; status('Cleared.');
  if (selectionKey) chrome.storage.session.remove(selectionKey);
});
function accept(value) {
  if (!value) return;
  reset(); $('text').value = value.text || '';
  status(value.note || (value.text ? 'Selection ready. Click Find places.' : 'No selected text. Select a passage and click the extension again, or paste here.'));
}
async function initialize() {
  const window = await chrome.windows.getCurrent();
  selectionKey = `selection:${window.id}`;
  // Register before reading so selections handed off during panel startup aren't lost.
  let changed = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[selectionKey]) {changed = true; accept(changes[selectionKey].newValue);}
  });
  const data = await chrome.storage.session.get(selectionKey);
  if (!changed) accept(data[selectionKey]);
}
initialize().catch(() => status('Paste your text below to get started.'));
syncMode();
loadPageState();
