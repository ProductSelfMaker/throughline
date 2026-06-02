// src/web/App.tsx
import { useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { MainView } from './MainView';
import { ViewRail, type ViewId } from './ViewRail';
import { ScribeChat } from './ScribeChat';

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('doc');
  const [md, setMd] = useState('');

  // Live PRD from the background scribe (session-log → PRD).
  useEffect(() => subscribeSpec((u) => setMd(u.md)), []);

  return (
    <div className="tl" data-variant="cards" data-theme="light">
      <MainView activeView={activeView} md={md} />
      <ViewRail active={activeView} onToggle={setActiveView} />
      {activeView === 'doc' ? <ScribeChat /> : null}
    </div>
  );
}
