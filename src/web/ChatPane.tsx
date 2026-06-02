// src/web/ChatPane.tsx
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchTranscript, sendChat, type Msg } from './api';
import { Icons } from './icons';

type Tool = { name: string; target: string };
type Turn = { role: 'user' | 'assistant'; content: string; tools: Tool[] };

const SUGGESTIONS = ['로그인 페이지', '랜딩 페이지', '대시보드', '결제 플로우', 'API 연동'];

export function ChatPane({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  function onSubmit(e: FormEvent) { e.preventDefault(); void send(); }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }
  function pickSuggestion(s: string) {
    setInput(s + ' ');
    inputRef.current?.focus();
  }

  const composer = (hero: boolean) => (
    <form className="tl-composer" onSubmit={onSubmit}>
      <textarea
        ref={hero ? inputRef : undefined}
        className="tl-composer-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={hero ? '무엇이든 설명해 주세요. 만들면서 다듬어 가요…' : '메시지를 입력하세요…'}
        rows={1}
        disabled={busy}
      />
      <div className="tl-composer-row">
        <span className="sp" />
        <button type="submit" className="tl-send" disabled={busy || !input.trim()} title="보내기" aria-label="보내기">{Icons.send}</button>
      </div>
    </form>
  );

  const empty = turns.length === 0;
  const firstUser = turns.find((t) => t.role === 'user')?.content ?? '';
  const title = empty ? '새 대화' : firstUser ? (firstUser.length > 30 ? firstUser.slice(0, 30) + '…' : firstUser) : '대화';

  return (
    <section className="tl-region tl-chat">
      <div className="tl-chat-head">
        <button className="tl-toggle" type="button" title="사이드바" aria-label="사이드바 토글" onClick={onToggleSidebar}>{Icons.toggle}</button>
        <span className="tl-chat-title">{title}</span>
        {empty ? null : <span className="tl-chat-sub">· {turns.length}개 메시지</span>}
        <span className="sp" />
      </div>

      {empty ? (
        <div className="tl-hero">
          <div className="tl-hero-mark">{Icons.mark}</div>
          <h1 className="tl-hero-title">오늘 무엇을 만들까요?</h1>
          <p className="tl-hero-sub">대화로 만들고, 스펙과 유저 플로우는 백그라운드에서 자동으로 정리돼요.</p>
          <div className="tl-hero-composer">{composer(true)}</div>
          <div className="tl-suggest">
            {SUGGESTIONS.map((s) => (
              <button type="button" className="tl-chip" key={s} onClick={() => pickSuggestion(s)}>{Icons.bolt}{s}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="tl-log">
            <div className="tl-thread">
              {turns.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="tl-msg-user">{m.content}</div>
                ) : (
                  <div key={i} className="tl-msg-asst">
                    <div className="tl-asst-head">
                      <span className="tl-asst-badge">{Icons.sparkle}</span>
                      <span className="tl-asst-name">Claude</span>
                    </div>
                    {m.tools.map((t, j) => (
                      <span key={j} className="tl-tool"><b>{t.name}</b>{t.target ? <span className="path">{t.target}</span> : null}<span className="ok">{Icons.check}</span></span>
                    ))}
                    <div className="tl-asst-md">
                      {m.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown> : <span className="tl-typing">작성 중…</span>}
                    </div>
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </div>
          <div className="tl-dock">{composer(false)}</div>
        </>
      )}
    </section>
  );
}
