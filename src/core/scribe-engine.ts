// src/core/scribe-engine.ts
import { EventEmitter } from 'node:events';
import { AgentRunner, Message, ScribeResult } from '../domain/types';
import { validateSpec } from '../domain/spec-structure';
import { ensureFeatureIds } from '../domain/spec-doc';
import { changedLineNumbers } from '../domain/spec-diff';
import { SpecStore } from './spec-store';

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

    const validation = validateSpec(raw);
    if (!validation.ok) {
      this.emit('rejected', validation.errors);
      return null;
    }

    const md = ensureFeatureIds(raw);
    const changedLines = changedLineNumbers(current, md);
    await this.store.write(md);

    const result: ScribeResult = { md, changedLines };
    this.emit('updated', result);
    return result;
  }
}
