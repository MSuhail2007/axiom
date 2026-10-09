import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  FileText,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { searchLocations } from '../services/api';

function normalizeLocation(location) {
  return {
    ...location,
    location_id: location.location_id || location.id,
    canonical_name: location.canonical_name || location.name,
    kind: location.kind || location.place_type || 'place',
    status: location.status || 'CATALOG',
    explanation: location.explanation || 'Selected from the local canonical location catalog.',
    confidence: null,
  };
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  onNavigate,
  onSelectLocation,
  onRunDemo,
}) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const locations = await searchLocations(query.trim(), 6);
        if (!cancelled) {
          setResults((Array.isArray(locations) ? locations : []).map(normalizeLocation));
          setSelectedIndex(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query]);

  if (!isOpen) return null;

  const actions = [
    { label: 'Analyze a document', hint: 'Open the document analysis studio', icon: FileText, tab: 'analysis' },
    { label: 'Explore the location catalog', hint: 'Browse canonical places and aliases', icon: Navigation, tab: 'explorer' },
    { label: 'View resolution analytics', hint: 'See local match quality and activity', icon: BarChart3, tab: 'analytics' },
  ];

  const choose = (callback) => {
    callback();
    onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') return onClose();
    const itemCount = query.trim() ? results.length : actions.length;
    if (!itemCount) return undefined;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % itemCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + itemCount) % itemCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (query.trim()) {
        const location = results[selectedIndex];
        if (location) choose(() => onSelectLocation(location));
      } else {
        const action = actions[selectedIndex];
        if (action) choose(() => onNavigate(action.tab));
      }
    }
    return undefined;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search locations and actions"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <Search className="h-5 w-5 text-indigo-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search locations or actions..."
            className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400 sm:inline">ESC</kbd>
          <button onClick={onClose} aria-label="Close search" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-3">
          {query.trim() ? (
            <>
              <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Locations</div>
              {loading && <div className="px-3 py-8 text-center text-sm text-slate-400">Searching the local catalog...</div>}
              {!loading && !results.length && <div className="px-3 py-8 text-center text-sm text-slate-400">No matching local places found.</div>}
              {!loading && results.map((location, index) => (
                <button
                  key={location.location_id || `${location.canonical_name}-${index}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => choose(() => onSelectLocation(location))}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selectedIndex === index ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><MapPin className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{location.canonical_name}</span>
                    <span className="block truncate text-xs text-slate-400">{location.state || location.country || location.kind}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Quick actions</div>
              {actions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.tab}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => choose(() => onNavigate(action.tab))}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selectedIndex === index ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{action.label}</span><span className="block text-xs text-slate-400">{action.hint}</span></span>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
              <button onClick={() => choose(onRunDemo)} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-3 py-3 text-left hover:bg-indigo-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-indigo-600"><Sparkles className="h-4 w-4" /></span>
                <span className="flex-1"><span className="block text-sm font-semibold text-indigo-800">Run the sample analysis</span><span className="block text-xs text-indigo-500">Try the local resolver with a known example</span></span>
                <ArrowRight className="h-4 w-4 text-indigo-300" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[10px] text-slate-400">
          <span>Searches the local STHALAM catalog</span><span>↑ ↓ navigate · Enter select</span>
        </div>
      </div>
    </div>
  );
}
