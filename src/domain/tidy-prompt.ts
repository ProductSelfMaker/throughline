// src/domain/tidy-prompt.ts
// A "refactor" pass over the product doc: reorganize the CURRENT document for clarity
// without changing what it says. The scribe keeps appending activity, so the doc sprawls;
// Tidy merges duplicates, groups per-feature content, reorders, and tightens — losing
// nothing. Operates on the doc text only (no code scan), so it is cheap.
import { SPINE_HEADINGS } from './types';

export function buildTidyPrompt(currentPrd: string): string {
  return [
    'You are the scribe that maintains a PRODUCT document (doc.md). REORGANIZE the current document for clarity — a cleanup pass, like refactoring code. Restructure only; do not change what it says.',
    'Goals:',
    '- Merge duplicated or scattered points about the same feature into one place.',
    '- Group page/feature-specific content under its own "## <feature>" section; keep cross-cutting/global rules together.',
    '- Reorder sections and bullets into a logical reading order and tighten wording — without dropping any detail, policy, edge case, or state.',
    `- Keep the English spine (${SPINE_HEADINGS.join(' , ')}) and every existing feature section. Preserve all Open Questions.`,
    'Rules: preserve every fact and nuance. Do NOT add, invent, remove, or change any described feature or behavior — this is restructuring, not rewriting meaning.',
    'PRESERVE any existing "**Sources:**" citation lines verbatim, keeping each with its section; do not add, change, or remove them.',
    'LANGUAGE: keep the two spine headings in English; write all other content in the same language the document already uses. Do not translate it.',
    '',
    'CONFIRM: if reorganizing surfaces a genuine ambiguity you should NOT silently decide (e.g. two sections might be the same feature, or unclear where some content belongs), do the safe reorganization anyway but list that ambiguity as a short confirmation question for the user.',
    '',
    'Current document:',
    '"""',
    currentPrd,
    '"""',
    '',
    'Output the FULL reorganized document markdown, then optionally one confirm block (and nothing else):',
    '<!--CONFIRM ["<short question>", "<short question>"] CONFIRM-->',
    'Omit the block if there is nothing to confirm. No commentary, no code fences (```).',
  ].join('\n');
}

const CONFIRM_RE = /<!--CONFIRM\s+([\s\S]*?)\s+CONFIRM-->/;

/** Split the reorganized doc from an optional trailing CONFIRM block ([] when absent/malformed). */
export function extractConfirms(raw: string): { md: string; confirms: string[] } {
  const m = CONFIRM_RE.exec(raw);
  if (!m) return { md: raw.trim(), confirms: [] };
  const md = raw.replace(m[0], '').trim();
  try {
    const arr = JSON.parse(m[1]);
    return { md, confirms: Array.isArray(arr) ? arr.filter((q): q is string => typeof q === 'string' && q.trim().length > 0) : [] };
  } catch {
    return { md, confirms: [] };
  }
}
