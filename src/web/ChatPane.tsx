// src/web/ChatPane.tsx
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchTranscript, sendChat, type Msg } from './api';

type Tool = { name: string; target: string };
type Turn = { role: 'user' | 'assistant'; content: string; tools: Tool[] };

export function ChatPane() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchTranscript()
      .then((msgs: Msg[]) => { if (alive) setTurns(msgs.map((m) => ({ role: m.role, content: m.content, tools: [] }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [turns]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', content: text, tools: [] }, { role: 'assistant', content: '', tools: [] }]);
    setBusy(true);
    try {
      await sendChat(text, (ev) => {
        setTurns((t) => {
          const copy = t.slice();
          const last = copy[copy.length - 1];
          if (ev.type === 'text') copy[copy.length - 1] = { ...last, content: last.content + ev.text };
          else if (ev.type === 'tool') copy[copy.length - 1] = { ...last, tools: [...last.tools, { name: ev.name, target: ev.target }] };
          return copy;
        });
      });
    } catch {
      setTurns((t) => {
        const copy = t.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, content: (last.content || '') + '\n\n_[오류가 발생했어요. 다시 시도해 주세요.]_' };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const composer = (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        className="composer-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="메시지를 입력하세요…"
        rows={1}
        disabled={busy}
      />
      <button type="submit" className="composer-send" disabled={busy || !input.trim()} aria-label="보내기">
        ↑
      </button>
    </form>
  );

  return (
    <section className="chat">
      {turns.length === 0 ? (
        <div className="chat-hero">
          <div className="hero-mark" aria-hidden>⌀</div>
          <h1 className="hero-title">오늘 무엇을 만들까요?</h1>
          <div className="hero-composer">{composer}</div>
        </div>
      ) : (
        <>
          <div className="chat-log">
            <div className="chat-thread">
              {turns.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="msg-user">{m.content}</div>
                ) : (
                  <div key={i} className="msg-asst">
                    <div className="asst-label">✦ CLAUDE</div>
                    {m.tools.map((t, j) => (
                      <span key={j} className="tool-chip">🔧 <b>{t.name}</b>{t.target ? ` ${t.target}` : ''} <span className="chk">✓</span></span>
                    ))}
                    <div className="asst-md">
                      {m.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown> : <span className="typing">작성 중…</span>}
                    </div>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </div>
          <div className="composer-dock">{composer}</div>
        </>
      )}
    </section>
  );
}
