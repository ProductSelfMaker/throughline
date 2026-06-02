// src/web/MainView.tsx
// Primary region: wordmark + "다시 정리" (reset & rebuild) on top (no header bar);
// then the active view. 문서 renders the live PRD; other views are placeholders.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rebuild } from './api';
import { Icons } from './icons';
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
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doRebuild() {
    setBusy(true);
    try { await rebuild(); } catch { /* SSE reflects the result */ } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <section className="tl-region tl-main">
      <div className="tl-toprow">
        <span className="wm">Throughline</span>
        <span className="sp" />
        <button className="tl-rebtn" type="button" onClick={() => setConfirm(true)} title="최근 기록으로 문서를 새로 정리">
          {Icons.refresh}다시 정리
        </button>
      </div>

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

      {confirm ? (
        <div className="tl-modal-overlay" onClick={() => { if (!busy) setConfirm(false); }}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tl-modal-title">전체 다시 정리</div>
            <p className="tl-modal-body">
              현재 문서 내용이 <b>사라지고</b>, 최근 기록(약 14일)을 다시 분석해 새로 정리합니다. 계속할까요?
            </p>
            <div className="tl-modal-actions">
              <button className="tl-btn-ghost" type="button" disabled={busy} onClick={() => setConfirm(false)}>취소</button>
              <button className="tl-btn-solid" type="button" disabled={busy} onClick={() => void doRebuild()}>
                {busy ? '정리 중…' : '계속'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
