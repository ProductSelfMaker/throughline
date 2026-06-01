// src/core/sync-engine.ts
import { EventEmitter } from 'node:events';
import { AgentRunner, ScribeResult } from '../domain/types';
import { SpecStore } from './spec-store';
import { applySpecUpdate } from './apply-spec-update';
import { buildSyncPrompt } from '../domain/sync-prompt';
import type { ActivityReader, ActivityState } from './activity-reader';

/** Reverse-scribe: turns real coding activity into spec.md updates. Emits 'updated' / 'rejected'. */
export class SyncEngine extends EventEmitter {
  private state: ActivityState = { sessionFile: null, byteOffset: 0 };

  constructor(
    private store: SpecStore,
    private runner: AgentRunner,
    private reader: Pick<ActivityReader, 'readActivity'>,
  ) {
    super();
  }

  /** Read the latest activity and reconcile spec.md. Returns null if nothing to do / on failure. */
  async syncNow(signal?: AbortSignal): Promise<ScribeResult | null> {
    const activity = await this.reader.readActivity(this.state);
    this.state = activity.newState;
    if (!activity.hasNew) return null;

    const current = await this.store.read();
    let raw: string;
    try {
      raw = await this.runner.complete(
        buildSyncPrompt(current, activity.transcriptText, activity.gitDiff),
        signal,
      );
    } catch (err) {
      this.emit('rejected', [(err as Error)?.message ?? String(err)]);
      return null;
    }

    const applied = await applySpecUpdate(this.store, raw, current);
    if (!applied.ok) {
      this.emit('rejected', applied.errors);
      return null;
    }
    this.emit('updated', applied.result);
    return applied.result;
  }
}
