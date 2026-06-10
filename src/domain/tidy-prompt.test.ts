import { describe, it, expect } from 'vitest';
import { buildTidyPrompt } from './tidy-prompt';

describe('buildTidyPrompt', () => {
  it('asks for a restructure-only pass that keeps the spine and the language', () => {
    const p = buildTidyPrompt('## Overview\nX\n\n## 로그인\n중복 1\n중복 1\n\n## Open Questions\n- a\n');
    expect(p).toContain('## Overview');           // keep the English spine
    expect(p).toContain('## Open Questions');
    expect(p).toContain('## 로그인');               // the current doc is embedded
    expect(p.toLowerCase()).toContain('reorganize'); // it's a reorganization
    expect(p).toMatch(/do not (add|invent)/i);     // no new information
    expect(p.toLowerCase()).toContain('language');  // preserve the doc's language
  });

  it('preserves existing Sources citation lines', () => {
    expect(buildTidyPrompt('## X\n**Sources:** `a.ts`\n')).toMatch(/preserve.*Sources/i);
  });
});
