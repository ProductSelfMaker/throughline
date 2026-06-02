// src/web/Sidebar.tsx
// Grok-style left shell. Collapsible; body is intentionally empty for now
// (conversation list / spaces are deferred — see SP-D spec §7). The collapse
// toggle lives in App so it stays clickable when this panel is collapsed; the
// brand keeps the service name (no logo mark) offset to clear that toggle.
export function Sidebar({ open }: { open: boolean }) {
  return (
    <aside className={`sidebar ${open ? '' : 'collapsed'}`} aria-hidden={!open}>
      <div className="sidebar-brand">Throughline</div>
      <div className="sidebar-body" />
    </aside>
  );
}
