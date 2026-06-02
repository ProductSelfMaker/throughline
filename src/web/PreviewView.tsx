// src/web/PreviewView.tsx
// Browser-style preview. Empty state = a centered address search (nothing loads
// until submit). On navigate, a chrome bar (back / forward(off) / refresh /
// address) sits above a real iframe loading the entered URL.
import { useState } from 'react';
import { Icons } from './icons';

const URL_KEY = 'throughline.previewUrl';

function looksLocal(u: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1)/i.test(u) || !/\.[a-z]{2,}/i.test(u);
}
function toSrc(t: string): string {
  if (/^https?:\/\//i.test(t)) return t;
  return (looksLocal(t) ? 'http://' : 'https://') + t;
}
function display(u: string): string {
  return u.replace(/^https?:\/\//i, '');
}
function initAddr(): string {
  try {
    const s = localStorage.getItem(URL_KEY);
    return s ? display(s) : '';
  } catch {
    return '';
  }
}

export function PreviewView() {
  const [phase, setPhase] = useState<'empty' | 'site'>('empty');
  const [query, setQuery] = useState(initAddr);
  const [addr, setAddr] = useState(initAddr);
  const [iframeSrc, setIframeSrc] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  function navigate(raw: string) {
    const t = (raw || '').trim();
    if (!t) return;
    const src = toSrc(t);
    setAddr(display(t));
    setIframeSrc(src);
    setReloadKey((k) => k + 1);
    setPhase('site');
    try { localStorage.setItem(URL_KEY, src); } catch { /* ignore */ }
  }

  if (phase === 'empty') {
    return (
      <div className="tl-pv-empty">
        <div className="tl-pv-center">
          <span className="tl-pv-globe">{Icons.globe}</span>
          <div className="tl-pv-h">개발 중인 화면 미리보기</div>
          <form className="tl-pv-search" onSubmit={(e) => { e.preventDefault(); navigate(query); }}>
            <span className="tl-pv-search-ic">{Icons.search}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="주소를 입력하세요 — localhost:3000 또는 웹사이트"
              spellCheck={false}
              aria-label="미리보기 주소"
            />
          </form>
          <div className="tl-pv-quick">
            <button type="button" onClick={() => navigate('localhost:3000')}>localhost:3000</button>
            <button type="button" onClick={() => navigate('localhost:5173')}>localhost:5173</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tl-browser">
        <div className="tl-browser-nav">
          <button className="tl-nav-btn" type="button" title="뒤로" aria-label="뒤로" onClick={() => setPhase('empty')}>{Icons.arrowL}</button>
          <button className="tl-nav-btn is-off" type="button" title="앞으로" aria-label="앞으로" disabled>{Icons.arrowR}</button>
          <button className="tl-nav-btn" type="button" title="새로고침" aria-label="새로고침" onClick={() => setReloadKey((k) => k + 1)}>{Icons.refresh}</button>
        </div>
        <form className="tl-browser-addr" onSubmit={(e) => { e.preventDefault(); navigate(addr); }}>
          <span className="tl-addr-lock">{Icons.lock}</span>
          <input value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false} aria-label="주소" />
        </form>
      </div>
      <div className="tl-pv-body">
        <iframe key={reloadKey} className="tl-preview-frame" src={iframeSrc} title="preview" />
      </div>
    </>
  );
}
