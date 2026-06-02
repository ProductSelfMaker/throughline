// src/agent/project-ui-source.ts
// Deterministically read the observed project's real frontend source so a mockup
// can REPRODUCE it (verbatim CSS + faithful DOM) instead of an LLM re-deriving it
// from a text description. Bounded so a huge repo can't blow up memory/the prompt.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename, relative } from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor',
  '.next', '.svelte-kit', '.cache', '.turbo', '.vercel',
]);
const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const COMP_EXT = new Set(['.tsx', '.jsx', '.vue', '.svelte']);

const CSS_BUDGET = 140_000;
const COMP_BUDGET = 120_000;
const HEAD_BUDGET = 4_000;
const MAX_FILE = 80_000;
const MAX_DEPTH = 9;

export interface UiSource {
  /** All project stylesheets, concatenated verbatim (embedded into the mockup). */
  css: string;
  /** UI component source (DOM structure + class names) for the LLM to reproduce. */
  components: string;
  /** External <link> tags (fonts/stylesheets) from the project's HTML, so the
   *  mockup loads the same web fonts the real app does. */
  headLinks: string;
}

function looksLikeComponent(path: string, content: string): boolean {
  const name = basename(path);
  if (/\.(test|spec|stories|d)\./.test(name)) return false;
  // crude UI heuristic: contains JSX/markup with classes or elements
  return /className=|class=|<[A-Za-z][\w-]*[\s/>]|<template/.test(content);
}

/** Pull external font/stylesheet <link> tags out of an HTML document. */
function extractHeadLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = /rel\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? '';
    const keepRel = rel === 'stylesheet' || rel === 'preconnect' || rel === 'dns-prefetch';
    // only external resources — local CSS is already embedded verbatim
    if (keepRel && (/^https?:\/\//i.test(href) || rel === 'preconnect' || rel === 'dns-prefetch')) {
      out.push(tag.replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}

export async function collectUiSource(root: string): Promise<UiSource> {
  const cssParts: string[] = [];
  const compParts: string[] = [];
  const links = new Set<string>();
  let cssBytes = 0;
  let compBytes = 0;
  let headBytes = 0;

  async function readSafe(path: string): Promise<string> {
    try {
      const s = await stat(path);
      if (!s.isFile() || s.size > MAX_FILE) return '';
      return await readFile(path, 'utf8');
    } catch {
      return '';
    }
  }

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = extname(e.name);
      const rel = relative(root, full);
      if (CSS_EXT.has(ext) && cssBytes < CSS_BUDGET) {
        const c = await readSafe(full);
        if (c) { cssParts.push(`/* ===== ${rel} ===== */\n${c}`); cssBytes += c.length; }
      } else if (COMP_EXT.has(ext) && compBytes < COMP_BUDGET) {
        const c = await readSafe(full);
        if (c && looksLikeComponent(full, c)) { compParts.push(`// ===== ${rel} =====\n${c}`); compBytes += c.length; }
      } else if (ext === '.html' && headBytes < HEAD_BUDGET) {
        const c = await readSafe(full);
        if (c) { for (const l of extractHeadLinks(c)) { links.add(l); headBytes += l.length; } }
      }
    }
  }

  await walk(root, 0);
  return {
    css: cssParts.join('\n\n'),
    components: compParts.join('\n\n'),
    headLinks: [...links].join('\n'),
  };
}
