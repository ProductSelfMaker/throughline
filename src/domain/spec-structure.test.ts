// src/domain/spec-structure.test.ts
import { describe, it, expect } from 'vitest';
import { validateSpec } from './spec-structure';
import { DEFAULT_SPEC } from './types';

describe('validateSpec', () => {
  it('accepts a doc containing all three spine headings', () => {
    expect(validateSpec(DEFAULT_SPEC)).toEqual({ ok: true, errors: [] });
  });

  it('reports each missing spine heading', () => {
    const result = validateSpec('## 🎯 요약\n\nhello\n');
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'missing spine heading: ## ✅ 핵심 기능',
      'missing spine heading: ## 🟡 미정 / 열린 질문',
    ]);
  });
});
