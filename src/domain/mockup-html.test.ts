// src/domain/mockup-html.test.ts
import { describe, it, expect } from 'vitest';
import { assembleMockupHtml } from './mockup-html';

describe('assembleMockupHtml', () => {
  it('embeds the real CSS verbatim and the body fragment in a full document', () => {
    const css = '.tl{--bg:#e9e6dd;background:var(--bg)}';
    const body = '<div class="mock-canvas"><div class="mock-art">x</div></div>';
    const out = assembleMockupHtml(css, body, '<link rel="stylesheet" href="https://fonts/x" />');

    expect(out.startsWith('<!doctype html')).toBe(true);
    expect(out).toContain(css);                       // app stylesheet, unmodified
    expect(out).toContain(body);                       // generated artboards
    expect(out).toContain('https://fonts/x');          // carried-over font link
    expect(out).toContain('.mock-frame');              // canvas chrome present
    expect(out.indexOf(css)).toBeLessThan(out.indexOf('.mock-frame')); // app CSS first, chrome after
  });
});
