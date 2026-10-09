import React from 'react';
import { Sparkles, FileText, Search } from 'lucide-react';

export default function Header({ activeTab, onTryDemo, onAnalyzeDocument, onOpenSearchModal }) {
  const titles = {
    dashboard: {
      title: 'Location Intelligence',
      subtitle: 'Extract, resolve and standardize geographic entities from unstructured text.'
    },
    analysis: {
      title: 'Document Analysis Studio',
      subtitle: 'Detect place mentions and normalize to canonical geographic identities in real time.'
    },
    explorer: {
      title: 'Canonical Location Explorer',
      subtitle: 'Browse normalized places, coordinates, external identifiers, and known aliases.'
    },
    analytics: {
      title: 'Resolution Analytics',
      subtitle: 'Actual local analyses, review counts, and name similarity scores.'
    },
    review: {
      title: 'Human-in-the-Loop Review Queue',
      subtitle: 'Review uncertain matches and save corrections for matching context.'
    },
  };

  const current = titles[activeTab] || titles.dashboard;

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-5 flex flex-wrap gap-3 items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{current.title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{current.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSearchModal}
          aria-label="Search locations and actions"
          className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search locations or actions</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">Ctrl K</kbd>
        </button>
        <button
          onClick={onTryDemo}
          className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200/60"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Try Demo</span>
        </button>

        {activeTab !== 'analysis' && (
          <button
            onClick={onAnalyzeDocument}
            className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Analyze Document</span>
          </button>
        )}
      </div>
    </header>
  );
}
