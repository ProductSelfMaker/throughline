// src/domain/architecture-prompt.ts
// Code-grounded ARCHITECTURE doc (the developer "how it's built" lens — the inverse of
// product-doc-prompt, which forbids implementation detail). map → (merge) → reduce over
// the project's real source. Same pipeline shape as the product doc.

/** MAP: extract architectural facts from one chunk of source code. */
export function buildArchMapPrompt(chunkLabel: string, code: string, files: string[] = []): string {
  return [
    'You are a software architect. Below is part of a product\'s *actual source code*.',
    'Extract the *technical architecture* this code reveals — for a developer who will build part of this system.',
    '',
    'Extract, concretely:',
    '- Modules / layers and their responsibilities (what this file/area is for, what it owns).',
    '- Boundary types & interfaces that define contracts between parts.',
    '- Libraries, frameworks, and runtime/platform this code depends on.',
    '- Data & control flows this code participates in (inputs → processing → outputs, events, IO).',
    '- Notable patterns or conventions (e.g. dependency injection, pub/sub, stores).',
    'Describe CODE structure and implementation — this is the opposite of a user-facing description.',
    'Only what the code shows. Mark anything inferred as "(uncertain)".',
    'CITATIONS: end every bullet with the file(s) it came from as [src: <path>], using ONLY these chunk paths:',
    files.length ? files.map((f) => `  - ${f}`).join('\n') : '  (none)',
    '',
    `Target code: ${chunkLabel}`,
    '"""',
    code,
    '"""',
    '',
    'Output: markdown bullets grouped by module/concern (module, responsibility, key types, deps, flows), each ending with its [src: <path>] tag. This is an intermediate summary — write it in English. No prose intro, no code fences.',
  ].join('\n');
}

/** MERGE: collapse several architectural summaries into fewer, losslessly (big repos). */
export function buildArchMergePrompt(summaries: string): string {
  return [
    'Below are architectural summaries pulled from several code areas of the same system.',
    'Merge them by module/concern, but **never lose concrete detail** (responsibilities, key types, dependencies, flows, uncertainties).',
    'Deduplicate the same module into one; keep every distinct module and flow.',
    'PRESERVE the [src: <path>] citations on each item; when you merge items, union their [src: …] paths.',
    '',
    'Summaries:',
    '"""',
    summaries,
    '"""',
    '',
    'Output: merged per-module markdown bullets only (in English). No prose intro, no code fences.',
  ].join('\n');
}

export interface ArchContext {
  manifest?: string;   // package.json — deps/scripts/runtime
  readme?: string;     // README — overview basis
  decisions?: string;  // accumulated decisions — the architectural "why"
  truncated?: boolean; // whether the code scan was cut off by size limits
  files?: string[];    // the repo's real source paths — the allowed citation vocabulary
}

/** REDUCE: synthesize the architecture document in the house structure. */
export function buildArchDocPrompt(archSummary: string, ctx: ArchContext): string {
  const lines = [
    'You write an ARCHITECTURE document (architecture.md) that explains *how this system is built* to a',
    'developer who will build part of the whole product. The summary below was extracted by scanning the',
    'entire codebase. Use it to write a detailed, accurate architecture overview from scratch.',
    '',
    'Required structure (these four headings, in this order, in English):',
    '1) "## Overview" — the system at a glance: what it is technically and its high-level shape (1–2 paragraphs).',
    '2) "## Stack" — languages, frameworks, key libraries, and the runtime/platform.',
    '3) "## Modules" — the real modules/layers (name them as they exist in the source, e.g. directories),',
    '   each with its responsibility and boundaries; how they depend on each other.',
    '4) "## Key Flows" — the main data/control flows end to end (inputs → processing → outputs, events, IO).',
    '',
    'Rules:',
    '- Ground everything in the scan. Name the actual modules, types, and libraries. Do not invent.',
    '- This is technical (how it is built), NOT a user-facing product description and NOT a work log.',
    '- Where the architecture is unclear from code alone, say so briefly rather than guessing.',
    '- CITATIONS: at the end of each "##" section, add a line `**Sources:** ' + '`path1`, `path2`' + '` listing the source files for that section, collected from the [src: …] tags in the summary. Cite ONLY files from the allowed list below, backtick each path, and omit the line if a section has no known source file.',
  ];
  if (ctx.truncated) {
    lines.push('- The code scan was cut off by size limits — note possibly-missing areas in one line.');
  }
  lines.push(
    'LANGUAGE: keep the four headings in English, but write all prose in the SAME language the user uses',
    '(infer it from the README and decisions below). Do not default to English if the user works in another language.',
    '',
    'Architecture summary (result of the full code scan):',
    '"""',
    archSummary || '(empty)',
    '"""',
  );
  if (ctx.manifest) lines.push('', 'Manifest (deps/scripts/runtime):', '"""', ctx.manifest.slice(0, 2000), '"""');
  if (ctx.readme) lines.push('', 'README:', '"""', ctx.readme.slice(0, 4000), '"""');
  if (ctx.decisions) lines.push('', 'Accumulated decisions (the architectural "why" — reference):', '"""', ctx.decisions.slice(0, 4000), '"""');
  if (ctx.files?.length) lines.push('', 'Allowed source files for **Sources:** citations (use ONLY these, exactly as written):', '"""', ctx.files.join('\n').slice(0, 8000), '"""');
  lines.push('', 'Output the FULL architecture document markdown only — no commentary, no code fences (```).');
  return lines.join('\n');
}
