# Conversational Scribe chat + Tidy confirmations in chat

**Date:** 2026-06-11
**Branch:** `feat/conversational-chat`

## Problem

The Scribe chat is one-way: a message sends a curate instruction and the assistant's reply is
hardcoded ("Applied to the document."). It should be a real two-way conversation. And when
**Tidy** (or Merge) has things to confirm, it should ask in chat rather than silently deciding.
(Merge already resolves conflicts via its own chat.)

## Design

### 1. Conversational chat

- `chat-prompt.ts` (new): `buildChatPrompt(messages, doc, diff)` — "You are the Scribe, a
  conversational assistant for the product doc. Reply naturally. If the user clearly asks for
  a change, edit the doc; if the request is ambiguous, ASK a clarifying question instead of
  guessing; if it's just a question, answer without editing. Only when you edit, output the
  full updated document in a `<!--DOC … DOC-->` block after your reply. Keep the spine +
  language policy." Embeds the conversation history + current doc + git diff.
  `extractDocEdit(raw)` → `{ reply, doc: string | null }`.
- `Session.chat(messages): { reply }` — runs the prompt; if a DOC block came back,
  `applySpecUpdate` + broadcast `spec-updated`; returns the reply text.
- `POST /api/chat { messages }` → `{ reply }`. (`/api/curate` stays.)
- New SSE event **`chat-message`** so the server can push assistant messages into the chat
  (used by Tidy). `/api/events` already forwards all broadcaster events.

### 2. Tidy raises confirmations in chat (non-blocking)

- `buildTidyPrompt` also emits a `<!--CONFIRM ["question", …]-->` block for ambiguities it
  should NOT silently decide. `extractConfirms(raw)` → `{ md, confirms: string[] }`.
- `tidyDoc`: apply the reorganized doc immediately (as today), then broadcast a `chat-message`
  for each confirm question. Tidy does NOT wait — the questions appear in the Scribe chat as
  follow-ups; the user answers them through the conversational chat, which applies the edits.

### 3. Merge — unchanged

MergeView already asks conflicts in its chat and applies answers. Consistent with the pattern.

### Client (`ScribeChat`)

- Send the full thread (history) to `/api/chat`; append the real reply. Remove the hardcoded
  "Applied". "Thinking…" while busy.
- Subscribe to `chat-message`; append server-pushed assistant messages (Tidy's questions). If
  the chat is collapsed, show an unread dot on the FAB. Clear the transcript on workspace
  switch (ephemeral; persistence is a follow-up).

## Testing

- `chat-prompt.test.ts`: prompt asks to converse / clarify / edit-only-when-clear, embeds
  history+doc; `extractDocEdit` splits the DOC block (null when absent).
- `tidy-prompt.test.ts`: emits a CONFIRM block instruction; `extractConfirms` parses it.
- `session.test.ts`: `chat` with a DOC block applies + broadcasts; a question-only reply
  doesn't edit; `tidyDoc` broadcasts `chat-message` per confirm.
- `app.test.ts`: `POST /api/chat`.
- Browser: ask a question → reply, no doc change; ask an edit → reply + doc updates; Tidy with
  a confirm → question appears in chat → answer → doc updates.

## Out of scope

- Persisting the transcript across reloads; streaming token-by-token replies.
