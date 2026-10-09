import React from 'react';
import { LayoutDashboard, FileText, Globe2, ChartNoAxesCombined, ListChecks, ArrowUpRight, ShieldCheck } from 'lucide-react';
export default function Sidebar({ activeTab, setActiveTab, pendingReviewCount = 0, health }) {
 const items = [['dashboard','Overview',LayoutDashboard],['analysis','Document studio',FileText],['explorer','Location explorer',Globe2],['analytics','Analytics',ChartNoAxesCombined],['review','Review queue',ListChecks]];
 return <aside className="studio-sidebar">
 <a className="studio-brand" href="#" onClick={e=>{e.preventDefault();setActiveTab('dashboard');}} aria-label="STHALAM overview"><img src="/assets/sthalam-logo.png" alt=""/><span>sthalam<span className="brand-caption">LOCATION INTELLIGENCE</span></span></a>
 <div className="workspace-label"><span className="workspace-icon">S</span><div>Local workspace<small>Personal environment</small></div><span className="status-dot"/></div>
 <p className="nav-eyebrow">WORKSPACE</p><nav aria-label="Main navigation">{items.map(([id,label,Icon])=><button key={id} title={label} aria-label={label} aria-current={activeTab===id?'page':undefined} className={`studio-nav ${activeTab===id?'is-active':''}`} onClick={()=>setActiveTab(id)}><Icon size={18}/><span>{label}</span>{id==='review'&&pendingReviewCount>0&&<b>{pendingReviewCount}</b>}</button>)}</nav>
 <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={22}/><h3>Your data. Your space.</h3><p>Location intelligence that stays on your computer.</p><button onClick={()=>setActiveTab('analysis')}>Start an analysis <ArrowUpRight size={15}/></button></div><div className="engine-status"><span className={`status-dot ${health?'':'is-muted'}`}/><span>{health?'Local engine connected':'Engine not confirmed'}</span></div><p className="data-credit">India coverage · GeoNames CC BY<br/>© OpenStreetMap contributors · ODbL</p></div>
 </aside>;
}
