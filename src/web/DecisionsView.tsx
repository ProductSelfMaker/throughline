// src/web/DecisionsView.tsx
// Decisions as an accumulating timeline (newest first). Each node = one decision;
// click it to see why / alternatives and (when available) the source conversation.
// Stale-while-revalidate: shows the cached ledger instantly and swaps in updates.
import { useEffect, useMemo, useState } from 'react';
import { fetchDecisions, subscribeDecisions, fetchWorkItemDetail, type DecisionItem, type WorkItemDetail } from './api';

function when(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function DecisionsView() {
  const [items, setItems] = useState<DecisionItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState<DecisionItem | null>(null);
  const [source, setSource] = useState<WorkItemDetail | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchDecisions()
      .then(({ items, refreshing }) => { if (alive) { setItems(items); setRefreshing(refreshing); } })
      .catch(() => { if (alive) setItems([]); });
    const unsub = subscribeDecisions((fresh) => { if (alive) { setItems(fresh); setRefreshing(false); } });
    return () => { alive = false; unsub(); };
  }, []);

  // newest first for the timeline
  const ordered = useMemo(() => (items ? [...items].sort((a, b) => b.time - a.time) : []), [items]);
  const byId = useMemo(() => new Map((items ?? []).map((d) => [d.id, d])), [items]);

  useEffect(() => {
    if (!sel?.source) { setSource(null); return; }
    let alive = true;
    setSourceLoading(true);
    setSource(null);
    fetchWorkItemDetail({ id: '', title: '', time: 0, tools: 0, tokens: 0, ...sel.source })
      .then((d) => { if (alive) setSource(d); })
      .catch(() => { if (alive) setSource(null); })
      .finally(() => { if (alive) setSourceLoading(false); });
    return () => { alive = false; };
  }, [sel]);

  if (items === null) return <div className="tl-pad"><p className="tl-placeholder">Loading…</p></div>;
  if (ordered.length === 0) {
    return (
      <div className="tl-placeholder-wrap">
        <p className="tl-placeholder">
          {refreshing ? 'Extracting decisions from recent activity…' : 'No decisions yet. They are extracted automatically as activity accumulates.'}
        </p>
      </div>
    );
  }

  return (
    <div className="tl-pad">
      <div className="tl-timeline">
        {ordered.map((d) => {
          const superseded = d.supersedes ? byId.get(d.supersedes) : undefined;
          return (
            <button className="tl-tl-node" key={d.id} type="button" onClick={() => setSel(d)}>
              <span className="tl-tl-dot" />
              <span className="tl-tl-time">{when(d.time)}</span>
              <span className="tl-tl-body">
                <span className="t">{d.what}</span>
                {d.why ? <span className="why">{d.why}</span> : null}
                {superseded ? <span className="repl">{superseded.what}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {sel ? (
        <div className="tl-detail-overlay" onClick={() => setSel(null)}>
          <div className="tl-detail" onClick={(e) => e.stopPropagation()}>
            <div className="tl-detail-head">
              <div className="t">{sel.what}</div>
              <button className="x" type="button" onClick={() => setSel(null)} aria-label="Close">✕</button>
            </div>
            <div className="tl-detail-body">
              <div className="tl-detail-meta"><span>{when(sel.time)}</span></div>
              {sel.why ? <div className="tl-dec-field"><span className="k">Why</span><p>{sel.why}</p></div> : null}
              {sel.alternatives ? <div className="tl-dec-field"><span className="k">Alternatives</span><p>{sel.alternatives}</p></div> : null}
              {sel.supersedes && byId.get(sel.supersedes) ? (
                <div className="tl-dec-field"><span className="k">Replaces</span><p>{byId.get(sel.supersedes)!.what}</p></div>
              ) : null}

              {sel.source ? (
                <div className="tl-dec-source">
                  <span className="k">Source conversation</span>
                  {sourceLoading ? (
                    <p className="tl-placeholder">Loading…</p>
                  ) : !source ? (
                    <p className="tl-placeholder">Couldn't load the source.</p>
                  ) : (
                    source.messages.map((m, i) => (
                      <div className={`tl-msg ${m.role}`} key={i}>
                        <div className="who">{m.role === 'user' ? 'You' : 'AI'}</div>
                        <div className="bubble">
                          {m.text ? <div className="txt">{m.text}</div> : null}
                          {m.tools.map((t, j) => (
                            <div className="tool" key={j}><b>{t.name}</b>{t.target ? ` · ${t.target}` : ''}</div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
