// src/web/icons.tsx — shared monochrome SVG icons (currentColor).
import type { ReactElement } from 'react';

const stroke = (children: ReactElement) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const Icons: Record<string, ReactElement> = {
  doc: stroke(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>),
  history: stroke(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>),
  decisions: stroke(<><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M6 8.2v7.6M8.2 6h4a3.6 3.6 0 0 1 3.6 3.6v.6M8.2 18h4a3.6 3.6 0 0 0 3.6-3.6v-.6" /></>),
  tokens: stroke(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  mockup: stroke(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>),
  architecture: stroke(<><path d="M12 2 3 7l9 5 9-5-9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></>),
  send: stroke(<path d="M12 19V5M5 12l7-7 7 7" />),
  refresh: stroke(<><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v4h-4" /></>),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.6 5.1a4 4 0 0 0 2.6 2.6L21.5 12l-5.1 1.6a4 4 0 0 0-2.6 2.6L12 21.5l-1.6-5.1a4 4 0 0 0-2.6-2.6L2.5 12l5.1-1.6a4 4 0 0 0 2.6-2.6z" /></svg>
  ),
};
