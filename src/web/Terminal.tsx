// src/web/Terminal.tsx
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({ convertEol: true, fontSize: 13, cursorBlink: true, theme: { background: '#0b0e14' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal`);
    const send = (m: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'data') term.write(m.data);
    };
    ws.onopen = () => send({ type: 'resize', cols: term.cols, rows: term.rows });

    const onData = term.onData((d) => send({ type: 'input', data: d }));
    const onResize = () => { fit.fit(); send({ type: 'resize', cols: term.cols, rows: term.rows }); };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      onData.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  return <div className="terminal-host" ref={hostRef} />;
}
