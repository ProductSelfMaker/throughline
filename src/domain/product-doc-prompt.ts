// src/domain/product-doc-prompt.ts
// Code-grounded product doc (the "Rebuild" deep pass). map → (merge) → reduce.
// The doc describes the product from the USER's perspective (features/pages,
// behaviors, policies, states) — NOT code architecture or a work log.
import { SPINE_HEADINGS } from './types';

/** MAP: extract user-facing product behavior from one chunk of source code. */
export function buildCodeMapPrompt(chunkLabel: string, code: string, files: string[] = []): string {
  return [
    'You are a product analyst. Below is part of some product\'s *actual source code*.',
    'Extract every *end-user-visible feature, screen, and behavior* this code implements, as concretely as possible.',
    '',
    'Perspective rules:',
    '- Do not describe code structure or implementation (functions/classes/files/libraries). Only user-visible product behavior.',
    '- Cover screens/pages/views, elements (buttons, inputs, menus), behavior rules and policies, states (idle/loading/empty/error/overlay/modal/etc.), and what the user can do — concretely.',
    '- Only what the code supports. Mark anything that requires guessing as "(uncertain)".',
    'CITATIONS: end every bullet with the file(s) it came from as [src: <path>], using ONLY these chunk paths:',
    files.length ? files.map((f) => `  - ${f}`).join('\n') : '  (none)',
    '',
    `Target code: ${chunkLabel}`,
    '"""',
    code,
    '"""',
    '',
    'Output: markdown bullets grouped by feature/screen, each with what / behavior & policy / elements / state, and ending with its [src: <path>] tag. This is an intermediate summary — write it in English. No prose intro, no code fences.',
  ].join('\n');
}

/** MERGE: collapse several map summaries into fewer, losslessly (for big repos). */
export function buildReduceMergePrompt(summaries: string): string {
  return [
    'Below are user-facing feature summaries pulled from several code areas of the same product.',
    'Merge them by feature/screen, but **never lose concrete detail** (preserve behavior, policy, elements, states, and uncertainties).',
    'Deduplicate the same feature into one; keep every distinct feature.',
    'PRESERVE the [src: <path>] citations on each item; when you merge items, union their [src: …] paths.',
    '',
    'Summaries:',
    '"""',
    summaries,
    '"""',
    '',
    'Output: merged per-feature markdown bullets only (in English). No prose intro, no code fences.',
  ].join('\n');
}

export interface DocContext {
  manifest?: string;   // package.json etc. — product name/description
  readme?: string;     // README — overview basis
  decisions?: string;  // accumulated decisions — the "why"
  activity?: string;   // recent conversation/work excerpt — intent & open questions
  truncated?: boolean; // whether the code scan was cut off by size limits
  files?: string[];    // the repo's real source paths — the allowed citation vocabulary
}

/** REDUCE: synthesize the final, detailed product doc in the house structure. */
export function buildProductDocPrompt(featureSummary: string, ctx: DocContext): string {
  const lines = [
    'You write a PRODUCT document (doc.md) that explains the service to its users.',
    'The "feature summary" below was extracted by scanning the product\'s entire codebase. Use it to write a *very, very detailed* product document from scratch.',
    '',
    'Document rules:',
    `1) Always include the English structural spine: ${SPINE_HEADINGS.join(' , ')}. "## Overview" = what the service is and who it is for (1–2 paragraphs).`,
    '2) Give each feature/page its own "## <name>" section with: what it is (one line), behavior & policy (concrete rules), elements (screen makeup), and state (idle/loading/empty/error/overlay etc. when relevant) — leave nothing out.',
    '3) Be generous with detail — capture policies, edge cases, interactions, and state transitions visible in the code, but from the user\'s perspective (no internal implementation).',
    '4) This is not a work log. Do not write commits, todos, or process — that is history.',
    '5) Put product intent that is weakly supported or unknowable from code alone under "## Open Questions" as "- " bullets.',
    '6) Do not invent features absent from the code.',
    '7) CITATIONS: at the end of each "##" section, add a line `**Sources:** ' + '`path1`, `path2`' + '` listing the source files for that section, collected from the [src: …] tags in the summary. Cite ONLY files from the allowed list below, backtick each path, and omit the line if a section has no known source file.',
  ];
  if (ctx.truncated) {
    lines.push('8) The code scan was cut off by size limits. Note possibly-missing areas as a one-line bullet under "## Open Questions".');
  }
  lines.push(
    'LANGUAGE: keep the two spine headings in English, but write everything else — feature section names and all prose — in the SAME language the user uses (infer it from the README and activity below). Do not default to English if the user works in another language.',
    '',
    'Feature summary (result of the full code scan):',
    '"""',
    featureSummary || '(empty)',
    '"""',
  );
  if (ctx.manifest) lines.push('', 'Product metadata (manifest):', '"""', ctx.manifest.slice(0, 2000), '"""');
  if (ctx.readme) lines.push('', 'README:', '"""', ctx.readme.slice(0, 4000), '"""');
  if (ctx.decisions) lines.push('', 'Accumulated decisions (the "why" — reference):', '"""', ctx.decisions.slice(0, 4000), '"""');
  if (ctx.activity) lines.push('', 'Recent activity (intent & open questions — reference):', '"""', ctx.activity.slice(0, 4000), '"""');
  if (ctx.files?.length) lines.push('', 'Allowed source files for **Sources:** citations (use ONLY these, exactly as written):', '"""', ctx.files.join('\n').slice(0, 8000), '"""');
  lines.push('', 'Output the FULL product document markdown only — no commentary, no code fences (```).');
  return lines.join('\n');
}
