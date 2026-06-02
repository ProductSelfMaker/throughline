// src/agent/fake-runner.ts
import { AgentRunner, Message } from '../domain/types';

type ScribeReply = string | ((cur: string, transcript: Message[]) => string);
type CompleteReply = string | ((prompt: string) => string);

export class FakeAgentRunner implements AgentRunner {
  constructor(private opts: { scribeReply?: ScribeReply; completeReply?: CompleteReply } = {}) {}

  async scribe(cur: string, transcript: Message[]): Promise<string> {
    const r = this.opts.scribeReply ?? cur;
    return typeof r === 'function' ? r(cur, transcript) : r;
  }

  async complete(prompt: string): Promise<string> {
    const r = this.opts.completeReply ?? '';
    return typeof r === 'function' ? r(prompt) : r;
  }
}
