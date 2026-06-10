// src/server/workspace-manager.ts
// Time/active-scoped workspaces: the user works in the active workspace, and new session
// activity accrues only to it. Each workspace has its own artifacts under .throughline/ws/<id>.
// One shared watcher routes activity to the active workspace's Session; one shared broadcaster
// keeps a single SSE stream across switches.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { Broadcaster } from './broadcaster';
import { ActivityReader } from '../domain/types';
import { Session } from './session';

export interface WorkspaceInfo { id: string; name: string; isDefault: boolean }
interface Registry { active: string; workspaces: { id: string; name: string }[] }

const DEFAULT_ID = 'default';
// artifacts that lived directly in .throughline/ before workspaces — migrated into ws/default.
const LEGACY_FILES = [
  'prd.md', 'decisions.json', 'decisions-state.json', 'decisions.md', 'mockup.html',
  'mockup-flow.json', 'architecture.md', 'architecture-meta.json', 'prd-meta.json', 'ingest-state.json',
];

export interface WorkspaceManagerDeps {
  cwd: string;
  reader: ActivityReader;
  /** Build a Session for a workspace, pointed at its artifacts dir, sharing the broadcaster. */
  makeSession: (opts: { id: string; artifactsDir: string; broadcaster: Broadcaster }) => Session;
}

export class WorkspaceManager {
  readonly broadcaster = new Broadcaster();
  private cwd: string;
  private reader: ActivityReader;
  private makeSession: WorkspaceManagerDeps['makeSession'];
  private registryPath: string;
  private wsRoot: string;
  private registry: Registry = { active: DEFAULT_ID, workspaces: [{ id: DEFAULT_ID, name: 'Default' }] };
  private sessions = new Map<string, Session>();
  private unwatch?: () => void;
  private nextId = 1;

  constructor(deps: WorkspaceManagerDeps) {
    this.cwd = deps.cwd;
    this.reader = deps.reader;
    this.makeSession = deps.makeSession;
    this.registryPath = join(deps.cwd, '.throughline', 'workspaces.json');
    this.wsRoot = join(deps.cwd, '.throughline', 'ws');
  }

  private dir(id: string): string { return join(this.wsRoot, id); }

  async init(): Promise<void> {
    await this.loadOrBootstrap();
    for (const w of this.registry.workspaces) await this.build(w.id, false);
    // single watcher → only the active workspace ingests new activity
    this.unwatch = this.reader.watch(() => this.active().notifyActivity());
  }

  private async loadOrBootstrap(): Promise<void> {
    if (existsSync(this.registryPath)) {
      try {
        const r = JSON.parse(await readFile(this.registryPath, 'utf8')) as Registry;
        if (r?.workspaces?.length) this.registry = r;
      } catch { /* keep the default */ }
      // continue ids past the highest existing wsN
      for (const w of this.registry.workspaces) {
        const m = /^ws(\d+)$/.exec(w.id);
        if (m) this.nextId = Math.max(this.nextId, Number(m[1]) + 1);
      }
      return;
    }
    // first run: create the default workspace + migrate any legacy root artifacts into it
    await mkdir(this.dir(DEFAULT_ID), { recursive: true });
    for (const f of LEGACY_FILES) {
      const src = join(this.cwd, '.throughline', f);
      if (existsSync(src)) { try { await rename(src, join(this.dir(DEFAULT_ID), f)); } catch { /* best-effort */ } }
    }
    await this.save();
  }

  private async build(id: string, fresh: boolean): Promise<Session> {
    const s = this.makeSession({ id, artifactsDir: this.dir(id), broadcaster: this.broadcaster });
    await s.init({ watch: false });
    if (fresh) await s.startFresh();
    this.sessions.set(id, s);
    return s;
  }

  private async save(): Promise<void> {
    await mkdir(join(this.cwd, '.throughline'), { recursive: true });
    await writeFile(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf8');
  }

  /** The Session for the active workspace (all API endpoints operate on this). */
  active(): Session {
    return this.sessions.get(this.registry.active) ?? this.sessions.get(DEFAULT_ID)!;
  }
  activeInfo(): WorkspaceInfo { return this.info(this.registry.active); }
  private info(id: string): WorkspaceInfo {
    const w = this.registry.workspaces.find((x) => x.id === id);
    return { id, name: w?.name ?? id, isDefault: id === DEFAULT_ID };
  }
  list(): WorkspaceInfo[] { return this.registry.workspaces.map((w) => this.info(w.id)); }

  async create(name: string): Promise<WorkspaceInfo> {
    const id = `ws${this.nextId++}`;
    const clean = (name || '').trim().slice(0, 60) || 'Untitled';
    this.registry.workspaces.push({ id, name: clean });
    await this.save();
    await this.build(id, true); // new workspace captures from now
    return this.info(id);
  }

  async select(id: string): Promise<boolean> {
    if (!this.sessions.has(id) || id === this.registry.active) return false;
    this.registry.active = id;
    await this.save();
    const s = this.active();
    await s.startFresh(); // capture-from-now on (re)activation — prior activity went elsewhere
    // re-emit the now-active workspace's state so SSE clients update without a reconnect
    this.broadcaster.broadcast('spec-updated', { md: await s.readSpec(), changedLines: [] });
    this.broadcaster.broadcast('decisions-updated', { items: await s.readDecisions() });
    this.broadcaster.broadcast('workspace-changed', this.activeInfo());
    return true;
  }

  flush(): void { this.active().flush(); }
  stop(): void { this.unwatch?.(); for (const s of this.sessions.values()) s.stop(); }
}
