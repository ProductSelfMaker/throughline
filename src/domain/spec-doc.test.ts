// src/domain/spec-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  getHeadings,
  parseFeatures,
  parseOpenQuestions,
  ensureFeatureIds,
  featureId,
} from './spec-doc';

const SPEC = `---
title: Demo
---

## 🎯 요약
한 줄 요약입니다.

## ✅ 핵심 기능
- [ ] 소셜 로그인
- [x] 대시보드 <!-- id: feat-keep -->

## 🟡 미정 / 열린 질문
- 결제 수단은?
- 무료 한도는?

## 인증
구글/애플 지원.
`;

describe('getHeadings', () => {
  it('returns every ## heading, trimmed', () => {
    expect(getHeadings(SPEC)).toEqual([
      '## 🎯 요약',
      '## ✅ 핵심 기능',
      '## 🟡 미정 / 열린 질문',
      '## 인증',
    ]);
  });
});

describe('parseFeatures', () => {
  it('parses checkbox state, text, and existing or derived ids', () => {
    const features = parseFeatures(SPEC);
    expect(features).toEqual([
      { id: featureId('소셜 로그인'), text: '소셜 로그인', done: false },
      { id: 'feat-keep', text: '대시보드', done: true },
    ]);
  });
});

describe('parseOpenQuestions', () => {
  it('parses the 미정 bullets', () => {
    expect(parseOpenQuestions(SPEC)).toEqual(['결제 수단은?', '무료 한도는?']);
  });
});

describe('ensureFeatureIds', () => {
  it('appends a deterministic id to feature lines lacking one, and is idempotent', () => {
    const once = ensureFeatureIds(SPEC);
    expect(once).toContain(`- [ ] 소셜 로그인 <!-- id: ${featureId('소셜 로그인')} -->`);
    expect(once).toContain('- [x] 대시보드 <!-- id: feat-keep -->');
    expect(ensureFeatureIds(once)).toBe(once);
  });
});
