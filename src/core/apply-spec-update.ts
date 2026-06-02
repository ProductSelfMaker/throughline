// src/core/apply-spec-update.ts
import { SpecStore } from './spec-store';
import { ensureSpine } from '../domain/spec-structure';
import { ensureFeatureIds } from '../domain/spec-doc';
import { changedLineNumbers } from '../domain/spec-diff';
import { ScribeResult } from '../domain/types';

export type ApplyResult =
  | { ok: true; result: ScribeResult }
  | { ok: false; errors: string[] };

/** Heal the spine, add feature ids, diff vs previous, write to disk. Only an
 *  empty/whitespace update is rejected (so a bad agent reply can't clobber the
 *  last good PRD); a doc missing spine sections is healed, not rejected. */
export async function applySpecUpdate(
  store: SpecStore,
  rawMd: string,
  previousMd: string,
): Promise<ApplyResult> {
  if (!rawMd.trim()) return { ok: false, errors: ['빈 기획서'] };
  const healed = ensureSpine(rawMd);
  const md = ensureFeatureIds(healed);
  const changedLines = changedLineNumbers(previousMd, md);
  await store.write(md);
  return { ok: true, result: { md, changedLines } };
}
