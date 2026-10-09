import React from 'react';
import { Search, Plus, ChevronRight, Sparkles } from 'lucide-react';
export default function Header({ activeTab, onTryDemo, onAnalyzeDocument, onOpenSearchModal }) {
 const titles={dashboard:'Overview',analysis:'Document studio',explorer:'Location explorer',analytics:'Analytics',review:'Review queue'};
 return <header className="studio-header"><div className="header-breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{titles[activeTab]||'Overview'}</strong></div><div className="header-actions"><button className="header-search" onClick={onOpenSearchModal} aria-label="Search locations and actions"><Search size={16}/><span>Search anything</span><kbd>⌘ / Ctrl K</kbd></button><button className="header-demo" onClick={onTryDemo} title="Try a sample analysis" aria-label="Try a sample analysis"><Sparkles size={17}/></button><button className="studio-button compact" onClick={onAnalyzeDocument}><Plus size={16}/><span>New analysis</span></button></div></header>;
}
