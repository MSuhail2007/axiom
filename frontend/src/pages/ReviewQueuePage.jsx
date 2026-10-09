import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  ArrowRight, 
  RefreshCw, 
  Database, 
  Info 
} from 'lucide-react';
import { fetchReviewQueue, submitReviewDecision } from '../services/api';

export default function ReviewQueuePage({ onChanged }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidates, setSelectedCandidates] = useState({});
  const [feedbackNotice, setFeedbackNotice] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const items = await fetchReviewQueue();
      setQueue(items);
      setSelectedCandidates({});
    } catch (err) {
      setFeedbackNotice({type:'error', message:err.message});
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateSelect = (itemId, locationId) => {
    setSelectedCandidates((prev) => ({
      ...prev,
      [itemId]: locationId
    }));
  };

  const handleConfirm = async (item) => {
    const selectedLocId = selectedCandidates[item.id];
    if (!selectedLocId) return;

    setActionLoading(item.id);
    try {
      const res = await submitReviewDecision(item.id, {
        action: 'confirm',
        selectedCanonicalId: selectedLocId,
        createFutureAlias: true
      });

      setFeedbackNotice({
        type: 'success',
        message: `Confirmed: "${item.mention}" → "${res.canonical_name}". Saved for matching document context.`
      });

      // Remove from queue
      setQueue((prev) => prev.filter((i) => i.id !== item.id));
      onChanged?.();
    } catch (err) {
      setFeedbackNotice({
        type: 'error',
        message: err.message || 'Failed to submit review decision'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (item) => {
    setActionLoading(item.id);
    try {
      await submitReviewDecision(item.id, {
        action: 'reject',
        selectedCanonicalId: null
      });

      setFeedbackNotice({
        type: 'info',
        message: `Mention "${item.mention}" dismissed from review queue.`
      });

      setQueue((prev) => prev.filter((i) => i.id !== item.id));
      onChanged?.();
    } catch (err) {
      setFeedbackNotice({
        type: 'error',
        message: err.message || 'Failed to reject item'
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Banner explaining feedback loop */}
      <div className="p-6 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-start space-x-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 text-base">Saved human corrections</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ambiguous and low-similarity mentions enter this local review queue. Confirmations are saved for matching document context. Candidate scores are name similarity, not probabilities. Reanalyze the document to apply your correction.
          </p>
        </div>
      </div>

      {feedbackNotice && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
          feedbackNotice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{feedbackNotice.message}</span>
          </div>
          <button onClick={() => setFeedbackNotice(null)} className="text-slate-400 hover:text-slate-600">
            Dismiss
          </button>
        </div>
      )}

      {/* Queue Items */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          Loading review queue...
        </div>
      ) : queue.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Review Queue Clear</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No pending reviews. Analyze a document to add uncertain mentions here.
          </p>
          <button
            onClick={loadQueue}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh Queue
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {queue.length} Locations Require Manual Review
            </span>
            <button
              onClick={loadQueue}
              className="text-xs text-indigo-600 font-semibold hover:underline flex items-center space-x-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {queue.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase">Mention:</span>
                    <span className="font-mono text-base font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                      {item.mention}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                      AMBIGUOUS
                    </span>
                  </div>
                  {item.context_snippet && (
                    <p className="text-xs text-slate-500 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 font-sans italic">
                      "...{item.context_snippet}..."
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleReject(item)}
                    disabled={actionLoading === item.id}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Reject Mention
                  </button>
                  <button
                    onClick={() => handleConfirm(item)}
                    disabled={actionLoading === item.id || !selectedCandidates[item.id]}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors flex items-center space-x-1.5"
                  >
                    {actionLoading === item.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Mapping</span>
                  </button>
                </div>
              </div>

              {/* Candidate Selection Cards */}
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-2.5">
                  Select Correct Canonical Candidate:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {item.candidates?.filter((cand, idx, all) => all.findIndex(x => x.location_id === cand.location_id) === idx).map((cand, cIdx) => {
                    const isSelected = selectedCandidates[item.id] === cand.location_id;
                    const confPct = Math.round(cand.confidence * 100);

                    return (
                      <button
                        key={cIdx}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleCandidateSelect(item.id, cand.location_id)}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-600'
                            : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-sm text-slate-900">{cand.canonical_name}</div>
                            <div className="text-xs text-slate-500">{cand.state}, {cand.country}</div>
                            <div className="text-xs text-slate-500">{cand.kind} · {cand.source}</div>
                          </div>
                          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {confPct}%
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-400 font-mono">
                          ID: {cand.location_id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
