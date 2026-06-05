// src/web/MainView.tsx
// Primary region: wordmark + a per-page Rebuild action on top (no header bar); then the
// active view. Rebuild is scoped to the current page and runs as a background job — it
// completes even if you leave the page or reload (see useJobs); a toast fires on finish.
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchMockup, fetchArchitecture, fetchInfo, subscribeStatus, type AnalyticsResponse, type JobKind } from './api';
import { HistoryView } from './HistoryView';
import { TokensView } from './TokensView';
import { DecisionsView } from './DecisionsView';
import { MockupView } from './MockupView';
import { Icons } from './icons';
import type { ViewId } from './ViewRail';

/** Drop a leading YAML frontmatter block so it doesn't render as a stray heading. */
function stripFrontmatter(md: string): string {
  const m = /^\s*---\n[\s\S]*?\n---\s*\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

/** Shorten a path keeping the meaningful tail (project folder) visible. */
function shortenPath(p: string, max = 52): string {
  return p.length <= max ? p : '…' + p.slice(p.length - max + 1);
}

/** Header label per view — shown identically on every page. */
const VIEW_LABEL: Record<ViewId, string> = {
  doc: 'Document',
  architecture: 'Architecture',
  history: 'History',
  decisions: 'Decisions',
  tokens: 'Tokens',
  mockup: 'Mockup',
};

/** Which generative artifact a page's Rebuild rebuilds (null = no rebuild on that page). */
const REBUILD_KIND: Record<ViewId, Exclude<JobKind, 'mockup'> | null> = {
  doc: 'doc',
  architecture: 'architecture',
  decisions: 'decisions',
  history: null,
  tokens: null,
  mockup: null, // mockup uses its own Generate/Update button
};

/** Confirm-modal copy for the destructive (replace & rebuild) actions. */
const CONFIRM_COPY: Record<'doc' | 'decisions' | 'architecture', { title: string; body: React.ReactNode }> = {
  doc: { title: 'Rebuild document', body: <>The current document will be <b>replaced</b> and rebuilt from a fresh scan of your codebase. Continue?</> },
  decisions: { title: 'Rebuild decisions', body: <>The decisions ledger will be <b>rebuilt</b> from your recent activity. Continue?</> },
  architecture: { title: 'Rebuild architecture', body: <>The architecture overview will be <b>rebuilt</b> from a fresh scan of your codebase. Continue?</> },
};

export function MainView({
  activeView,
  md,
  analytics,
  analyticsLoading,
  running,
  start,
  doneCounts,
}: {
  activeView: ViewId;
  md: string;
  analytics: AnalyticsResponse | null;
  analyticsLoading: boolean;
  running: Set<JobKind>;
  start: (kind: JobKind) => void;
  doneCounts: Record<JobKind, number>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [mockupHtml, setMockupHtml] = useState<string | null>(null);
  const [archMd, setArchMd] = useState<string | null>(null);
  const [info, setInfo] = useState<{ cwd: string; display: string } | null>(null);
  const [working, setWorking] = useState(false);

  const rebuildKind = REBUILD_KIND[activeView];
  const rebuilding = rebuildKind ? running.has(rebuildKind) : false;
  const mockupBusy = running.has('mockup');

  useEffect(() => {
    let alive = true;
    fetchInfo().then((i) => { if (alive) setInfo(i); }).catch(() => {});
    const unsub = subscribeStatus((w) => { if (alive) setWorking(w); });
    return () => { alive = false; unsub(); };
  }, []);

  // (Re)load the mockup when entering the page and whenever a mockup job completes.
  useEffect(() => {
    if (activeView !== 'mockup') return;
    let alive = true;
    fetchMockup().then((h) => { if (alive) setMockupHtml(h); }).catch(() => { if (alive) setMockupHtml(''); });
    return () => { alive = false; };
  }, [activeView, doneCounts.mockup]);

  // (Re)load the architecture doc on entering the page and after each architecture rebuild.
  useEffect(() => {
    if (activeView !== 'architecture') return;
    let alive = true;
    fetchArchitecture().then((m) => { if (alive) setArchMd(m); }).catch(() => { if (alive) setArchMd(''); });
    return () => { alive = false; };
  }, [activeView, doneCounts.architecture]);

  return (
    <section className="tl-region tl-main">
      <div className="tl-toprow">
        <span className="wm">Throughline</span>
        {info?.display ? <span className="tl-cwd" title={info.cwd}>{shortenPath(info.display)}</span> : null}
        {working ? <span className="tl-working"><span className="dot" />Working…</span> : null}
        <span className="sp" />
        {activeView === 'mockup' ? (
          <button className="tl-gen" type="button" onClick={() => start('mockup')} disabled={mockupBusy}>
            {Icons.sparkle}{mockupBusy ? 'Generating…' : mockupHtml ? 'Update' : 'Generate'}
          </button>
        ) : null}
        {rebuildKind ? (
          <button
            className="tl-rebtn"
            type="button"
            onClick={() => { if (!rebuilding) setConfirm(true); }}
            disabled={rebuilding}
            title="Rebuild this page from a fresh scan"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v4h-4" /></svg>
            {rebuilding ? 'Rebuilding…' : 'Rebuild'}
          </button>
        ) : null}
      </div>

      <div className="tl-viewhead">{VIEW_LABEL[activeView]}</div>

      {activeView === 'doc' ? (
        <div className="tl-doc">
          <div className="tl-doc-inner">
            {md.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(md)}</ReactMarkdown>
            ) : (
              <p className="tl-placeholder">Start working in your terminal and a feature-by-feature product doc fills in here automatically.</p>
            )}
          </div>
        </div>
      ) : activeView === 'architecture' ? (
        <div className="tl-doc">
          <div className="tl-doc-inner">
            {archMd === null ? (
              <p className="tl-placeholder">Loading…</p>
            ) : archMd.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(archMd)}</ReactMarkdown>
            ) : (
              <p className="tl-placeholder">Press <b>Rebuild</b> to generate a developer-facing architecture overview from a scan of your codebase.</p>
            )}
          </div>
        </div>
      ) : activeView === 'history' ? (
        <HistoryView />
      ) : activeView === 'tokens' ? (
        <TokensView analytics={analytics} loading={analyticsLoading} />
      ) : activeView === 'decisions' ? (
        <DecisionsView />
      ) : (
        <MockupView html={mockupHtml} busy={mockupBusy} />
      )}

      {confirm && rebuildKind ? (
        <div className="tl-modal-overlay" onClick={() => setConfirm(false)}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tl-modal-title">{CONFIRM_COPY[rebuildKind].title}</div>
            <p className="tl-modal-body">{CONFIRM_COPY[rebuildKind].body}</p>
            <div className="tl-modal-actions">
              <button className="tl-btn-ghost" type="button" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="tl-btn-solid" type="button" onClick={() => { start(rebuildKind); setConfirm(false); }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
