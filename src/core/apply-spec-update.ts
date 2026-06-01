// src/core/apply-spec-update.ts
import { SpecStore } from './spec-store';
import { validateSpec } from '../domain/spec-structure';
import { ensureFeatureIds } from '../domain/spec-doc';
import { changedLineNumbers } from '../domain/spec-diff';
import { ScribeResult } from '../domain/types';

export type ApplyResult =
  | { ok: true; result: ScribeResult }
  | { ok: false; errors: string[] };

/** Validate raw agent markdown, add feature ids, diff vs previous, write to disk. */
export async function applySpecUpdate(
  store: SpecStore,
  rawMd: string,
  previousMd: string,
): Promise<ApplyResult> {
  const validation = validateSpec(rawMd);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const md = ensureFeatureIds(rawMd);
  const changedLines = changedLineNumbers(previousMd, md);
  await store.write(md);
  return { ok: true, result: { md, changedLines } };
}
