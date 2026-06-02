// src/web/ResizableDivider.tsx
import { useEffect, useRef } from 'react';

/** Drag handle (grip) in the gutter between chat + view. Reports the desired
 *  RIGHT-pane (view) width as a percentage of the window. */
export function ResizableDivider({
  onResize,
}: {
  onResize: (rightPercent: number) => void;
}) {
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const rightPercent = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      onResize(rightPercent);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize]);

  return (
    <div
      className="tl-divider"
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
    >
      <span className="tl-grip"><i /><i /><i /></span>
    </div>
  );
}
