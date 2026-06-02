// src/domain/spec-doc.ts
import { FeatureItem, ParsedSpec, REQUIREMENTS_HEADING, OPEN_QUESTIONS_HEADING } from './types';

const FEATURE_RE =
  /^- \[( |x|X)\]\s+(.*?)(?:\s*<!--\s*id:\s*([\w-]+)\s*-->)?\s*$/;

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function featureId(text: string): string {
  return 'feat-' + djb2(text).toString(36);
}

export function getHeadings(md: string): string[] {
  return md
    .split('\n')
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.trim());
}

function sectionLines(md: string, heading: string): string[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

export function parseFeatures(md: string): FeatureItem[] {
  const items: FeatureItem[] = [];
  for (const line of sectionLines(md, REQUIREMENTS_HEADING)) {
    const m = FEATURE_RE.exec(line.trim());
    if (!m) continue;
    const text = m[2].trim();
    items.push({
      done: m[1].toLowerCase() === 'x',
      text,
      id: m[3] ?? featureId(text),
    });
  }
  return items;
}

export function parseOpenQuestions(md: string): string[] {
  return sectionLines(md, OPEN_QUESTIONS_HEADING)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

export function ensureFeatureIds(md: string): string {
  let inFeatures = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^##\s+/.test(line)) {
        inFeatures = line.trim() === REQUIREMENTS_HEADING;
        return line;
      }
      if (!inFeatures) return line;
      const m = FEATURE_RE.exec(line.trim());
      if (!m || m[3]) return line; // not a feature line, or already has an id
      const id = featureId(m[2].trim());
      return `${line.replace(/\s*$/, '')} <!-- id: ${id} -->`;
    })
    .join('\n');
}

export function parseSpec(md: string): ParsedSpec {
  return {
    features: parseFeatures(md),
    openQuestions: parseOpenQuestions(md),
    headings: getHeadings(md),
  };
}
