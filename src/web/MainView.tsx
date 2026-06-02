// src/web/MainView.tsx
// Primary region: wordmark on top (no header bar), then the active view.
// 문서 renders the live PRD; the other views are placeholders for now.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ViewId } from './ViewRail';

/** Drop a leading YAML frontmatter block so it doesn't render as a stray heading. */
function stripFrontmatter(md: string): string {
  const m = /^\s*---\n[\s\S]*?\n---\s*\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

const PLACEHOLDER: Record<ViewId, string> = {
  doc: '',
  history: '히스토리는 곧 제공됩니다.',
  decisions: '의사결정 흐름은 곧 제공됩니다.',
  tokens: '토큰 사용량 분석은 곧 제공됩니다.',
  mockup: '목업 생성은 곧 제공됩니다.',
};

export function MainView({ activeView, md }: { activeView: ViewId; md: string }) {
  return (
    <section className="tl-region tl-main">
      <div className="tl-toprow"><span className="wm">Throughline</span></div>
      {activeView === 'doc' ? (
        <div className="tl-doc">
          <div className="tl-doc-inner">
            <div className="tl-kicker">PRD · 자동 생성</div>
            {md.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(md)}</ReactMarkdown>
            ) : (
              <p className="tl-placeholder">터미널에서 작업을 시작하면 PRD가 여기에 자동으로 쌓입니다.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="tl-placeholder-wrap"><p className="tl-placeholder">{PLACEHOLDER[activeView]}</p></div>
      )}
    </section>
  );
}
