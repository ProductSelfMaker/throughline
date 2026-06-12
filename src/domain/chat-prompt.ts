// src/domain/chat-prompt.ts
// Conversational scribe: a real two-way chat over the product doc. The model replies
// naturally and edits the doc only when the user clearly asks for a change — emitting the
// full updated doc in a DOC block. Ambiguous requests get a clarifying question (no edit);
// plain questions get an answer (no edit).
import { SPINE_HEADINGS } from './types';

export interface ChatMessage { role: 'user' | 'assistant'; text: string }

export function buildChatPrompt(messages: ChatMessage[], doc: string, diff: string): string {
  const lines = [
    'You are the Scribe — a conversational assistant for this product document (doc.md). Chat naturally with the user.',
    'Behaviour:',
    '- If the user clearly asks to change the document, edit it.',
    '- If a change request is ambiguous, ask ONE short clarifying question instead of guessing — do not edit.',
    '- If the user is just asking a question or chatting, answer conversationally — do not edit.',
    `When (and only when) you edit, keep the English spine (${SPINE_HEADINGS.join(' , ')}) and the document's language, and append the FULL updated document after your reply as:`,
    '<!--DOC',
    '<the full updated markdown>',
    'DOC-->',
    'Never put the DOC block when you are only replying or asking a clarifying question.',
    'LANGUAGE: reply in the same language the user writes in.',
    '',
    'Conversation so far:',
    '"""',
    messages.map((m) => `${m.role === 'user' ? 'User' : 'Scribe'}: ${m.text}`).join('\n'),
    '"""',
    '',
    'Current document:',
    '"""',
    doc,
    '"""',
    '',
    'Recent code change (git diff):',
    '"""',
    diff || '(none)',
    '"""',
    '',
    'Reply now (no code fences). Add the DOC block only if you are editing.',
  ];
  return lines.join('\n');
}

const DOC_RE = /<!--DOC\s*([\s\S]*?)\s*DOC-->/;

/** Split the conversational reply from an optional trailing DOC edit block (null = no edit). */
export function extractDocEdit(raw: string): { reply: string; doc: string | null } {
  const m = DOC_RE.exec(raw);
  if (!m) return { reply: raw.trim(), doc: null };
  return { reply: raw.replace(m[0], '').trim(), doc: m[1].trim() || null };
}
