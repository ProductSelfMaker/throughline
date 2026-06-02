// src/web/Sidebar.tsx
// Left shell. Brand only for now — conversation search / new-chat / history are
// omitted until there's multi-conversation backing (single conversation today).
// Collapse is handled by App (it unmounts this when collapsed); the toggle lives
// in the chat header.
export function Sidebar() {
  return (
    <aside className="tl-region tl-sidebar">
      <div className="tl-side-top">
        <div className="tl-brand">Throughline</div>
      </div>
      <div className="tl-side-scroll" />
    </aside>
  );
}
