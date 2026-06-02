// src/agent/project-code.ts
// Read the observed project's source code so a code-grounded product doc can be
// built (the rebuild's "deep scan"). Bounded per-file and in total, then split
// into prompt-sized chunks so a map-reduce works on a repo of any size.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename, relative } from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'tmp', 'temp',
  '.next', '.svelte-kit', '.nuxt', '.cache', '.turbo', '.vercel', '.git',
  '.idea', '.vscode', '__pycache__', 'target', 'bin', 'obj',
]);

// Source/product-relevant extensions (binaries/assets are excluded by omission).
const SRC_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro',
  '.py', '.go', '.rs', '.rb', '.java', '.kt', '.swift', '.php', '.cs', '.scala', '.ex', '.exs', '.dart',
  '.css', '.scss', '.sass', '.less', '.html',
  '.sql', '.graphql', '.gql', '.proto',
]);

// Manifests / docs that anchor the "what is this product" picture.
const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'go.mod', 'cargo.toml', 'composer.json',
  'build.gradle', 'pom.xml', 'gemfile', 'requirements.txt', 'pubspec.yaml',
]);

const SKIP_RE = /(\.(test|spec|stories)\.[a-z]+$)|(\.d\.ts$)|(\.min\.(js|css)$)|(\.map$)/i;
const LOCK_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'poetry.lock', 'cargo.lock', 'composer.lock', 'gemfile.lock']);

const PER_FILE_MAX = 100_000;     // skip files larger than this
const TOTAL_BUDGET = 6_000_000;   // overall cap (quality-first, but bounded)
const MAX_FILES = 4000;
const MAX_DEPTH = 12;
const NUL = String.fromCharCode(0);

export interface SourceFile { path: string; content: string; }

export interface ProjectCode {
  files: SourceFile[];
  /** true if collection hit a budget and some files were left out. */
  truncated: boolean;
}

function isManifest(name: string): boolean {
  const low = name.toLowerCase();
  return MANIFEST_NAMES.has(low) || /^readme(\.|$)/i.test(name) || /\.config\.(t|j)s$/.test(name);
}

function wanted(name: string): boolean {
  if (SKIP_RE.test(name) || LOCK_NAMES.has(name.toLowerCase())) return false;
  return SRC_EXT.has(extname(name).toLowerCase()) || isManifest(name);
}

/** Rank: manifests/README first, then config, then source — so chunks lead with context. */
function rank(path: string): number {
  const name = basename(path).toLowerCase();
  if (MANIFEST_NAMES.has(name)) return 0;
  if (/^readme(\.|$)/i.test(name)) return 1;
  if (/\.config\.(t|j)s$/.test(name)) return 2;
  return 3;
}

export async function collectProjectFiles(root: string): Promise<ProjectCode> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found.length >= MAX_FILES) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
        await walk(full, depth + 1);
      } else if (e.isFile() && wanted(e.name)) {
        found.push(full);
      }
    }
  }
  await walk(root, 0);

  // stable, context-first ordering: rank, then path (groups a directory together)
  found.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return relative(root, a).localeCompare(relative(root, b));
  });

  const files: SourceFile[] = [];
  let total = 0;
  let truncated = false;
  for (const full of found) {
    if (total >= TOTAL_BUDGET) { truncated = true; break; }
    let content: string;
    try {
      const s = await stat(full);
      if (!s.isFile()) continue;
      if (s.size > PER_FILE_MAX) { truncated = true; continue; }
      content = await readFile(full, 'utf8');
    } catch { continue; }
    if (content.slice(0, 2048).includes(NUL)) continue; // skip binaries
    files.push({ path: relative(root, full), content });
    total += content.length;
  }
  return { files, truncated };
}

export interface CodeChunk { label: string; text: string; files: string[]; }

/** Pack files into prompt-sized chunks (greedy, preserving order). */
export function chunkByBudget(files: SourceFile[], budget: number): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let cur: string[] = [];
  let curFiles: string[] = [];
  let size = 0;
  const flush = () => {
    if (!cur.length) return;
    const label = curFiles.length === 1 ? curFiles[0] : `${curFiles[0]} … ${curFiles[curFiles.length - 1]} (${curFiles.length}개 파일)`;
    chunks.push({ label, text: cur.join('\n\n'), files: curFiles });
    cur = []; curFiles = []; size = 0;
  };
  for (const f of files) {
    const block = `// ===== ${f.path} =====\n${f.content}`;
    if (size > 0 && size + block.length > budget) flush();
    cur.push(block); curFiles.push(f.path); size += block.length + 2;
  }
  flush();
  return chunks;
}
