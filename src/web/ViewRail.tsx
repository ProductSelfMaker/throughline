// src/web/ViewRail.tsx
// Far-right icon rail. Clicking an icon toggles its view panel open/closed.
import type { ReactElement } from 'react';
import { Icons } from './icons';

export type ViewId = 'doc' | 'flow' | 'preview';

const VIEWS: { id: ViewId; label: string; icon: ReactElement }[] = [
  { id: 'doc', label: '문서', icon: Icons.doc },
  { id: 'flow', label: '플로우', icon: Icons.flow },
  { id: 'preview', label: '프리뷰', icon: Icons.preview },
];

export function ViewRail({
  active,
  onToggle,
}: {
  active: ViewId | null;
  onToggle: (v: ViewId) => void;
}) {
  return (
    <nav className="tl-region tl-rail" aria-label="뷰">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={'tl-rail-btn' + (active === v.id ? ' active' : '')}
          aria-pressed={active === v.id}
          title={v.label}
          aria-label={v.label}
          onClick={() => onToggle(v.id)}
        >
          {v.icon}
        </button>
      ))}
    </nav>
  );
}
