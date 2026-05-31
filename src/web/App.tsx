// src/web/App.tsx
import { useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { ChatPane } from './ChatPane';
import { SpecPane } from './SpecPane';

export function App() {
  const [md, setMd] = useState('');
  const [changedLines, setChangedLines] = useState<number[]>([]);

  useEffect(
    () =>
      subscribeSpec((u) => {
        setMd(u.md);
        setChangedLines(u.changedLines);
      }),
    [],
  );

  return (
    <div className="app">
      <ChatPane />
      <SpecPane md={md} changedLines={changedLines} />
    </div>
  );
}
