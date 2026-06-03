// src/web/MockupView.tsx
// Presentational design canvas: shows the generated mockup HTML in a sandboxed
// iframe on a pan + zoom canvas (drag to move, wheel / buttons to zoom).
// Generation is triggered from the top row in MainView; this only renders.
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN = 0.2;
const MAX = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function MockupView({ html, busy }: { html: string | null; busy: boolean }) {
  const vpRef = useRef<HTMLDivElement>(null);
  // x/y = pan in screen px, s = zoom scale. transform = translate(x,y) scale(s).
  const [t, setT] = useState({ x: 24, y: 24, s: 1 });
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // Zoom toward a point (cx,cy is relative to the viewport top-left) so the
  // content under the cursor stays put.
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setT((prev) => {
      const s = clamp(prev.s * factor, MIN, MAX);
      if (s === prev.s) return prev;
      const ratio = s / prev.s;
      return { s, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
    });
  }, []);

  // Drag-to-pan, tracked on the window so it continues off the iframe/viewport.
  useEffect(() => {
    function move(e: MouseEvent) {
      const d = drag.current;
      if (!d) return;
      setT((prev) => ({ ...prev, x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) }));
    }
    function up() { drag.current = null; }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  // Wheel-to-zoom toward the cursor. Native non-passive listener so we can
  // preventDefault (React's onWheel is passive and can't).
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = vp!.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAt, html]);

  const zoomCenter = (factor: number) => () => {
    const r = vpRef.current?.getBoundingClientRect();
    zoomAt((r?.width ?? 0) / 2, (r?.height ?? 0) / 2, factor);
  };
  const reset = () => setT({ x: 24, y: 24, s: 1 });

  if (html === null) {
    return <div className="tl-placeholder-wrap"><p className="tl-placeholder">불러오는 중…</p></div>;
  }
  if (!html) {
    return (
      <div className="tl-placeholder-wrap">
        <p className="tl-placeholder">
          {busy ? '생성 중…' : '상단의 "목업 생성"을 누르면 실제 화면을 그대로 재현한 목업을 캔버스에 펼칩니다.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="tl-canvas-vp"
      ref={vpRef}
      onMouseDown={(e) => { drag.current = { sx: e.clientX, sy: e.clientY, px: t.x, py: t.y }; }}
    >
      <div className="tl-canvas-pan" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
        {/* pointer-events:none so dragging over the iframe still pans the canvas */}
        <iframe className="tl-canvas-frame" sandbox="" srcDoc={html} title="목업" />
      </div>
      <div className="tl-zoom" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={zoomCenter(1 / 1.2)} title="축소">−</button>
        <button type="button" onClick={reset} title="100%로">{Math.round(t.s * 100)}%</button>
        <button type="button" onClick={zoomCenter(1.2)} title="확대">+</button>
      </div>
    </div>
  );
}
