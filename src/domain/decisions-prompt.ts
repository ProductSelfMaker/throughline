// src/domain/decisions-prompt.ts
// Decisions are extracted incrementally from new conversation turns and appended to
// an accumulating ledger. The extractor returns JSON so each decision can be linked
// to its source turn and (optionally) the earlier decision it supersedes.

export interface ParsedDecision {
  turn: number;
  what: string;
  why: string;
  alternatives: string;
  supersedes: string; // the "what" of an already-recorded decision, or ''
}

export function buildDecisionsExtractPrompt(transcript: string, existing: string[]): string {
  return [
    'You extract *decisions* from a development conversation and return them as JSON.',
    'A decision = a deliberate choice about the product or approach: what was decided, why, and which alternative was rejected.',
    'Only genuine decisions — not routine steps, code edits, bug fixes, tasks, or questions. Be selective: most turns contain NO decision.',
    'The "what" must state the chosen OUTCOME (e.g. "Decisions accumulate on a timeline"), not restate the user\'s request or task. If a turn is just a request/instruction with no settled choice, skip it.',
    '',
    'Already-recorded decisions (do NOT repeat these; output only NEW ones, including any that REVERSE one of these):',
    '"""',
    existing.length ? existing.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(none yet)',
    '"""',
    '',
    'Conversation turns, each tagged [#n]:',
    '"""',
    transcript,
    '"""',
    '',
    'Output a JSON array and nothing else. Each element:',
    '{"turn": <the [#n] this decision came from>, "what": "<one line>", "why": "<one line>", "alternatives": "<rejected option or empty>", "supersedes": "<the exact \\"what\\" text of an already-recorded decision this reverses/replaces, or empty>"}',
    'Write what / why / alternatives in the SAME language the conversation uses. If there are no new decisions, output exactly [].',
  ].join('\n');
}

/** Defensively parse the extractor's JSON array (tolerates fences / surrounding text). */
export function parseDecisions(raw: string): ParsedDecision[] {
  let text = raw.trim();
  const fence = /```[a-z]*\n([\s\S]*?)\n```/i.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map((o) => ({
      turn: Number(o?.turn) || 0,
      what: String(o?.what ?? ''),
      why: String(o?.why ?? ''),
      alternatives: String(o?.alternatives ?? ''),
      supersedes: String(o?.supersedes ?? ''),
    }));
  } catch {
    return [];
  }
}
