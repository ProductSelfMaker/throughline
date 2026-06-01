// src/web/Terminal.tsx
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);
  const reconnectRef = useRef<() => void>(() => {});
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({ convertEol: true, fontSize: 13, cursorBlink: true, theme: { background: '#0b0e14' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let ws: WebSocket | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const send = (m: unknown) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

    function connect() {
      setDisconnected(false);
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/terminal`);
      ws.onopen = () => send({ type: 'resize', cols: term.cols, rows: term.rows });
      ws.onmessage = (e) => {
        let m: any;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'data') term.write(m.data);
        else if (m.type === 'exit') {
          term.writeln('\r\n\x1b[33m[터미널이 종료되었습니다]\x1b[0m');
          setDisconnected(true);
        }
      };
      ws.onclose = () => setDisconnected(true);
      ws.onerror = () => setDisconnected(true);
    }
    reconnectRef.current = connect;
    connect();

    const onData = term.onData((d) => send({ type: 'input', data: d }));
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fit.fit();
        send({ type: 'resize', cols: term.cols, rows: term.rows });
      }, 100);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      onData.dispose();
      ws?.close();
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal-wrap">
      <div className="terminal-host" ref={hostRef} />
      {disconnected ? (
        <div className="terminal-overlay">
          <span>연결이 끊겼어요.</span>
          <button type="button" onClick={() => reconnectRef.current()}>재시작</button>
        </div>
      ) : null}
    </div>
  );
}
