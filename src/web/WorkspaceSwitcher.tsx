// src/web/WorkspaceSwitcher.tsx
// Top-bar workspace picker: shows the active workspace, lets you switch or create one.
// Selecting routes future activity to that workspace (server-side); the app remounts the
// view (App keys on 'workspace-changed') so per-workspace content refetches.
import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaces, createWorkspace, selectWorkspace, deleteWorkspace, type WorkspaceInfo } from './api';

export function WorkspaceSwitcher({ onActive }: { onActive: (ws: WorkspaceInfo) => void }) {
  const [list, setList] = useState<WorkspaceInfo[]>([]);
  const [activeId, setActiveId] = useState('default');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const reload = () => fetchWorkspaces().then(({ active, workspaces }) => {
    setList(workspaces);
    setActiveId(active);
    const a = workspaces.find((w) => w.id === active);
    if (a) onActive(a);
  }).catch(() => {});

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
  const del = async (e: { stopPropagation: () => void }, w: WorkspaceInfo) => {
    e.stopPropagation();
    if (!window.confirm(`Delete workspace "${w.name}"? Its captured work is removed.`)) return;
    await deleteWorkspace(w.id);
    // if it was active, the server switched to default (workspace-changed → remount); else refresh the list
    if (w.id !== activeId) await reload();
  };
  const openCreate = () => { setOpen(false); setName(''); setCreating(true); };
  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setCreating(false);
    const ws = await createWorkspace(n);
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
            <div key={w.id} className={'tl-ws-row' + (w.id === activeId ? ' active' : '')}>
              <button type="button" className="tl-ws-item" onClick={() => void pick(w.id)}>
                {w.name}{w.isDefault ? ' · all' : ''}
              </button>
              {w.isDefault ? null : (
                <button type="button" className="tl-ws-del" title="Delete workspace" onClick={(e) => void del(e, w)}>×</button>
              )}
            </div>
          ))}
          <div className="tl-ws-sep" />
          <button type="button" className="tl-ws-item tl-ws-new" onClick={openCreate}>+ New workspace</button>
        </div>
      ) : null}

      {creating ? (
        <div className="tl-modal-overlay tl-modal-fixed" onClick={() => setCreating(false)}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tl-modal-title">New workspace</div>
            <p className="tl-modal-body">Name it. Work you do while it&apos;s active is captured here, separate from other workspaces.</p>
            <input
              className="tl-ws-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="e.g. Billing, Auth, Onboarding"
            />
            <div className="tl-modal-actions">
              <button className="tl-btn-ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="tl-btn-solid" type="button" onClick={() => void create()} disabled={!name.trim()}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
