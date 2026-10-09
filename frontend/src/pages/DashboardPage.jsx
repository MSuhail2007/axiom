import React, {useState, useEffect} from 'react';
import {Sparkles, ArrowRight, FileText} from 'lucide-react';
import {fetchAnalyticsOverview} from '../services/api';
import {Metrics, Distributions} from '../components/ReportPanels';
export default function DashboardPage({onNavigateToAnalysis, onRunDemo}) {
  const [data,setData] = useState(null), [error,setError] = useState('');
  useEffect(() => {fetchAnalyticsOverview().then(setData).catch(e=>setError(e.message));},[]);
  return <div className="p-8 space-y-8 max-w-7xl mx-auto">
    <section className="bg-gradient-to-r from-indigo-50 via-white to-slate-50 rounded-2xl border border-indigo-100 p-8">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold mb-3"><Sparkles size={14}/> STHALAM × PlaceLens · India · Local</div>
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 max-w-3xl">One place. Many names.<br/>Find the location behind the words.</h2>
      <p className="mt-4 text-sm text-slate-600 max-w-2xl leading-relaxed">Historical names, spelling mistakes, and transport codes become reviewable places. Explore the evidence, confirm uncertain matches, and keep your documents on this computer.</p>
      <div className="mt-6 flex gap-3 flex-wrap"><button onClick={onRunDemo} className="btn-primary"><Sparkles size={16}/> Try a sample <ArrowRight size={16}/></button><button onClick={()=>onNavigateToAnalysis('analysis')} className="btn-secondary"><FileText size={16}/> Open Document Studio</button></div>
    </section>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {!data && !error && <p>Loading local workspace…</p>}
    {data && <><Metrics data={data}/><Distributions data={data}/></>}
    <section className="panel"><h3 className="font-bold mb-4">How a name becomes a location</h3><div className="grid md:grid-cols-4 gap-4">{[['Detect','Find geographic mentions and preserve their original text.'],['Match','Search local GeoNames aliases and India OpenStreetMap.'],['Explain','Show similarity, candidates, and paragraph evidence.'],['Review','Below 80% or ambiguous? Confirm a candidate with its context.']].map(([title,body],i)=><div key={title} className="p-4 rounded-xl bg-slate-50 border"><span className="text-indigo-600 font-bold">0{i+1}</span><h4 className="font-semibold my-2">{title}</h4><p className="text-xs text-slate-500 leading-relaxed">{body}</p></div>)}</div></section>
  </div>;
}
