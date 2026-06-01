// src/core/scribe-engine.ts
import { EventEmitter } from 'node:events';
import { AgentRunner, Message, ScribeResult } from '../domain/types';
import { SpecStore } from './spec-store';
import { applySpecUpdate } from './apply-spec-update';

/**
 * Emits 'updated' (ScribeResult) on success, 'rejected' (string[]) when the agent
 * output is invalid OR the runner throws. runNow never throws — it returns null on
 * any failure, keeping the existing spec.md untouched.
 */
export class ScribeEngine extends EventEmitter {
  constructor(
    private store: SpecStore,
    private runner: AgentRunner,
  ) {
    super();
  }

  async runNow(transcript: Message[], signal?: AbortSignal): Promise<ScribeResult | null> {
    const current = await this.store.read();

    let raw: string;
    try {
      raw = await this.runner.scribe(current, transcript, signal);
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
