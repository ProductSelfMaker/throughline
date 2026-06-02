// src/web/ScribeChat.tsx
// Floating scribe chat — a small button by default; opens a tall multi-turn
// chat that sends curation instructions to /api/curate (the PRD updates via SSE).
// Available on every view.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { curate } from './api';
import { Icons } from './icons';

type Msg = { role: 'user' | 'scribe'; text: string };

export function ScribeChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread, busy, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setThread((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      await curate(text);
      setThread((t) => [...t, { role: 'scribe', text: '문서에 반영했어요.' }]);
    } catch {
      setThread((t) => [...t, { role: 'scribe', text: '문제가 생겼어요. 다시 시도해 주세요.' }]);
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
      <button className="tl-fab" type="button" aria-label="스크라이브 열기" onClick={() => setOpen(true)}>
        {Icons.sparkle}
      </button>
    );
  }

  return (
    <div className="tl-fchat">
      <div className="tl-fchat-head">
        <span className="tl-fbadge">{Icons.sparkle}</span>
        <span className="tl-fname">스크라이브</span>
        <span className="tl-fsub">문서 정리</span>
        <span className="sp" />
        <button className="tl-fmin" type="button" aria-label="접기" onClick={() => setOpen(false)}>—</button>
      </div>
      <div className="tl-fthread">
        {thread.length === 0 ? (
          <div className="tl-fa">문서를 어떻게 다듬을지 말해 주세요. 예: "리스크 섹션 추가", "개요를 더 짧게".</div>
        ) : null}
        {thread.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'tl-fu' : 'tl-fa'}>{m.text}</div>
        ))}
        {busy ? <div className="tl-fa">반영 중…</div> : null}
        <div ref={endRef} />
      </div>
      <form className="tl-finput" onSubmit={onSubmit}>
        <textarea
          className="tl-finput-ta"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="스크라이브에게 지시…"
          rows={1}
          disabled={busy}
        />
        <div className="row">
          <span className="sp" />
          <button type="submit" className="tl-send" disabled={busy || !input.trim()} aria-label="보내기">{Icons.send}</button>
        </div>
      </form>
    </div>
  );
}
