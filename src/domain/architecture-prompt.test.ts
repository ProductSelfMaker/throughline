import { describe, it, expect } from 'vitest';
import { buildArchMapPrompt, buildArchMergePrompt, buildArchDocPrompt } from './architecture-prompt';

describe('buildArchMapPrompt', () => {
  it('asks an architect to extract code structure (the inverse of the product-doc map)', () => {
    const p = buildArchMapPrompt('src/server/session.ts', 'class Session {}');
    expect(p).toContain('architect');                 // technical lens
    expect(p).toContain('src/server/session.ts');     // the chunk label
    expect(p).toContain('class Session {}');           // the code
    expect(p.toLowerCase()).toContain('module');       // modules/layers & responsibilities
  });
});

describe('buildArchMergePrompt', () => {
  it('merges architectural summaries without losing detail', () => {
    const p = buildArchMergePrompt('- core: spec store\n- server: hono app');
    expect(p).toContain('core: spec store');
    expect(p.toLowerCase()).toContain('merge');
  });
});

describe('buildArchDocPrompt', () => {
  it('synthesizes an architecture doc with the English spine, in the user language', () => {
    const p = buildArchDocPrompt('- domain: pure prompt builders', { readme: '# Throughline', decisions: 'Use Hono' });
    expect(p).toContain('## Overview');
    expect(p).toContain('## Stack');
    expect(p).toContain('## Modules');
    expect(p).toContain('## Key Flows');
    expect(p).toContain('- domain: pure prompt builders'); // grounded in the scan
    expect(p).toContain('# Throughline');                   // readme context
    expect(p).toContain('Use Hono');                        // decisions context (the "why")
    expect(p.toLowerCase()).toContain('language');          // write prose in the user's language
  });

  it('flags a truncated scan under Open/known limits', () => {
    const p = buildArchDocPrompt('x', { truncated: true });
    expect(p.toLowerCase()).toContain('cut off');
  });
});
