// src/domain/source-citations.ts
// Validate the source citations the LLM attached to the architecture doc against the repo's
// REAL file set, so every "**Sources:**" path is guaranteed to exist (no hallucinated paths).
// Fail-safe: a Sources line with no verifiable (backticked, real) path is dropped entirely —
// better to show nothing than an unverified citation.

const SOURCES_RE = /^\*\*Sources:\*\*\s*(.*)$/;

export function validateCitations(md: string, realPaths: string[]): string {
  const real = new Set(realPaths);
  return md
    .split('\n')
    .flatMap((line) => {
      const m = SOURCES_RE.exec(line);
      if (!m) return [line];
      const cited = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1].trim());
      const valid = cited.filter((p) => real.has(p));
      if (valid.length === 0) return []; // drop the whole line (unverifiable)
      return [`**Sources:** ${valid.map((p) => '`' + p + '`').join(', ')}`];
    })
    .join('\n');
}
