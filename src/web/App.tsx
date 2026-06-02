// src/web/App.tsx
import { useCallback, useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { Sidebar } from './Sidebar';
import { ChatPane } from './ChatPane';
import { ViewRail, type ViewId } from './ViewRail';
import { ResizableDivider } from './ResizableDivider';
import { RightPane } from './RightPane';

const SPLIT_KEY = 'throughline.splitWidth';
const SIDEBAR_KEY = 'throughline.sidebarOpen';

function initialSplit(): number {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  return saved >= 20 && saved <= 80 ? saved : 42;
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId | null>(null);
  const [splitWidth, setSplitWidth] = useState(initialSplit);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== '0');
  const [md, setMd] = useState('');

  // Live spec from the background scribe → rendered in the 문서 view.
  useEffect(() => subscribeSpec((u) => setMd(u.md)), []);

  const toggleView = useCallback((view: ViewId) => {
    setActiveView((cur) => (cur === view ? null : view));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const onResize = useCallback((rightPercent: number) => {
    const clamped = Math.min(80, Math.max(20, rightPercent));
    setSplitWidth(clamped);
    localStorage.setItem(SPLIT_KEY, String(clamped));
  }, []);

  const open = activeView !== null;

  return (
    <div className="tl" data-variant="cards" data-theme="light">
      {sidebarOpen ? <Sidebar /> : null}
      <ChatPane onToggleSidebar={toggleSidebar} />
      {open ? (
        <>
          <ResizableDivider onResize={onResize} />
          <RightPane activeView={activeView} md={md} splitWidth={splitWidth} />
        </>
      ) : null}
      <ViewRail active={activeView} onToggle={toggleView} />
    </div>
  );
}
