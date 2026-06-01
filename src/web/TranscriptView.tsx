// src/web/TranscriptView.tsx
import { useEffect, useRef, useState } from 'react';
import { fetchTranscript, subscribeEvents, type TranscriptEntry } from './api';

export function TranscriptView() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTranscript().then(setEntries).catch(() => {});
    return subscribeEvents({ onTranscript: setEntries });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries]);

  return (
    <section className="chat">
      <header className="transcript-head">🖥️ 내 터미널 (읽기 전용 미러)</header>
      <div className="chat-log">
        {entries.length === 0 ? (
          <p className="empty">터미널에서 Claude Code로 작업을 시작하면 여기에 비춰져요.</p>
        ) : (
          entries.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
