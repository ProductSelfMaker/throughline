// src/web/TokensView.tsx
// Two fully-separated usage blocks (each with its own by-day graph):
//   - your actual coding usage in the project
//   - Throughline's own usage (what it spent to document that work)
// plus an overhead ratio comparing the two.
import type { AnalyticsResponse, Analytics } from './api';

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}

function UsageBlock({ title, a }: { title: string; a: Analytics }) {
  const t = a.tokens;
  const max = Math.max(1, ...t.perDay.map((d) => d.total));
  return (
    <section className="tl-usage">
      <p className="tl-section-h">{title}{a.approx ? ' · recent ~30 days' : ''}</p>
      <div className="tl-tok-hero">
        <div className="tl-tok-big">{fmt(t.total)}<small>tokens</small></div>
        <div className="tl-tok-cost">{t.turns} turns · {t.tools} tool calls{a.approx ? ' · recent only' : ''}</div>
      </div>
      <div className="tl-grid4">
        <div className="tl-stat"><div className="k">Input</div><div className="v">{fmt(t.input)}</div></div>
        <div className="tl-stat"><div className="k">Output</div><div className="v">{fmt(t.output)}</div></div>
        <div className="tl-stat"><div className="k">Cache read</div><div className="v">{fmt(t.cacheRead)}</div></div>
        <div className="tl-stat"><div className="k">Cache write</div><div className="v">{fmt(t.cacheCreate)}</div></div>
      </div>
      {t.perDay.length > 0 ? (
        <div className="tl-bars">
          {t.perDay.map((d) => (
            <div className="tl-bar-row" key={d.date}>
              <span className="lbl">{d.date.slice(5)}</span>
              <span className="tl-bar"><i style={{ width: `${Math.round((d.total / max) * 100)}%` }} /></span>
              <span className="val">{fmt(d.total)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TokensView({ analytics, loading }: { analytics: AnalyticsResponse | null; loading: boolean }) {
  if (loading && !analytics) return <div className="tl-pad"><p className="tl-placeholder">Loading…</p></div>;
  if (!analytics) return <div className="tl-pad"><p className="tl-placeholder">No data.</p></div>;

  const { project, self } = analytics;
  const pTotal = project.tokens.total;
  const sTotal = self?.tokens.total ?? 0;
  const ratio = pTotal > 0 ? Math.round((sTotal / pTotal) * 100) : null;

  return (
    <div className="tl-pad">
      {self ? (
        <div className="tl-tok-compare">
          <div className="big">{ratio === null ? '—' : ratio + '%'}</div>
          <div className="cap">
            Throughline overhead — it spent <b>{fmt(sTotal)}</b> tokens to document your <b>{fmt(pTotal)}</b> tokens of development.
          </div>
        </div>
      ) : null}

      <UsageBlock title="Your Claude Code usage in this project" a={project} />
      {self ? <UsageBlock title="Throughline's own usage (documenting your work)" a={self} /> : null}
    </div>
  );
}
