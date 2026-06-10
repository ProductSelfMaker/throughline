import { describe, it, expect } from 'vitest';
import { validateCitations, staleSections } from './source-citations';

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

describe('staleSections', () => {
  const MD = [
    '## Overview', 'x', '',
    '## Modules', '- s', '**Sources:** `src/a.ts`, `src/b.ts`', '',
    '## Key Flows', '- f', '**Sources:** `src/c.ts`', '',
  ].join('\n');

  it('flags a section whose cited file changed', () => {
    expect(staleSections(MD, ['src/b.ts'])).toEqual(['Modules']);
    expect(staleSections(MD, ['src/c.ts'])).toEqual(['Key Flows']);
  });
  it('flags every affected section', () => {
    expect(staleSections(MD, ['src/a.ts', 'src/c.ts'])).toEqual(['Modules', 'Key Flows']);
  });
  it('flags nothing when no cited file changed', () => {
    expect(staleSections(MD, ['src/unrelated.ts'])).toEqual([]);
  });
  it('never flags a section without Sources', () => {
    expect(staleSections('## Overview\njust prose\n', ['src/a.ts'])).toEqual([]);
  });
});
