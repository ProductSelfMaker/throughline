// src/web/WorkspaceSwitcher.tsx
// Top-bar workspace picker: shows the active workspace, lets you switch or create one.
// Selecting routes future activity to that workspace (server-side); the app remounts the
// view (App keys on 'workspace-changed') so per-workspace content refetches.
import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaces, createWorkspace, selectWorkspace, type WorkspaceInfo } from './api';

export function WorkspaceSwitcher({ onActive }: { onActive: (ws: WorkspaceInfo) => void }) {
  const [list, setList] = useState<WorkspaceInfo[]>([]);
  const [activeId, setActiveId] = useState('default');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchWorkspaces().then(({ active, workspaces }) => {
      if (!alive) return;
      setList(workspaces);
      setActiveId(active);
      const a = workspaces.find((w) => w.id === active);
      if (a) onActive(a);
    }).catch(() => {});
    return () => { alive = false; };
  }, [onActive]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = list.find((w) => w.id === activeId);
  const pick = async (id: string) => { setOpen(false); if (id !== activeId) await selectWorkspace(id); };
  const add = async () => {
    const name = window.prompt('New workspace name')?.trim();
    setOpen(false);
    if (!name) return;
    const ws = await createWorkspace(name);
    await selectWorkspace(ws.id);
  };

  return (
    <div className="tl-ws" ref={ref}>
      <button type="button" className="tl-ws-btn" onClick={() => setOpen((v) => !v)} title="Switch workspace">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        {active?.name ?? 'Default'}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="tl-ws-menu">
          {list.map((w) => (
            <button key={w.id} type="button" className={'tl-ws-item' + (w.id === activeId ? ' active' : '')} onClick={() => void pick(w.id)}>
              {w.name}{w.isDefault ? ' · all' : ''}
            </button>
          ))}
          <div className="tl-ws-sep" />
          <button type="button" className="tl-ws-item tl-ws-new" onClick={() => void add()}>+ New workspace</button>
        </div>
      ) : null}
    </div>
  );
}
