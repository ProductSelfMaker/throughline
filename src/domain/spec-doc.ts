// src/domain/spec-doc.ts
import { ParsedSpec, OPEN_QUESTIONS_HEADING } from './types';

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

export function parseOpenQuestions(md: string): string[] {
  return sectionLines(md, OPEN_QUESTIONS_HEADING)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

export function parseSpec(md: string): ParsedSpec {
  return {
    openQuestions: parseOpenQuestions(md),
    headings: getHeadings(md),
  };
}
