// src/domain/doc-patch.ts
// Section-scoped patch updates for the living doc. Instead of regenerating the whole
// document on every change (expensive output, and drift risk in untouched sections), the
// scribe emits only the heading-addressed blocks that change. A "block" is a heading line
// (## or ###) and its body up to the next heading of any level — the DEEPEST-heading
// granularity, so editing one "### sub-section" never re-emits its large "## parent".
//
// Applying is deterministic in code (not the model): untouched blocks are kept byte-for-byte.
import { SPINE_HEADINGS, OPEN_QUESTIONS_HEADING } from './types';

export type PatchOp =
  | { kind: 'replace'; heading: string; content: string } // full new block (content starts with the heading line)
  | { kind: 'remove'; heading: string };

const BLOCK_RE = /<<<(REPLACE|REMOVE)\s*\n([\s\S]*?)\n>>>/g;
const HEADING_RE = /^#{2,3}\s+\S/;

/** Parse the scribe's patch output into ordered ops. Tolerant of surrounding prose. */
export function parseDocPatch(raw: string): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const m of raw.matchAll(BLOCK_RE)) {
    const body = m[2].replace(/\s+$/, '');
    const heading = (body.split('\n', 1)[0] ?? '').trim();
    if (!HEADING_RE.test(heading)) continue; // a block must address a heading
    if (m[1] === 'REMOVE') ops.push({ kind: 'remove', heading });
    else ops.push({ kind: 'replace', heading, content: body.replace(/^\s+/, '') });
  }
  return ops;
}

/** Back-compat guard: a non-compliant model may ignore the patch format and return the whole
 *  document. Detect that (≥2 top-level "## " headings) so we can accept it as a full replace
 *  instead of clobbering the doc with a stray sentence. */
export function looksLikeFullDoc(raw: string): boolean {
  return (raw.match(/^##\s+\S/gm) || []).length >= 2;
}

interface Block { heading: string; text: string } // heading = the heading line; text = full block incl. heading

/** Split a doc into heading-addressed blocks at the deepest heading level (## and ###).
 *  Content before the first heading is returned as `preamble` (normally empty). */
function splitBlocks(doc: string): { preamble: string; blocks: Block[] } {
  const preamble: string[] = [];
  const blocks: Block[] = [];
  let cur: { heading: string; lines: string[] } | null = null;
  for (const line of doc.split('\n')) {
    if (HEADING_RE.test(line)) {
      if (cur) blocks.push({ heading: cur.heading, text: cur.lines.join('\n') });
      cur = { heading: line.trim(), lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (cur) blocks.push({ heading: cur.heading, text: cur.lines.join('\n') });
  return { preamble: preamble.join('\n'), blocks };
}

/** Apply heading-addressed ops: replace/add/remove blocks, keeping every untouched block
 *  byte-for-byte. New "## " sections insert before "## Open Questions"; new "### " blocks
 *  append. Spine sections are never removed. */
export function applyDocPatch(currentDoc: string, ops: PatchOp[]): string {
  const { preamble, blocks } = splitBlocks(currentDoc);
  const idx = (h: string) => blocks.findIndex((b) => b.heading === h);

  for (const op of ops) {
    const i = idx(op.heading);
    if (op.kind === 'remove') {
      if (i >= 0 && !SPINE_HEADINGS.includes(op.heading as (typeof SPINE_HEADINGS)[number])) blocks.splice(i, 1);
      continue;
    }
    const text = op.content.replace(/\s+$/, '');
    if (i >= 0) {
      blocks[i] = { heading: op.heading, text };
    } else if (op.heading.startsWith('## ')) {
      const oq = idx(OPEN_QUESTIONS_HEADING);
      blocks.splice(oq >= 0 ? oq : blocks.length, 0, { heading: op.heading, text });
    } else {
      blocks.push({ heading: op.heading, text });
    }
  }

  const parts = [preamble, ...blocks.map((b) => b.text)]
    .map((s) => s.replace(/\s+$/, ''))
    .filter((s) => s !== '');
  return parts.join('\n\n') + '\n';
}
