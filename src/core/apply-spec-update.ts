// src/core/apply-spec-update.ts
import { SpecStore } from './spec-store';
import { ensureSpine } from '../domain/spec-structure';
import { changedLineNumbers } from '../domain/spec-diff';
import { ScribeResult } from '../domain/types';

export type ApplyResult =
  | { ok: true; result: ScribeResult }
  | { ok: false; errors: string[] };

/** Heal the spine, diff vs previous, write to disk. Only an empty/whitespace update
 *  is rejected (so a bad agent reply can't clobber the last good doc); a doc missing
 *  spine sections is healed, not rejected. */
export async function applySpecUpdate(
  store: SpecStore,
  rawMd: string,
  previousMd: string,
): Promise<ApplyResult> {
  if (!rawMd.trim()) return { ok: false, errors: ['빈 문서'] };
  const md = ensureSpine(rawMd);
  const changedLines = changedLineNumbers(previousMd, md);
  await store.write(md);
  return { ok: true, result: { md, changedLines } };
}
