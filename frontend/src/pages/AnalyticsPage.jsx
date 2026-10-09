import React,{useEffect,useState} from 'react';
import {fetchAnalyticsOverview} from '../services/api';
import {Metrics,Distributions} from '../components/ReportPanels';
export default function AnalyticsPage(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{fetchAnalyticsOverview().then(setData).catch(e=>setError(e.message));},[]);
 if(error)return <p role="alert" className="p-8 text-rose-700">{error}</p>;
 if(!data)return <p className="p-8">Loading analytics…</p>;
 return <div className="p-8 space-y-6 max-w-7xl mx-auto"><Metrics data={data}/><Distributions data={data}/><section className="panel"><h3 className="font-bold mb-4">Recent analysis results</h3><p className="text-xs text-slate-500 mb-4">Counts describe the latest analysis of each input. Reanalyze after reviewing to update its snapshot.</p>{data.recent_activity.map(x=><div key={x.id} className="flex flex-wrap gap-3 justify-between text-sm border-b py-3"><span>{x.mention} → <strong>{x.canonical_name}</strong></span><span className="text-xs text-slate-500">{x.confidence}% similarity · {x.method}</span></div>)}</section></div>;
}
