import { describe, it, expect } from 'vitest';
import { validateCitations } from './source-citations';

describe('validateCitations', () => {
  const MD = [
    '## Overview',
    'A system.',
    '',
    '## Modules',
    '- **server** — Hono app',
    '**Sources:** `src/server/session.ts`, `src/ghost/nope.ts`',
    '',
    '## Key Flows',
    '- a flow',
    '**Sources:** `imaginary.ts`',
    '',
  ].join('\n');
  const real = ['src/server/session.ts', 'src/server/app.ts'];

  it('keeps real cited files and drops hallucinated ones', () => {
    const out = validateCitations(MD, real);
    expect(out).toContain('**Sources:** `src/server/session.ts`'); // real path kept
    expect(out).not.toContain('ghost');                            // hallucinated dropped
    expect(out).not.toContain('nope.ts');
  });

  it('removes a Sources line whose paths are all invalid', () => {
    const out = validateCitations(MD, real);
    expect(out).not.toContain('imaginary.ts');
    expect(out).not.toContain('**Sources:** `imaginary');
  });

  it('preserves all non-citation content', () => {
    const out = validateCitations(MD, real);
    expect(out).toContain('## Overview');
    expect(out).toContain('A system.');
    expect(out).toContain('- **server** — Hono app');
    expect(out).toContain('- a flow');
  });

  it('drops an un-backticked (unverifiable) Sources line rather than trusting it', () => {
    const out = validateCitations('## X\n**Sources:** src/server/app.ts\n', real);
    expect(out).not.toContain('Sources');
    expect(out).toContain('## X');
  });
});
