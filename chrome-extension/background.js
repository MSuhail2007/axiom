import {resolvePlaces} from './client.mjs';

// The content script never chooses a URL or calls the server directly.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'STHALAM_SCAN') return;
  if (sender.id !== chrome.runtime.id || !sender.tab ||
      typeof message.text !== 'string' || !/^(?:https?|file):/.test(sender.url || '')) {
    reply({error:'Invalid scan request.'});
    return;
  }
  resolvePlaces(message.text, 'document', true, AbortSignal.timeout(25000))
    .then(results => reply({results}))
    .catch(error => reply({error: error.name === 'TimeoutError' ?
      'Local analysis timed out. Use Retry or a shorter page.' :
      error instanceof TypeError ? 'Local app unavailable. Start PlaceLens on port 8765, then Retry.' : error.message}));
  return true;
});

const key = windowId => `selection:${windowId}`;
const sequences = new Map();
function next(windowId) {
  const token = (sequences.get(windowId) || 0) + 1;
  sequences.set(windowId, token);
  return token;
}
async function deliver(windowId, text, note = '', token) {
  if (token !== sequences.get(windowId)) return;
  await chrome.storage.session.set({[key(windowId)]: {text, note, stamp: Date.now()}});
}
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.storage.local.set({autoScan: true});
  }
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: 'sthalam-selection', title: 'Find places with STHALAM', contexts: ['selection']
  }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'sthalam-selection' || !tab) return;
  const token = next(tab.windowId);
  deliver(tab.windowId, info.selectionText || '', '', token).catch(console.error);
});
chrome.windows.onRemoved.addListener(id => {
  sequences.delete(id);
  chrome.storage.session.remove(key(id));
});
