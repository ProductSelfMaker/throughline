// src/domain/decisions-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildDecisionsExtractPrompt, parseDecisions } from './decisions-prompt';

describe('buildDecisionsExtractPrompt', () => {
  it('embeds the transcript + already-recorded decisions and asks for a JSON array', () => {
    const p = buildDecisionsExtractPrompt('[#0] User: 옵저버로 피봇하자', ['Use a chat model']);
    expect(p).toContain('옵저버로 피봇하자'); // transcript (user's language) embedded
    expect(p).toContain('Use a chat model'); // existing decision provided for dedupe
    expect(p).toContain('JSON array');
    expect(p).toContain('supersedes');
  });
});

describe('parseDecisions', () => {
  it('parses a JSON array, tolerating code fences and surrounding text', () => {
    const raw = 'here:\n```json\n[{"turn":1,"what":"Pivot to observer","why":"terminal already has the agent","alternatives":"keep chat","supersedes":"Use a chat model"}]\n```';
    const out = parseDecisions(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ turn: 1, what: 'Pivot to observer', why: 'terminal already has the agent', alternatives: 'keep chat', supersedes: 'Use a chat model' });
  });

  it('returns [] for non-JSON / empty output', () => {
    expect(parseDecisions('no decisions')).toEqual([]);
    expect(parseDecisions('[]')).toEqual([]);
  });
});
