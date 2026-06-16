import { describe, it, expect } from 'vitest';
import { parseDocPatch, applyDocPatch, looksLikeFullDoc } from './doc-patch';

const DOC = [
  '## Overview',
  'A notes app.',
  '',
  '## 로그인',
  'old body',
  '',
  '## Open Questions',
  '- q',
  '',
].join('\n');

describe('parseDocPatch', () => {
  it('parses REPLACE and REMOVE blocks, keyed by their heading line', () => {
    const raw = [
      'sure, here are the changes:',
      '<<<REPLACE',
      '## 로그인',
      'new body',
      '>>>',
      '<<<REMOVE',
      '## 옛기능',
      '>>>',
    ].join('\n');
    const ops = parseDocPatch(raw);
    expect(ops).toEqual([
      { kind: 'replace', heading: '## 로그인', content: '## 로그인\nnew body' },
      { kind: 'remove', heading: '## 옛기능' },
    ]);
  });

  it('addresses ### sub-sections (deepest-heading granularity)', () => {
    const ops = parseDocPatch('<<<REPLACE\n### src/agent/ — layer\nupdated.\n>>>');
    expect(ops).toEqual([{ kind: 'replace', heading: '### src/agent/ — layer', content: '### src/agent/ — layer\nupdated.' }]);
  });

  it('returns [] when there are no blocks; ignores a block that does not start with a heading', () => {
    expect(parseDocPatch('no changes needed')).toEqual([]);
    expect(parseDocPatch('<<<REPLACE\njust text, no heading\n>>>')).toEqual([]);
  });
});

describe('looksLikeFullDoc', () => {
  it('detects a whole-document fallback (≥2 top-level headings)', () => {
    expect(looksLikeFullDoc(DOC)).toBe(true);
    expect(looksLikeFullDoc('## Only one')).toBe(false);
    expect(looksLikeFullDoc('no changes')).toBe(false);
  });
});

describe('applyDocPatch', () => {
  it('replaces only the targeted block, keeping the rest verbatim', () => {
    const out = applyDocPatch(DOC, [{ kind: 'replace', heading: '## 로그인', content: '## 로그인\nnew body' }]);
    expect(out).toContain('## 로그인\nnew body');
    expect(out).not.toContain('old body');
    expect(out).toContain('## Overview\nA notes app.');   // untouched
    expect(out).toContain('## Open Questions\n- q');        // untouched
  });

  it('adds a new ## section before Open Questions', () => {
    const out = applyDocPatch(DOC, [{ kind: 'replace', heading: '## 결제', content: '## 결제\nstripe.' }]);
    expect(out.indexOf('## 결제')).toBeGreaterThan(out.indexOf('## 로그인'));
    expect(out.indexOf('## 결제')).toBeLessThan(out.indexOf('## Open Questions')); // spine stays last
  });

  it('removes a non-spine block but never the spine', () => {
    const removed = applyDocPatch(DOC, [{ kind: 'remove', heading: '## 로그인' }]);
    expect(removed).not.toContain('## 로그인');
    const keepSpine = applyDocPatch(DOC, [{ kind: 'remove', heading: '## Open Questions' }]);
    expect(keepSpine).toContain('## Open Questions'); // spine protected
  });

  it('replaces a ### sub-section without re-emitting its ## parent', () => {
    const doc = '## Modules\n\n### a\nold a\n\n### b\nkeep b\n';
    const out = applyDocPatch(doc, [{ kind: 'replace', heading: '### a', content: '### a\nnew a' }]);
    expect(out).toContain('### a\nnew a');
    expect(out).toContain('### b\nkeep b'); // sibling untouched
    expect(out).toContain('## Modules');     // parent heading kept
  });
});
