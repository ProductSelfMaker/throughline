// src/web/SpecPane.tsx
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function SpecPane({
  md,
  changedLines,
}: {
  md: string;
  changedLines: number[];
}) {
  const [flash, setFlash] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [md]);

  return (
    <section className={`spec ${flash ? 'flash' : ''}`}>
      <header className="spec-head">
        <span>📄 살아있는 기획서 · spec.md</span>
        {changedLines.length > 0 ? (
          <span className="badge">방금 {changedLines.length}줄 갱신</span>
        ) : null}
      </header>
      <div className="spec-body">
        {md.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        ) : (
          <p className="empty">대화를 시작하면 여기에 기획서가 살아납니다…</p>
        )}
      </div>
    </section>
  );
}
