// src/agent/claude-code-runner.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner, Message } from '../domain/types';
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

async function collect(prompt: string, cwd: string | undefined, signal?: AbortSignal): Promise<string> {
  let full = '';
  for await (const msg of query({ prompt, options: { cwd, abortController: abortControllerFor(signal) } })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') full += block.text;
      }
    }
  }
  return full;
}

export class ClaudeCodeRunner implements AgentRunner {
  constructor(private options: { cwd?: string } = {}) {}

  async scribe(currentSpecMarkdown: string, transcript: Message[], signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await collect(buildScribePrompt(currentSpecMarkdown, transcript), this.options.cwd, signal));
  }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await collect(prompt, this.options.cwd, signal));
  }
}
