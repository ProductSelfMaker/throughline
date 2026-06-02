// src/web/ViewRail.tsx
// Far-right vertical icon rail. Clicking an icon toggles the view panel that
// opens to its left. Replaces the old top-right ViewToolbar. Icons are
// monochrome line SVGs that inherit the rail's grayscale color via currentColor.
import type { ReactNode } from 'react';

export type ViewId = 'doc' | 'flow' | 'preview';

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

const ICONS: Record<ViewId, ReactNode> = {
  // document / page
  doc: svg(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>,
  ),
  // flow / branching nodes
  flow: svg(
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M6 8.2v2.3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.2" />
      <path d="M12 12.5v3.3" />
    </>,
  ),
  // preview / eye
  preview: svg(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </>,
  ),
};

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'doc', label: '문서' },
  { id: 'flow', label: '플로우' },
  { id: 'preview', label: '프리뷰' },
];

export function ViewRail({
  active,
  onToggle,
}: {
  active: ViewId | null;
  onToggle: (v: ViewId) => void;
}) {
  return (
    <nav className="rail" aria-label="뷰">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`rail-btn ${active === v.id ? 'active' : ''}`}
          aria-pressed={active === v.id}
          title={v.label}
          aria-label={v.label}
          onClick={() => onToggle(v.id)}
        >
          {ICONS[v.id]}
        </button>
      ))}
    </nav>
  );
}
