// src/domain/spec-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  getHeadings,
  parseFeatures,
  parseOpenQuestions,
  ensureFeatureIds,
  featureId,
  parseSpec,
} from './spec-doc';

const SPEC = `---
title: Demo
---

## 📌 개요
한 줄 개요입니다.

## 🎯 목표
- 빠른 로그인

## ✅ 기능 요구사항
- [ ] 소셜 로그인
- [x] 대시보드 <!-- id: feat-keep -->

## ❓ 미해결 질문
- 결제 수단은?
- 무료 한도는?

## 인증
구글/애플 지원.
`;

describe('getHeadings', () => {
  it('returns every ## heading, trimmed', () => {
    expect(getHeadings(SPEC)).toEqual([
      '## 📌 개요',
      '## 🎯 목표',
      '## ✅ 기능 요구사항',
      '## ❓ 미해결 질문',
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
  it('parses the 미해결 질문 bullets', () => {
    expect(parseOpenQuestions(SPEC)).toEqual(['결제 수단은?', '무료 한도는?']);
  });
});

describe('ensureFeatureIds', () => {
  it('appends a deterministic id to requirement lines lacking one, and is idempotent', () => {
    const once = ensureFeatureIds(SPEC);
    expect(once).toContain(`- [ ] 소셜 로그인 <!-- id: ${featureId('소셜 로그인')} -->`);
    expect(once).toContain('- [x] 대시보드 <!-- id: feat-keep -->');
    expect(ensureFeatureIds(once)).toBe(once);
  });
});

describe('parseSpec', () => {
  it('returns features, open questions, and headings together', () => {
    const parsed = parseSpec(SPEC);
    expect(parsed.headings).toEqual([
      '## 📌 개요',
      '## 🎯 목표',
      '## ✅ 기능 요구사항',
      '## ❓ 미해결 질문',
      '## 인증',
    ]);
    expect(parsed.openQuestions).toEqual(['결제 수단은?', '무료 한도는?']);
    expect(parsed.features.map((f) => f.text)).toEqual(['소셜 로그인', '대시보드']);
  });
});
