// src/web/ChatPane.tsx
import { useState, type FormEvent } from 'react';
import { sendChat } from './api';

type Msg = { role: 'user' | 'assistant'; content: string };

export function ChatPane() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    setBusy(true);
    try {
      await sendChat(text, (tok) => {
        setMessages((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { role: 'assistant', content: last.content + tok };
          return copy;
        });
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat">
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="empty">기획을 말해보세요. 대화가 곧 기획서가 됩니다.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || '…'}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: AI 미팅 노트 앱, 로그인은 소셜만…"
          disabled={busy}
        />
        <button disabled={busy}>{busy ? '…' : '보내기'}</button>
      </form>
    </section>
  );
}
