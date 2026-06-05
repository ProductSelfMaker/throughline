// src/web/App.tsx
import { useEffect, useState } from 'react';
import { subscribeSpec, fetchAnalytics, type AnalyticsResponse } from './api';
import { MainView } from './MainView';
import { ViewRail, type ViewId } from './ViewRail';
import { ScribeChat } from './ScribeChat';
import { useJobs } from './useJobs';
import { Toaster } from './Toaster';

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('doc');
  const [md, setMd] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const jobs = useJobs();

  // Live product doc from the background scribe (session-log → doc).
  useEffect(() => subscribeSpec((u) => setMd(u.md)), []);

  // Tokens are derived live from the logs — fetch on entering that view.
  // (History self-fetches its work items.)
  useEffect(() => {
    if (activeView !== 'tokens') return;
    let alive = true;
    setAnalyticsLoading(true);
    fetchAnalytics()
      .then((a) => { if (alive) setAnalytics(a); })
      .catch(() => {})
      .finally(() => { if (alive) setAnalyticsLoading(false); });
    return () => { alive = false; };
  }, [activeView]);

  return (
    <div className="tl" data-variant="cards" data-theme="light">
      <MainView
        activeView={activeView}
        md={md}
        analytics={analytics}
        analyticsLoading={analyticsLoading}
        running={jobs.running}
        start={jobs.start}
        doneCounts={jobs.doneCounts}
      />
      <ViewRail active={activeView} onToggle={setActiveView} />
      {activeView === 'doc' ? <ScribeChat /> : null}
      <Toaster toasts={jobs.toasts} onDismiss={jobs.dismiss} />
    </div>
  );
}
