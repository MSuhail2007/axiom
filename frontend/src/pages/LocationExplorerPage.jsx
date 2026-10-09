import React, {useEffect, useState} from 'react';
import {Search, ArrowRight, MapPin} from 'lucide-react';
import {fetchLocationPage} from '../services/api';

export default function LocationExplorerPage({onSelectLocation}) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({items: [], total: 0, suggested: false});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 40;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      fetchLocationPage(query.trim(), offset, limit)
        .then(result => {if (active) setPage(result);})
        .catch(e => {if (active) setError(e.message);})
        .finally(() => {if (active) setLoading(false);});
    }, 250);
    return () => {active = false; clearTimeout(timer);};
  }, [query, offset]);
  const navigation = <div className="flex flex-wrap items-center justify-between gap-3">
    <span className="text-sm text-slate-600" aria-live="polite">
      {loading ? 'Searching the local catalog…' : error ? 'Catalog unavailable' : page.total ?
        `Showing ${(offset + 1).toLocaleString()}–${(offset + page.items.length).toLocaleString()} of ${page.total.toLocaleString()} ${page.suggested ? 'spelling suggestions' : 'place records'}` : 'No matching places'}
    </span>
    <div className="flex gap-2">
      <button className="btn-secondary disabled:opacity-40" disabled={loading || offset === 0} onClick={() => setOffset(0)}>First</button>
      <button className="btn-secondary disabled:opacity-40" disabled={loading || offset === 0} onClick={() => setOffset(n => Math.max(0, n - limit))}>Previous</button>
      <button className="btn-secondary disabled:opacity-40" disabled={loading || !!error || offset + limit >= page.total} onClick={() => setOffset(n => n + limit)}>Next</button>
    </div>
  </div>;
  return <div className="p-8 max-w-7xl mx-auto space-y-6">
    <section className="panel space-y-4">
      <div className="flex items-center gap-3"><Search size={18}/>
        <input aria-label="Search locations" className="w-full p-3 border rounded-xl" placeholder="Search India: Bengaluru, Madras, BLR…" value={query}
          onChange={e => {setQuery(e.target.value); setOffset(0);}}/>
        <span className="text-xs whitespace-nowrap bg-indigo-50 text-indigo-700 rounded-lg p-2">India only</span>
      </div>
      <p className="text-xs text-slate-500">Browse the full installed GeoNames India catalog: settlements, states, districts, rivers and regions. Names and aliases are searched across the catalog, not just this page. Document analysis also searches local India Photon when enabled. Dataset coverage is not a guarantee of every locality.</p>
      {navigation}
    </section>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {!loading && !error && <>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{page.items.map(loc =>
        <button key={loc.location_id} onClick={() => onSelectLocation({...loc, mention:loc.canonical_name, status:'CATALOG', confidence:null, resolution_method:'catalog entry'})} className="panel text-left hover:border-indigo-300">
          <h3 className="font-bold text-lg">{loc.canonical_name}</h3>
          <p className="text-xs text-slate-500 flex gap-1 mt-2"><MapPin size={13}/>{loc.state} · {loc.country} · {loc.kind}</p>
          <div className="flex gap-1 flex-wrap mt-4">{loc.aliases_preview.map(a => <span key={a} className="text-xs border rounded bg-slate-50 px-2 py-1">{a}</span>)}</div>
          <div className="text-indigo-600 text-xs font-semibold flex justify-between mt-5">View {loc.aliases_count} aliases &amp; coordinates <ArrowRight size={14}/></div>
        </button>)}</div>
      {page.items.length > 0 && navigation}
    </>}
  </div>;
}
