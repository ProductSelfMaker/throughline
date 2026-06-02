// src/domain/spec-structure.ts
import { SPINE_HEADINGS, ValidationResult } from './types';
import { getHeadings } from './spec-doc';

export function validateSpec(md: string): ValidationResult {
  const headings = getHeadings(md);
  const errors: string[] = [];
  for (const h of SPINE_HEADINGS) {
    if (!headings.includes(h)) errors.push(`missing spine heading: ${h}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Self-heal: append any missing spine headings (in canonical order) while
 *  preserving existing content. Used on update instead of rejecting a doc that
 *  dropped a spine section — the PRD backbone is always restored, the rest is
 *  free to grow. */
export function ensureSpine(md: string): string {
  const present = new Set(getHeadings(md));
  const missing = SPINE_HEADINGS.filter((h) => !present.has(h));
  if (missing.length === 0) return md;
  const body = md.replace(/\s+$/, '');
  const added = missing.join('\n\n');
  return body ? `${body}\n\n${added}\n` : `${added}\n`;
}
