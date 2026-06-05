// src/web/Toaster.tsx
// App-level toast stack. Rendered outside the view region so completion toasts persist
// across view changes. Each toast auto-dismisses; click to dismiss early.
import { useEffect } from 'react';
import type { Toast } from './useJobs';

const TTL = 4000;

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TTL);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);
  return (
    <div className={`tl-toast tl-toast-${toast.tone}`} role="status" onClick={() => onDismiss(toast.id)}>
      <span className="tl-toast-dot" />
      {toast.text}
    </div>
  );
}

export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="tl-toaster" aria-live="polite">
      {toasts.map((t) => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
