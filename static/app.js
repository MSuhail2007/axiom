const source = document.querySelector('#source');
const results = document.querySelector('#results');
const button = document.querySelector('#resolve');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
const useLlm = document.querySelector('#use-llm');
const mode = document.querySelector('#mode');
const useOsm = document.querySelector('#use-osm');
const country = document.querySelector('#country');
let submitted = null;
const samples = {
  bihar: 'Heavy rain closed roads in Aurangabad. बिहार disaster officials in Patna sent rescue teams.',
  unclear: 'Heavy rain closed roads in Aurangabad. Officials sent rescue teams.',
  typos: 'Floods hit Bangalroe and Kolkta. Officials met in New Deli.',
  alias: 'Reports from Bombay, Bluru and Madras described the same storm.',
  telangana: 'Flights from Hyd were delayed. తెలంగాణ officials said airports near Hyderabad were affected.'
};
document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => { mode.value = 'document'; source.value = samples[b.dataset.sample]; run(); }));
button.addEventListener('click', run);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function placeLabel(place) {
  return place.kind === 'state' ? `${place.name}, ${place.country}` : `${place.name}, ${place.state}, ${place.country}`;
}

async function run() {
  button.disabled = true;
  count.textContent = 'Analyzing…';
  try {
    const request = {text:source.value, mode:mode.value, use_llm:useLlm.checked, use_osm:useOsm.checked, country:country.value};
    const response = await fetch('/api/resolve', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(request)});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Could not resolve text');
    submitted = request;
    render(data.results);
  } catch (error) {
    results.className = 'results'; results.replaceChildren(el('p', 'message', error.message));
    count.textContent = 'Error';
  } finally { button.disabled = false; }
}

function render(items) {
  count.textContent = `${items.length} mentions · ${items[0]?.input_mode === 'document' ? 'Document' : 'Place names'}`;
  results.className = 'results'; results.replaceChildren();
  if (!items.length) {
    results.className = 'results empty';
    results.append(el('div','empty-icon','◎'),el('h3','', 'No place mentions detected'),el('p','', 'Use Place names mode to search a spelling directly. Document extraction can miss names.'));
    return;
  }
  items.forEach((item, index) => {
    const card = el('article', 'card ' + item.status);
    const top = el('div','card-top'); top.append(el('div','mention',item.mention), el('span','pill ' + (item.needs_review ? 'warn' : ''), item.status === 'out_of_scope' ? 'Outside India' : item.needs_review ? 'Review' : 'Resolved'));
    card.append(top);
    card.append(el('div','evidence-title', item.score === null ? 'Not scored — outside coverage' : `${item.score}% name / alias similarity${item.suggestions_required ? ' · Below 80%: review suggestions' : ''}`));
    const place = item.selected ? `${placeLabel(item.selected)} · ${item.selected.kind}` : item.status === 'out_of_scope' ? 'Outside India coverage' : 'Unresolved — more context needed';
    card.append(el('div','chosen',place));
    card.append(el('div','evidence-title','Evidence · ' + item.method));
    item.evidence.forEach(e => {
      const line = el('div','evidence');
      if (e.quote) line.append(el('b','',`“${e.quote}” `));
      line.append(document.createTextNode(e.basis)); card.append(line);
    });
    if (item.candidates.length) {
      const panel = el('div','candidate-list'); panel.append(el('label','', 'Candidate places · human correction'));
      const suggestions = el('ul', 'suggestions');
      item.candidates.forEach(p => suggestions.append(el('li', '', `${placeLabel(p)} — ${p.score}% · ${p.source}`)));
      panel.append(suggestions);
      const row = el('div','review-row');
      const select = el('select'); select.setAttribute('aria-label','Place for ' + item.mention);
      select.append(el('option','', 'Choose a place…')); select.firstChild.value = '';
      item.candidates.forEach(p => { const option = el('option','',`${placeLabel(p)} — ${p.score}%`); option.value = p.id; select.append(option); });
      const save = el('button','', 'Save choice');
      save.addEventListener('click', async () => {
        if (!select.value) return;
        save.disabled = true;
        try {
          const response = await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...submitted,mention:item.mention,place_id:select.value})});
          const data = await response.json();
          if (!response.ok) throw Error(data.error || 'Review failed');
          render(data.results);
        } catch(error) { panel.append(el('div','message',error.message)); }
        finally { save.disabled = false; }
      });
      row.append(select,save); panel.append(row); card.append(panel);
    }
    results.append(card);
  });
}

fetch('/api/status').then(r=>r.json()).then(s=>{
  useLlm.disabled = !s.llm;
  document.querySelector('#llm-note').textContent = s.llm ? 'Sends document context to OpenAI when selected' : 'Add OPENAI_API_KEY to enable';
  status.textContent = `Gazetteer: ${s.geonames?'GeoNames India':'demo set'} · NER: ${s.spacy?'spaCy':'alias scan'} · LLM: ${s.llm?'enabled':'off'}`;
}).catch(()=>status.textContent='Integration status unavailable');
