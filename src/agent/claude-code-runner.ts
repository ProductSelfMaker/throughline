// src/agent/claude-code-runner.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner, Message, OverheadTokens } from '../domain/types';
import { buildScribePrompt } from '../domain/scribe-prompt';

function abortControllerFor(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

/** Strips a single ```...``` fence if the model wrapped the whole answer in one. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

export class ClaudeCodeRunner implements AgentRunner {
  // Throughline's own token usage, accumulated across this process's runs.
  private used: OverheadTokens = { total: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, turns: 0 };

  constructor(private options: { cwd?: string } = {}) {}

  /** How many tokens Throughline itself has spent through this runner. */
  usage(): OverheadTokens {
    return { ...this.used };
  }

  private async collect(prompt: string, signal?: AbortSignal): Promise<string> {
    let full = '';
    for await (const msg of query({ prompt, options: { cwd: this.options.cwd, abortController: abortControllerFor(signal) } })) {
      if (msg.type === 'assistant') {
        for (const block of msg.message.content) {
          if (block.type === 'text') full += block.text;
        }
        const u = msg.message.usage as Record<string, number> | undefined;
        if (u) {
          const inp = u.input_tokens || 0, out = u.output_tokens || 0;
          const cr = u.cache_read_input_tokens || 0, cc = u.cache_creation_input_tokens || 0;
          this.used.input += inp; this.used.output += out; this.used.cacheRead += cr; this.used.cacheCreate += cc;
          this.used.turns += 1; this.used.total += inp + out + cr + cc;
        }
      }
    }
    return full;
  }

  async scribe(currentSpecMarkdown: string, transcript: Message[], signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await this.collect(buildScribePrompt(currentSpecMarkdown, transcript), signal));
  }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await this.collect(prompt, signal));
  }
}
