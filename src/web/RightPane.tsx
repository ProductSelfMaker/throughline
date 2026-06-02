// src/web/RightPane.tsx
// The view panel (cards region) to the left of the rail. Renders one of the
// three views. 문서 shows the live spec the background scribe maintains; 플로우
// is intentionally blank for now; 프리뷰 is the browser-style preview.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PreviewView } from './PreviewView';
import { Icons } from './icons';
import type { ViewId } from './ViewRail';

function DocView({ md }: { md: string }) {
  return (
    <>
      <div className="tl-view-head">
        <span className="tl-view-name">{Icons.doc}문서</span>
        <span className="sp" />
        <span className="tl-sync"><span className="pulse" />자동 동기화됨</span>
      </div>
      <div className="tl-doc">
        <div className="tl-doc-inner">
          <div className="tl-doc-kicker">스펙 · 자동 생성</div>
          {md.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
          ) : (
            <p className="tl-doc-empty">대화를 시작하면 스펙이 여기에 자동으로 정리됩니다.</p>
          )}
        </div>
      </div>
    </>
  );
}

function FlowEmpty() {
  return (
    <>
      <div className="tl-view-head">
        <span className="tl-view-name">{Icons.flow}플로우</span>
        <span className="sp" />
      </div>
      <div className="tl-flow-empty" />
    </>
  );
}

export function RightPane({
  activeView,
  md,
  splitWidth,
}: {
  activeView: ViewId;
  md: string;
  splitWidth: number;
}) {
  return (
    <section className="tl-region tl-view" style={{ flexBasis: `${splitWidth}%` }}>
      {activeView === 'doc' ? <DocView md={md} /> : null}
      {activeView === 'flow' ? <FlowEmpty /> : null}
      {activeView === 'preview' ? <PreviewView /> : null}
    </section>
  );
}
