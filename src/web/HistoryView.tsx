// src/web/HistoryView.tsx
// The raw, exhaustive activity log — one card per user turn (every turn). Clicking
// opens the full conversation + work done. Turns that produced a decision are badged
// and show that decision in their detail (the curated "why" lives in the Decisions
// view; here it's just a cross-reference).
import { useEffect, useMemo, useState } from 'react';
import { fetchWorkItems, fetchWorkItemDetail, fetchDecisions, type WorkItem, type WorkItemDetail, type DecisionItem } from './api';

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}
function when(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
const turnKey = (file: string, start: number) => `${file}:${start}`;

export function HistoryView() {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [sel, setSel] = useState<WorkItem | null>(null);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWorkItems(100).then((i) => { if (alive) setItems(i); }).catch(() => { if (alive) setItems([]); });
    fetchDecisions().then(({ items }) => { if (alive) setDecisions(items); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // map a turn (file:start) → the decisions it produced
  const decByTurn = useMemo(() => {
    const m = new Map<string, DecisionItem[]>();
    for (const d of decisions) {
      if (!d.source) continue;
      const k = turnKey(d.source.file, d.source.start);
      const arr = m.get(k) ?? [];
      arr.push(d);
      m.set(k, arr);
    }
    return m;
  }, [decisions]);

  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    let alive = true;
    setDetailLoading(true);
    fetchWorkItemDetail(sel)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [sel]);

  if (items === null) return <div className="tl-pad"><p className="tl-placeholder">Loading…</p></div>;
  if (items.length === 0) return <div className="tl-pad"><p className="tl-placeholder">No work yet.</p></div>;

  const selDecisions = sel ? decByTurn.get(turnKey(sel.file, sel.start)) ?? [] : [];

  return (
    <div className="tl-pad">
      <div className="tl-hist-list">
        {items.map((h) => {
          const decs = decByTurn.get(turnKey(h.file, h.start));
          return (
            <button className="tl-hist-card" key={h.id} type="button" onClick={() => setSel(h)}>
              <div className="tl-hist-time">{when(h.time)}</div>
              <div className="tl-hist-b">
                <div className="t">{h.title}</div>
                <div className="meta">
                  <span>{h.tools} tools</span>
                  <span>{fmt(h.tokens)} tokens</span>
                  {decs?.length ? <span className="tl-dec-badge">◆ decision</span> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {sel ? (
        <div className="tl-detail-overlay" onClick={() => setSel(null)}>
          <div className="tl-detail" onClick={(e) => e.stopPropagation()}>
            <div className="tl-detail-head">
              <div className="t">{sel.title}</div>
              <button className="x" type="button" onClick={() => setSel(null)} aria-label="Close">✕</button>
            </div>
            {detailLoading && !detail ? (
              <div className="tl-detail-body"><p className="tl-placeholder">Loading…</p></div>
            ) : !detail ? (
              <div className="tl-detail-body"><p className="tl-placeholder">Couldn't load the detail.</p></div>
            ) : (
              <div className="tl-detail-body">
                <div className="tl-detail-meta">
                  <span>{when(detail.time || sel.time)}</span>
                  <span>{fmt(detail.tokens)} tokens</span>
                  {detail.filesTouched.length ? <span>{detail.filesTouched.length} files changed</span> : null}
                </div>
                {selDecisions.length ? (
                  <div className="tl-detail-decisions">
                    <span className="k">◆ Decision{selDecisions.length > 1 ? 's' : ''} from this turn</span>
                    {selDecisions.map((d) => (
                      <div className="tl-dd" key={d.id}>
                        <div className="t">{d.what}</div>
                        {d.why ? <div className="why">{d.why}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {detail.filesTouched.length ? (
                  <div className="tl-detail-files">
                    {detail.filesTouched.map((f) => <span className="chip" key={f}>{f}</span>)}
                  </div>
                ) : null}
                {detail.messages.map((m, i) => (
                  <div className={`tl-msg ${m.role}`} key={i}>
                    <div className="who">{m.role === 'user' ? 'You' : 'AI'}</div>
                    <div className="bubble">
                      {m.text ? <div className="txt">{m.text}</div> : null}
                      {m.tools.map((t, j) => (
                        <div className="tool" key={j}><b>{t.name}</b>{t.target ? ` · ${t.target}` : ''}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
