// src/web/RightPane.tsx
// The view panel that opens to the left of the rail. No header — just the body.
// 문서/플로우 are placeholders for now (live spec + mermaid get re-wired later —
// SP-D §7); preview is the simplified view.
import { PreviewView } from './PreviewView';
import type { ViewId } from './ViewRail';

export function RightPane({ activeView }: { activeView: ViewId }) {
  return (
    <section className="view">
      <div className="view-body">
        {activeView === 'doc' ? (
          <p className="placeholder">문서가 여기에 표시됩니다.</p>
        ) : activeView === 'flow' ? (
          <p className="placeholder">유저 플로우가 여기에 표시됩니다.</p>
        ) : (
          <PreviewView />
        )}
      </div>
    </section>
  );
}
