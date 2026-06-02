// src/agent/project-ui-source.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectUiSource } from './project-ui-source';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-ui-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function write(rel: string, content: string) {
  const full = join(dir, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('collectUiSource', () => {
  it('collects real CSS + UI components and external head links, skipping noise', async () => {
    await write('src/web/styles.css', '.tl{color:red}');
    await write('src/web/App.tsx', 'export const App = () => <div className="tl">hi</div>;');
    await write('src/web/App.test.tsx', 'it("x", () => <div className="tl"/>);'); // tests excluded
    await write('src/web/util.ts', 'export const f = () => 1;'); // non-component excluded
    await write('src/web/index.html', '<link rel="stylesheet" href="https://fonts.example/g.css" /><link rel="stylesheet" href="/local.css" />');
    await write('node_modules/pkg/junk.css', '.x{}'); // ignored dir
    await write('dist/out.css', '.y{}'); // ignored dir

    const { css, components, headLinks } = await collectUiSource(dir);

    expect(css).toContain('.tl{color:red}');
    expect(css).not.toContain('.x{}');
    expect(css).not.toContain('.y{}');

    expect(components).toContain('App.tsx');
    expect(components).toContain('className="tl"');
    expect(components).not.toContain('App.test.tsx');
    expect(components).not.toContain('util.ts');

    expect(headLinks).toContain('https://fonts.example/g.css'); // external kept
    expect(headLinks).not.toContain('/local.css');              // local skipped (CSS embedded instead)
  });

  it('returns empty strings (no throw) for a project with no frontend', async () => {
    await write('readme.md', '# hi');
    const out = await collectUiSource(dir);
    expect(out.css).toBe('');
    expect(out.components).toBe('');
    expect(out.headLinks).toBe('');
  });
});
