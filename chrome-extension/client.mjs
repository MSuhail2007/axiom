export const ENDPOINT = 'http://127.0.0.1:8765/api/resolve';
export const UPLOAD_ENDPOINT = 'http://127.0.0.1:8765/api/v1/standardize/upload';
export function validate(text) {
  if (!text.trim()) throw new Error('Select or paste some text first.');
  if (Array.from(text).length > 20000) throw new Error('Use at most 20,000 characters. Shorten the selection and try again.');
}
export async function resolvePlaces(text, mode, useOsm, signal, request = fetch) {
  validate(text);
  if (!['auto','names','document'].includes(mode)) throw new Error('Invalid input mode.');
  const response = await request(ENDPOINT, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    credentials: 'omit', redirect: 'error', signal,
    body: JSON.stringify({text, mode, use_osm: useOsm === true, use_llm: false, country: 'IN'})
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.detail || 'The local resolver could not process this text.');
  if (!Array.isArray(body.results)) throw new Error('Unexpected response. Check that PlaceLens is running on port 8765.');
  return body.results;
}
export async function resolveUpload(file, signal, request = fetch) {
  if (!file || !/\.(txt|docx|pdf)$/i.test(file.name)) throw new Error('Choose a TXT, DOCX or PDF file.');
  if (file.size > 10_000_000) throw new Error('Uploads are limited to 10 MB.');
  const form = new FormData(); form.append('file', file);
  const response = await request(UPLOAD_ENDPOINT, {method:'POST', body:form, credentials:'omit', redirect:'error', signal});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || body.detail || 'The local app could not read this document.');
  if (!Array.isArray(body.locations)) throw new Error('Unexpected document response.');
  return body.locations.map(item => ({
    ...item,
    selected: item.location_id ? {id:item.location_id,name:item.canonical_name,state:item.state,country:item.country,kind:item.kind,source:item.source,lat:item.latitude,lon:item.longitude} : null,
    score: item.confidence == null ? null : item.confidence * 100,
    candidates: (item.candidates || []).map(candidate => ({id:candidate.location_id,name:candidate.canonical_name,state:candidate.state,country:candidate.country,kind:candidate.kind,source:candidate.source,score:candidate.confidence * 100})),
    needs_review: item.status === 'AMBIGUOUS',
    status: item.status === 'OUT_OF_SCOPE' ? 'out_of_scope' : item.status === 'AMBIGUOUS' ? 'unresolved' : 'resolved'
  }));
}
export function label(item) {
  if (item.status === 'out_of_scope') return 'Outside India';
  return item.needs_review || item.score < 80 || !item.selected ? 'Needs review' : 'Resolved';
}
