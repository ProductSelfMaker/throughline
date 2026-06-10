// src/domain/source-citations.ts
// Validate the source citations the LLM attached to the architecture doc against the repo's
// REAL file set, so every "**Sources:**" path is guaranteed to exist (no hallucinated paths).
// Fail-safe: a Sources line with no verifiable (backticked, real) path is dropped entirely —
// better to show nothing than an unverified citation.

const SOURCES_RE = /^\*\*Sources:\*\*\s*(.*)$/;

const citedPaths = (sourcesLine: string): string[] =>
  [...sourcesLine.matchAll(/`([^`]+)`/g)].map((x) => x[1].trim());

export function validateCitations(md: string, realPaths: string[]): string {
  const real = new Set(realPaths);
  return md
    .split('\n')
    .flatMap((line) => {
      const m = SOURCES_RE.exec(line);
      if (!m) return [line];
      const valid = citedPaths(m[1]).filter((p) => real.has(p));
      if (valid.length === 0) return []; // drop the whole line (unverifiable)
      return [`**Sources:** ${valid.map((p) => '`' + p + '`').join(', ')}`];
    })
    .join('\n');
}

/** Section headings (`## …`) whose cited files intersect `changedFiles` (i.e. the code they
 *  were built from has changed). A section with no Sources line is never stale. */
export function staleSections(md: string, changedFiles: string[]): string[] {
  const changed = new Set(changedFiles);
  const stale: string[] = [];
  let heading = '';
  let headingStale = false;
  const flush = () => { if (heading && headingStale) stale.push(heading); };
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { flush(); heading = h[1]; headingStale = false; continue; }
    const s = SOURCES_RE.exec(line);
    if (s && heading && citedPaths(s[1]).some((p) => changed.has(p))) headingStale = true;
  }
  flush();
  return stale;
}
