import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LocationDetailModal from './components/LocationDetailModal';
import DashboardPage from './pages/DashboardPage';
import DocumentAnalysisPage from './pages/DocumentAnalysisPage';
import LocationExplorerPage from './pages/LocationExplorerPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import CommandPaletteModal from './components/CommandPaletteModal';
import { fetchReviewQueue } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inspectLocation, setInspectLocation] = useState(null);
  const [demoTriggerText, setDemoTriggerText] = useState('');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const [health, setHealth] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  useEffect(() => { fetch('/health').then(r => r.ok ? r.json() : null).then(setHealth).catch(() => setHealth(null)); }, [activeTab, revision]);

  useEffect(() => {
    fetchReviewQueue()
      .then((items) => setPendingReviewCount(items.length))
      .catch(() => {});
  }, [activeTab, revision]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleRunDemo = () => {
    setDemoTriggerText('The patient travelled from Madras to Banglore. The shipment was later sent from BLR to Bombay.');
    setActiveTab('analysis');
  };

  const handleAnalyzeDocument = () => {
    setActiveTab('analysis');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingReviewCount={pendingReviewCount}
        health={health}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onTryDemo={handleRunDemo}
          onAnalyzeDocument={handleAnalyzeDocument}
          onOpenSearchModal={() => setIsSearchOpen(true)}
        />

        {/* Dynamic Page Views */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardPage
              onNavigateToAnalysis={setActiveTab}
              onRunDemo={handleRunDemo}
            />
          )}

          <div hidden={activeTab !== 'analysis'}>
            <DocumentAnalysisPage
              key={demoTriggerText}
              initialText={demoTriggerText}
              onSelectLocation={(loc) => setInspectLocation(loc)}
              onAnalyzed={() => setRevision(v => v + 1)}
            />
          </div>

          {activeTab === 'explorer' && (
            <LocationExplorerPage
              onSelectLocation={(loc) => setInspectLocation(loc)}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsPage />}

          {activeTab === 'review' && <ReviewQueuePage onChanged={() => setRevision(v => v + 1)} />}

        </main>
      </div>

      {/* Modal Inspector */}
      {inspectLocation && (
        <LocationDetailModal
          location={inspectLocation}
          onClose={() => setInspectLocation(null)}
        />
      )}

      <CommandPaletteModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onRunDemo={handleRunDemo}
        onSelectLocation={(location) => setInspectLocation(location)}
      />
    </div>
  );
}
