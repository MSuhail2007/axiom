import React from 'react';
import { 
  Compass, 
  FileText, 
  Database, 
  BarChart3, 
  CheckSquare, 
  ShieldCheck, 
  Sparkles 
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, pendingReviewCount = 0, health }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Compass },
    { id: 'analysis', label: 'Document Analysis', icon: FileText, badge: 'Core' },
    { id: 'explorer', label: 'Location Explorer', icon: Database },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { 
      id: 'review', 
      label: 'Review Queue', 
      icon: CheckSquare, 
      count: pendingReviewCount 
    },
  ];

  return (
    <aside className="sidebar w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand Logo & Name */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm shadow-indigo-200 overflow-hidden">
            <img src="/assets/sthalam-logo.png" alt="STHALAM logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-lg tracking-tight text-slate-900">STHALAM</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                NLP
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Location Standardizer</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="px-3 py-4 flex-1 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.count > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                  {item.count}
                </span>
              )}
              {item.badge && !item.count && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Engine Status Card */}
      <div className="p-4 border-t border-slate-100">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Resolution Pipeline</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">{health ? 'Local' : 'Checking'}</span>
          </div>
          <div className="text-[11px] text-slate-500 space-y-0.5">
            <div>India only · Offline processing</div>
            <div>NER: {health?.spacy ? 'spaCy' : 'Gazetteer scan'}</div>
            <div>Photon: {health?.photon ? 'Local service ready' : 'Unavailable; GeoNames available'}</div>
            <div className="pt-2">GeoNames (CC BY) · © OpenStreetMap contributors (ODbL)</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
