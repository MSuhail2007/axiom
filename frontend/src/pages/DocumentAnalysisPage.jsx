import React, { useState } from 'react';
import { 
  FileText, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Download, 
  RefreshCw, 
  HelpCircle, 
  MapPin, 
  ChevronRight, 
  Eye, 
  SlidersHorizontal 
} from 'lucide-react';
import { standardizeText, standardizeUpload } from '../services/api';

const PRESETS = [
  {
    id: 'hackathon_demo',
    title: 'Historical names & codes',
    text: 'The patient travelled from Madras to Banglore. The shipment was later sent from BLR to Bombay.'
  },
  {
    id: 'ambiguity_springfield',
    title: 'Ambiguous Indian name',
    text: 'Heavy rain closed roads in Aurangabad. Officials responded.'
  },
  {
    id: 'contextual_disambiguation',
    title: 'Contextual Disambiguation',
    text: 'Heavy rain in Aurangabad. Bihar officials sent rescue teams from Patna.'
  },
  {
    id: 'multi_hop_logistics',
    title: 'Historical & Transport Codes',
    text: 'Consignment rerouted from Poona to Calcutta via MAA and CCU air cargo facilities.'
  }
];

export default function DocumentAnalysisPage({ onSelectLocation, initialText = '', onAnalyzed }) {
  const [inputText, setInputText] = useState(initialText || PRESETS[0].text);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('text'); // 'text' | 'file'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(null);
  const [searchMode, setSearchMode] = useState('auto');
  const [useOsm, setUseOsm] = useState(true);

  const handleAnalyze = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'file' && !file) throw new Error('Choose a file before analyzing.');
      if (mode === 'file' && file) {
        const res = await standardizeUpload(file);
        setResult(res);
        setInputText(res.original_text);
      } else {
        if (!inputText.trim()) {
          setError('Please provide text or upload a document to analyze.');
          setLoading(false);
          return;
        }
        const res = await standardizeText(inputText, searchMode, useOsm);
        setResult(res);
      }
      setSelectedMentionIndex(null);
      onAnalyzed?.();
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (preset) => {
    setInputText(preset.text);
    setMode('text');
    setFile(null);
    setResult(null);
    setError(null);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setMode('file');
      setError(null);
    }
  };

  const handleExportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sthalam-standardized-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render Highlighted Text
  const renderHighlightedDocument = () => {
    if (!result || !result.original_text) return null;
    const text = result.original_text;
    const locations = result.locations || [];

    if (locations.length === 0) {
      return <div className="text-sm text-slate-600 leading-relaxed font-mono">{text}</div>;
    }

    // Sort locations by start_char
    const sorted = [...locations].sort((a, b) => a.start_char - b.start_char);
    const elements = [];
    let lastIndex = 0;

    sorted.forEach((loc, idx) => {
      // Plain text before this entity
      if (loc.start_char > lastIndex) {
        elements.push(
          <span key={`text-${idx}`}>{text.substring(lastIndex, loc.start_char)}</span>
        );
      }

      const isAmbiguous = loc.status === 'AMBIGUOUS';
      const isSelected = selectedMentionIndex === idx;

      elements.push(
        <button
          key={`loc-${idx}`}
          onClick={() => {
            setSelectedMentionIndex(idx);
            onSelectLocation(loc);
          }}
          className={`inline-flex items-baseline mx-0.5 px-2 py-0.5 rounded font-mono text-xs font-bold transition-all ${
            isSelected
              ? 'ring-2 ring-indigo-600 bg-indigo-600 text-white shadow-sm'
              : isAmbiguous
              ? 'bg-amber-100 text-amber-900 border-b-2 border-amber-500 hover:bg-amber-200'
              : 'bg-indigo-100 text-indigo-900 border-b-2 border-indigo-500 hover:bg-indigo-200'
          }`}
          title={`Click to inspect ${loc.mention} → ${loc.canonical_name || (loc.status === 'OUT_OF_SCOPE' ? 'Outside India' : 'Needs review')}`}
        >
          <span>{text.substring(loc.start_char, loc.end_char)}</span>
          <span className={`ml-1 text-[10px] font-sans font-semibold ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
            → {loc.canonical_name || (loc.status === 'OUT_OF_SCOPE' ? 'Outside India' : 'Needs review')}
          </span>
        </button>
      );

      lastIndex = loc.end_char;
    });

    if (lastIndex < text.length) {
      elements.push(<span key="text-end">{text.substring(lastIndex)}</span>);
    }

    return (
      <div className="text-sm text-slate-800 leading-relaxed font-sans bg-slate-50/70 p-4 rounded-xl border border-slate-200">
        {elements}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Demo Presets Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
          Quick Presets:
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePresetSelect(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              inputText === p.text
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Input Panel (5 columns) */}
        <div className="analysis-input-panel lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Input Source</span>
            </h3>

            {/* Mode Toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">
              <button
                onClick={() => setMode('text')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  mode === 'text' ? 'bg-white text-slate-900 shadow-xs font-semibold' : ''
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setMode('file')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  mode === 'file' ? 'bg-white text-slate-900 shadow-xs font-semibold' : ''
                }`}
              >
                Upload File
              </button>
            </div>
          </div>

          {/* Textarea or File Dropzone */}
          {mode === 'text' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Unstructured Document Text
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={9}
                placeholder="Paste shipment manifests, customer records, clinical notes, or historical logs..."
                className="w-full text-sm font-sans rounded-xl border border-slate-200 p-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/40 text-slate-800 placeholder-slate-400"
              />
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <input
                type="file"
                id="file-upload"
                onChange={handleFileChange}
                accept=".txt,.docx,.pdf"
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-slate-800">
                  {file ? file.name : 'Upload Document'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Supports .TXT, .DOCX, and .PDF formats
                </span>
                {file && (
                  <span className="mt-2 text-xs font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {(file.size / 1024).toFixed(1)} KB ready
                  </span>
                )}
              </label>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-600">Interpret input
            <select aria-label="Interpret input" className="block w-full mt-2 border rounded-lg p-2" value={searchMode} onChange={e => setSearchMode(e.target.value)}>
              <option value="auto">Automatic</option><option value="document">Document</option><option value="names">Place names</option>
            </select>
          </label>
          <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={mode === 'file' || useOsm} disabled={mode === 'file'} onChange={e => setUseOsm(e.target.checked)} />Include local India Photon</label>
          <p className="text-xs text-slate-500">Processed on this computer. Scores measure name similarity, not certainty. Matches below 80% and ambiguous names require review. Uploads: up to 10 MB and 20,000 extracted characters; scanned PDFs need OCR.</p>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-70 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Resolution Pipeline...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analyze Locations</span>
              </>
            )}
          </button>
        </div>

        {/* Right Side: Results & Highlighting (7 columns) */}
        <div className="lg:col-span-7 space-y-6">
          {result ? (
            <>
              {/* Summary Metrics Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Standardized Output</h3>
                    <p className="text-xs text-slate-500">
                      Processed locally in <span className="font-mono font-medium">{result.processing_time_ms} ms</span>
                    </p>
                  </div>
                  <button
                    onClick={handleExportJSON}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block text-[11px]">Detected</span>
                    <span className="text-lg font-bold text-slate-800">{result.total_detected}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                    <span className="text-emerald-700 block text-[11px]">Standardized</span>
                    <span className="text-lg font-bold text-emerald-800">{result.total_standardized}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                    <span className="text-amber-700 block text-[11px]">Needs review</span>
                    <span className="text-lg font-bold text-amber-800">{result.ambiguous_count}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                    <span className="text-indigo-700 block text-[11px]">Avg similarity</span>
                    <span className="text-lg font-bold text-indigo-800">{Math.round(result.avg_confidence * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Interactive Highlighted Text Panel */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Document View (Click mention to inspect)</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">Interactive Span Mapping</span>
                </div>

                {renderHighlightedDocument()}
              </div>

              {/* Detected Locations Cards & Table */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Resolved Geographic Identities</h4>

                {result.locations.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No location entities were detected in this document.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.locations.map((loc, idx) => {
                      const isAmbiguous = loc.status === 'AMBIGUOUS';
                      const isSelected = selectedMentionIndex === idx;
                      const confPct = loc.confidence === null ? null : Math.round(loc.confidence * 100);

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedMentionIndex(idx);
                            onSelectLocation(loc);
                          }}
                          className={`p-4 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-500/30'
                              : isAmbiguous
                              ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                  {loc.mention}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-semibold text-sm text-indigo-700">
                                  {loc.canonical_name || (loc.status === 'OUT_OF_SCOPE' ? 'Outside India' : 'Needs review')}
                                </span>
                                {isAmbiguous && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    MANUAL VERIFICATION
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-slate-500 flex items-center space-x-2">
                                <span>{loc.state ? `${loc.state}, ` : ''}{loc.country || 'Unknown'}</span>
                                {loc.location_id && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-[11px] text-slate-400">{loc.location_id}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Method & Confidence */}
                            <div className="text-right space-y-1">
                              <div className="flex items-center justify-end space-x-2">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  loc.resolution_method === 'exact_match' ? 'bg-emerald-100 text-emerald-800' :
                                  loc.resolution_method === 'alias_match' ? 'bg-blue-100 text-blue-800' :
                                  loc.resolution_method === 'fuzzy_match' ? 'bg-indigo-100 text-indigo-800' :
                                  loc.resolution_method === 'context_match' ? 'bg-purple-100 text-purple-800' :
                                  'bg-amber-100 text-amber-800'
                                }`}>
                                  {loc.resolution_method.replace('_', ' ').toUpperCase()}
                                </span>
                                <span className="font-bold text-sm text-slate-900">{confPct === null ? 'N/A' : `${confPct}%`}</span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {loc.explanation ? loc.explanation.substring(0, 42) + '...' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Candidates preview if ambiguous */}
                          {isAmbiguous && loc.candidates && (
                            <div className="mt-3 pt-3 border-t border-amber-200/60 grid grid-cols-3 gap-2 text-xs">
                              {loc.candidates.slice(0, 3).map((cand, cIdx) => (
                                <div key={cIdx} className="p-2 rounded bg-white border border-amber-200 text-slate-700">
                                  <div className="font-semibold text-slate-800 truncate">{cand.canonical_name}</div>
                                  <div className="text-[10px] text-slate-400">{cand.state}</div>
                                  <div className="font-mono text-[11px] font-bold text-amber-700 mt-0.5">
                                    {Math.round(cand.confidence * 100)}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="font-bold text-slate-900 text-base">Ready for Document Analysis</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Paste unstructured text or click one of the quick presets on top, then hit "Analyze Locations" to extract and standardize entities.
                </p>
              </div>
              <button
                onClick={handleAnalyze}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              >
                Analyze Default Text
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
