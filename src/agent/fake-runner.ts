// src/agent/fake-runner.ts
import { AgentRunner, ChatEvent, Message } from '../domain/types';

type ScribeReply = string | ((cur: string, transcript: Message[]) => string);
type CompleteReply = string | ((prompt: string) => string);

export class FakeAgentRunner implements AgentRunner {
  constructor(
    private opts: {
      chatEvents?: ChatEvent[];
      converseReply?: string;
      scribeReply?: ScribeReply;
      completeReply?: CompleteReply;
    } = {},
  ) {}

  async converse(_transcript: Message[], onEvent: (e: ChatEvent) => void): Promise<string> {
    const events = this.opts.chatEvents ?? [];
    for (const e of events) onEvent(e);
    if (this.opts.converseReply !== undefined) return this.opts.converseReply;
    return events
      .filter((e): e is { type: 'text'; text: string } => e.type === 'text')
      .map((e) => e.text)
      .join('');
  }

  async scribe(cur: string, transcript: Message[]): Promise<string> {
    const r = this.opts.scribeReply ?? cur;
    return typeof r === 'function' ? r(cur, transcript) : r;
  }

  async complete(prompt: string): Promise<string> {
    const r = this.opts.completeReply ?? '';
    return typeof r === 'function' ? r(prompt) : r;
  }
}
