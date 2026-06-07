// src/web/useJobs.ts
// App-level state for background rebuild jobs. Living here (not in a view) is what lets
// busy state survive view changes and a browser reload — it's driven entirely by SSE,
// and the server replays in-flight jobs on (re)connect.
import { useCallback, useEffect, useRef, useState } from 'react';
import { startJob, subscribeJobs, type JobKind, type JobStatus } from './api';

export type Toast = { id: number; text: string; tone: 'ok' | 'err' };

const DONE_TEXT: Record<JobKind, string> = {
  doc: 'Document rebuilt',
  decisions: 'Decisions rebuilt',
  mockup: 'Mockup updated',
  architecture: 'Architecture rebuilt',
  tidy: 'Document tidied',
};
const FAIL_TEXT: Record<JobKind, string> = {
  doc: 'Document rebuild failed',
  decisions: 'Decisions rebuild failed',
  mockup: 'Mockup update failed',
  architecture: 'Architecture rebuild failed',
  tidy: 'Document tidy failed',
};

export type JobsState = {
  /** Kinds currently rebuilding (busy state for the per-page buttons). */
  running: Set<JobKind>;
  /** Kick off a per-page rebuild. */
  start: (kind: JobKind) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  /** Per-kind completion counter — bumps when a job settles (used to refetch results). */
  doneCounts: Record<JobKind, number>;
};

export function useJobs(): JobsState {
  const [running, setRunning] = useState<Set<JobKind>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [doneCounts, setDoneCounts] = useState<Record<JobKind, number>>({ doc: 0, decisions: 0, mockup: 0, architecture: 0, tidy: 0 });
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  useEffect(() => {
    return subscribeJobs(
      (initial) => setRunning(new Set(initial)),
      (kind: JobKind, status: JobStatus) => {
        if (status === 'running') {
          setRunning((s) => new Set(s).add(kind));
          return;
        }
        // done | error: clear busy, bump the completion counter, raise a toast
        setRunning((s) => { const n = new Set(s); n.delete(kind); return n; });
        setDoneCounts((c) => ({ ...c, [kind]: c[kind] + 1 }));
        setToasts((ts) => [...ts, {
          id: nextId.current++,
          text: status === 'done' ? DONE_TEXT[kind] : FAIL_TEXT[kind],
          tone: status === 'done' ? 'ok' : 'err',
        }]);
      },
    );
  }, []);

  const start = useCallback((kind: JobKind) => {
    setRunning((s) => new Set(s).add(kind)); // optimistic; the SSE 'running' confirms
    void startJob(kind).catch(() => {
      setRunning((s) => { const n = new Set(s); n.delete(kind); return n; }); // couldn't even start
    });
  }, []);

  return { running, start, toasts, dismiss, doneCounts };
}
