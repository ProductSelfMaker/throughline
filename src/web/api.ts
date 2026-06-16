// src/web/api.ts
import type { Analytics, WorkItem, WorkItemDetail, DecisionItem, Freshness } from '../domain/types';

export type SpecUpdate = { md: string; changedLines: number[] };
export type { Analytics, WorkItem, WorkItemDetail, DecisionItem, Freshness };
/** Token analytics: the observed project's coding usage + Throughline's own usage. */
export type AnalyticsResponse = { project: Analytics; self: Analytics | null };

/** Recent work items (history cards). */
export async function fetchWorkItems(limit = 100): Promise<WorkItem[]> {
  const res = await fetch(`/api/history?limit=${limit}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: WorkItem[] };
  return data.items ?? [];
}

/** Full conversation/work for one history card. */
export async function fetchWorkItemDetail(item: WorkItem): Promise<WorkItemDetail | null> {
  const q = `file=${encodeURIComponent(item.file)}&start=${item.start}&end=${item.end}`;
  const res = await fetch(`/api/history/item?${q}`);
  if (!res.ok) return null;
  return (await res.json()) as WorkItemDetail;
}

/** Which project directory this instance is observing. */
export async function fetchInfo(): Promise<{ cwd: string; display: string }> {
  const res = await fetch('/api/info');
  if (!res.ok) return { cwd: '', display: '' };
  const data = (await res.json()) as { cwd?: string; display?: string };
  return { cwd: data.cwd ?? '', display: data.display ?? '' };
}

/** Live token analytics for the observed project (+ Throughline overhead). */
export async function fetchAnalytics(): Promise<AnalyticsResponse> {
  const res = await fetch('/api/analytics');
  if (!res.ok) throw new Error(`analytics failed (${res.status})`);
  return res.json();
}

// ── One shared SSE connection ──────────────────────────────────────────────
// All subscriptions multiplex over a single EventSource. Opening one per
// subscription hit the browser's 6-connections-per-origin cap (HTTP/1.1): with
// the long-lived SSE streams saturating the pool, later POSTs (e.g. a Rebuild)
// would queue forever. A single shared stream removes that ceiling.
//
// Snapshot events the server sends once on connect (spec-updated, status, jobs)
// are cached and replayed to subscribers that attach after the initial burst, so
// late mounters still get the current state. Delta events (job-updated,
// chat-message, decisions-updated, workspace-changed) are never replayed.
const REPLAY = new Set(['spec-updated', 'status', 'jobs', 'live-changed']);
let _es: EventSource | null = null;
const _subs = new Map<string, Set<(d: unknown) => void>>();
const _last = new Map<string, unknown>();

function on(event: string, cb: (d: unknown) => void): () => void {
  if (!_es) _es = new EventSource('/api/events');
  let set = _subs.get(event);
  if (!set) {
    set = new Set();
    _subs.set(event, set);
    _es.addEventListener(event, (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (REPLAY.has(event)) _last.set(event, data);
      _subs.get(event)!.forEach((fn) => fn(data));
    });
  }
  set.add(cb);
  if (REPLAY.has(event) && _last.has(event)) cb(_last.get(event)); // replay snapshot to late subscribers
  return () => set!.delete(cb);
}

/** Subscribe to live PRD updates over SSE. */
export function subscribeSpec(onSpec: (u: SpecUpdate) => void): () => void {
  return on('spec-updated', (d) => onSpec(d as SpecUpdate));
}

/** Subscribe to the "AI is working" status (SSE 'status'). */
export function subscribeStatus(onStatus: (working: boolean) => void): () => void {
  return on('status', (d) => onStatus(!!(d as { working?: boolean }).working));
}

/** Send a curation instruction to the scribe (it edits the PRD; changes arrive via SSE). */
export async function curate(instruction: string): Promise<void> {
  const res = await fetch('/api/curate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
  if (!res.ok) throw new Error(`curate failed (${res.status})`);
}

/** One turn of the scribe conversation. */
export type ChatMsg = { role: 'user' | 'assistant'; text: string };

/** Send the whole thread to the conversational scribe; get its reply back. It may also
 *  edit the document (changes arrive via SSE 'spec-updated'). */
export async function chat(messages: ChatMsg[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`chat failed (${res.status})`);
  const data = (await res.json()) as { reply?: string };
  return data.reply ?? '';
}

/** Subscribe to assistant messages the server pushes into the chat (e.g. Tidy/Merge
 *  confirmations) over SSE 'chat-message'. */
export function subscribeChatMessage(onMessage: (text: string) => void): () => void {
  return on('chat-message', (d) => {
    const { text } = d as { text?: string };
    if (text) onMessage(text);
  });
}

/** A user-triggered rebuild that runs as a background job (survives navigation). */
export type JobKind = 'doc' | 'decisions' | 'mockup' | 'architecture' | 'tidy';
export type JobStatus = 'running' | 'done' | 'error';

/** Start a per-page rebuild job. The work runs server-side to completion even if the
 *  page is left or reloaded; progress arrives via subscribeJobs. */
export async function startJob(kind: JobKind): Promise<{ started: boolean; running: JobKind[] }> {
  const res = await fetch(`/api/jobs/${kind}`, { method: 'POST' });
  if (!res.ok) throw new Error(`job ${kind} failed (${res.status})`);
  return res.json();
}

/** Subscribe to background-job lifecycle: the initial in-flight set ('jobs') + per-job
 *  deltas ('job-updated'). Used for busy state and completion toasts. */
export function subscribeJobs(
  onInitial: (running: JobKind[]) => void,
  onUpdate: (kind: JobKind, status: JobStatus) => void,
): () => void {
  const offInitial = on('jobs', (d) => onInitial(((d as { running?: JobKind[] }).running ?? []) as JobKind[]));
  const offUpdate = on('job-updated', (d) => {
    const { kind, status } = d as { kind: JobKind; status: JobStatus };
    onUpdate(kind, status);
  });
  return () => { offInitial(); offUpdate(); };
}

/** The cached decisions ledger + whether a background refresh was started. */
export async function fetchDecisions(): Promise<{ items: DecisionItem[]; refreshing: boolean }> {
  const res = await fetch('/api/decisions');
  if (!res.ok) return { items: [], refreshing: false };
  const data = (await res.json()) as { items?: DecisionItem[]; refreshing?: boolean };
  return { items: data.items ?? [], refreshing: data.refreshing ?? false };
}

/** Subscribe to background decisions-ledger updates (SSE 'decisions-updated'). */
export function subscribeDecisions(onUpdate: (items: DecisionItem[]) => void): () => void {
  return on('decisions-updated', (d) => onUpdate((d as { items?: DecisionItem[] }).items ?? []));
}

/** The latest generated mockup HTML ('' if none). */
export async function fetchMockup(): Promise<string> {
  const res = await fetch('/api/mockup');
  if (!res.ok) return '';
  const data = (await res.json()) as { html?: string };
  return data.html ?? '';
}

/** The architecture doc + its freshness (which sections may be stale). */
export async function fetchArchitecture(): Promise<{ md: string; freshness: Freshness | null }> {
  const res = await fetch('/api/architecture');
  if (!res.ok) return { md: '', freshness: null };
  const data = (await res.json()) as { md?: string; freshness?: Freshness | null };
  return { md: data.md ?? '', freshness: data.freshness ?? null };
}

/** Product-doc freshness — which sections' cited files changed since the last Rebuild (null if none). */
export async function fetchDocFreshness(): Promise<Freshness | null> {
  const res = await fetch('/api/doc-freshness');
  if (!res.ok) return null;
  return (await res.json()) as Freshness | null;
}

/** A workspace: a named bucket of work. The active one captures new activity. */
export interface WorkspaceInfo { id: string; name: string; isDefault: boolean }

export async function fetchWorkspaces(): Promise<{ active: string; workspaces: WorkspaceInfo[] }> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) return { active: 'default', workspaces: [] };
  return res.json();
}
export async function createWorkspace(name: string): Promise<WorkspaceInfo> {
  const res = await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(`create workspace failed (${res.status})`);
  return res.json();
}
export async function selectWorkspace(id: string): Promise<void> {
  await fetch(`/api/workspaces/${id}/select`, { method: 'POST' });
}
export async function deleteWorkspace(id: string): Promise<void> {
  await fetch(`/api/workspaces/${id}/delete`, { method: 'POST' });
}

/** Unified merge of all workspaces + chat conflict resolution. */
export interface Conflict { id: string; question: string }
export interface Unified { md: string; conflicts: Conflict[] }
export async function mergeUnified(): Promise<Unified> {
  const res = await fetch('/api/unified/merge', { method: 'POST' });
  if (!res.ok) throw new Error(`merge failed (${res.status})`);
  return res.json();
}
export async function resolveConflict(id: string, answer: string): Promise<Unified> {
  const res = await fetch('/api/unified/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, answer }) });
  if (!res.ok) throw new Error(`resolve failed (${res.status})`);
  return res.json();
}
/** Apply the unified doc as the default workspace's document ("final integration"). */
export async function applyUnified(): Promise<void> {
  const res = await fetch('/api/unified/apply', { method: 'POST' });
  if (!res.ok) throw new Error(`apply failed (${res.status})`);
}
/** Subscribe to active-workspace changes (SSE 'workspace-changed'). */
export function subscribeWorkspace(onChange: (active: WorkspaceInfo) => void): () => void {
  return on('workspace-changed', (d) => onChange(d as WorkspaceInfo));
}

/** Continuous-ingest ("Live") state. When off, leaving Throughline open costs no tokens. */
export function subscribeLive(onChange: (live: boolean) => void): () => void {
  return on('live-changed', (d) => onChange(!!(d as { live?: boolean }).live));
}
export async function setLive(on: boolean): Promise<void> {
  await fetch('/api/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) });
}

