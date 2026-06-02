// src/agent/project-code.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProjectFiles, chunkByBudget } from './project-code';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-code-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function write(rel: string, content: string) {
  const full = join(dir, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('collectProjectFiles', () => {
  it('collects source + manifests, skips deps/tests/locks/binaries, manifests first', async () => {
    await write('package.json', '{"name":"demo"}');
    await write('README.md', '# Demo');
    await write('src/App.tsx', 'export const App = () => <div/>;');
    await write('src/util.ts', 'export const f = () => 1;');         // non-markup source still included
    await write('src/App.test.tsx', 'it("x", () => {});');           // tests excluded
    await write('package-lock.json', '{}');                           // lockfile excluded
    await write('node_modules/dep/index.ts', 'export const x = 1;');  // deps excluded
    await write('dist/bundle.js', 'console.log(1)');                  // build output excluded

    const { files } = await collectProjectFiles(dir);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/App.tsx');
    expect(paths).toContain('src/util.ts');
    expect(paths).not.toContain('src/App.test.tsx');
    expect(paths).not.toContain('package-lock.json');
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(paths.some((p) => p.includes('dist'))).toBe(false);

    // manifest / README come before source so chunks lead with context
    expect(paths.indexOf('package.json')).toBeLessThan(paths.indexOf('src/App.tsx'));
    expect(paths.indexOf('README.md')).toBeLessThan(paths.indexOf('src/App.tsx'));
  });
});

describe('chunkByBudget', () => {
  it('packs files into prompt-sized chunks, each carrying file headers', () => {
    const files = [
      { path: 'a.ts', content: 'A'.repeat(60) },
      { path: 'b.ts', content: 'B'.repeat(60) },
      { path: 'c.ts', content: 'C'.repeat(60) },
    ];
    const chunks = chunkByBudget(files, 100); // small budget forces splitting
    expect(chunks.length).toBeGreaterThan(1);
    const allText = chunks.map((c) => c.text).join('\n');
    expect(allText).toContain('// ===== a.ts =====');
    expect(allText).toContain('// ===== c.ts =====');
    // every original file lands in exactly one chunk
    expect(chunks.flatMap((c) => c.files).sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
