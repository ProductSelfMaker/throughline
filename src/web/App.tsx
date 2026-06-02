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
  return saved >= 20 && saved <= 80 ? saved : 50;
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId | null>(null);
  const [splitWidth, setSplitWidth] = useState(initialSplit);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== '0');

  // Spec sync keeps running on the server; we hold the SSE subscription open so
  // live 문서/플로우 content can be re-wired into the views later (SP-D §7).
  useEffect(() => subscribeSpec(() => {}), []);

  const toggle = useCallback((view: ViewId) => {
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
    <div className="app">
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
        title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <line x1="9.5" y1="4" x2="9.5" y2="20" />
        </svg>
      </button>
      <Sidebar open={sidebarOpen} />
      <div className="chat-col" style={open ? { flexBasis: `${100 - splitWidth}%` } : { flex: 1 }}>
        <ChatPane />
      </div>
      {open ? (
        <>
          <ResizableDivider onResize={onResize} />
          <div className="view-col" style={{ flexBasis: `${splitWidth}%` }}>
            <RightPane activeView={activeView} />
          </div>
        </>
      ) : null}
      <ViewRail active={activeView} onToggle={toggle} />
    </div>
  );
}
