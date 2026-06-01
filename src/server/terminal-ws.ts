// src/server/terminal-ws.ts
import type { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { TerminalSession } from './terminal-session';

/** Parse a client message and dispatch to the session. Tolerates malformed input. */
export function handleTerminalMessage(session: TerminalSession, raw: string): void {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg?.type === 'input' && typeof msg.data === 'string') session.write(msg.data);
  else if (msg?.type === 'resize' && msg.cols > 0 && msg.rows > 0) session.resize(msg.cols, msg.rows);
}

/**
 * Register GET /ws/terminal on `app`. `getTerminal` lazily provides the singleton
 * TerminalSession. Returns the injectWebSocket fn to attach to the node server.
 */
export function setupTerminalWs(app: Hono, getTerminal: () => TerminalSession) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.get(
    '/ws/terminal',
    upgradeWebSocket(() => {
      const session = getTerminal();
      let unsub = () => {};
      return {
        onOpen(_evt, ws) {
          ws.send(JSON.stringify({ type: 'data', data: session.snapshot() }));
          if (session.isExited) {
            ws.send(JSON.stringify({ type: 'exit' }));
            return;
          }
          const unsubData = session.subscribe((d) => ws.send(JSON.stringify({ type: 'data', data: d })));
          const unsubExit = session.onExit(() => ws.send(JSON.stringify({ type: 'exit' })));
          unsub = () => { unsubData(); unsubExit(); };
        },
        onMessage(evt) {
          handleTerminalMessage(session, evt.data.toString());
        },
        onClose() {
          unsub();
        },
      };
    }),
  );

  return injectWebSocket;
}
