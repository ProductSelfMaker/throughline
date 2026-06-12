// src/web/ScribeChat.tsx
// Floating scribe chat — a small button by default; opens a tall, two-way
// conversation. Messages go to /api/chat: the scribe answers questions and,
// when clearly asked, edits the document (changes arrive via SSE). The server
// can also push assistant messages here (Tidy/Merge confirmations) via the
// 'chat-message' SSE event. Available on every view.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { chat, subscribeChatMessage, subscribeWorkspace, type ChatMsg } from './api';
import { Icons } from './icons';

export function ScribeChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread, busy, open]);
  useEffect(() => { if (open) setUnread(false); }, [open]);

  // Server-pushed assistant messages (Tidy/Merge confirmations). Surface them in the
  // thread and flag the collapsed FAB so the user notices a question is waiting.
  useEffect(() => subscribeChatMessage((text) => {
    setThread((t) => [...t, { role: 'assistant', text }]);
    if (!openRef.current) setUnread(true);
  }), []);

  // A workspace switch is a different document → start a fresh conversation.
  useEffect(() => subscribeWorkspace(() => { setThread([]); setUnread(false); }), []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const next: ChatMsg[] = [...thread, { role: 'user', text }];
    setThread(next);
    setBusy(true);
    try {
      const reply = await chat(next);
      setThread((t) => [...t, { role: 'assistant', text: reply || 'Done.' }]);
    } catch {
      setThread((t) => [...t, { role: 'assistant', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void send(); }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  if (!open) {
    return (
      <button className="tl-fab" type="button" aria-label="Open scribe" onClick={() => setOpen(true)}>
        {Icons.sparkle}
        {unread ? <span className="tl-fab-dot" aria-label="New message" /> : null}
      </button>
    );
  }

  return (
    <div className="tl-fchat">
      <div className="tl-fchat-head">
        <span className="tl-fbadge">{Icons.sparkle}</span>
        <span className="tl-fname">Scribe</span>
        <span className="tl-fsub">Document</span>
        <span className="sp" />
        <button className="tl-fmin" type="button" aria-label="Collapse" onClick={() => setOpen(false)}>—</button>
      </div>
      <div className="tl-fthread">
        {thread.length === 0 ? (
          <div className="tl-fa">Ask me about the document, or tell me how to change it. e.g. "Why is auth a risk?", "Add a risks section", "Make the overview shorter".</div>
        ) : null}
        {thread.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'tl-fu' : 'tl-fa'}>{m.text}</div>
        ))}
        {busy ? <div className="tl-fa tl-fthinking">Thinking…</div> : null}
        <div ref={endRef} />
      </div>
      <form className="tl-finput" onSubmit={onSubmit}>
        <textarea
          className="tl-finput-ta"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the scribe…"
          rows={1}
          disabled={busy}
        />
        <div className="row">
          <span className="sp" />
          <button type="submit" className="tl-send" disabled={busy || !input.trim()} aria-label="Send">{Icons.send}</button>
        </div>
      </form>
    </div>
  );
}
