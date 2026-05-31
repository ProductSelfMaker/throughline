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
