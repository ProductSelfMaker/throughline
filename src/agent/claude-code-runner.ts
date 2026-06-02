// src/agent/claude-code-runner.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner, ChatEvent, Message } from '../domain/types';
import { buildScribePrompt } from '../domain/scribe-prompt';

function transcriptToPrompt(transcript: Message[]): string {
  return transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
}

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

function toolTarget(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const v = o.file_path ?? o.path ?? o.command ?? o.pattern ?? o.url;
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  }
  return '';
}

async function streamChat(
  prompt: string,
  cwd: string | undefined,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  let full = '';
  for await (const msg of query({
    prompt,
    options: { cwd, abortController: abortControllerFor(signal) },
  })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          full += block.text;
          onEvent({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          onEvent({ type: 'tool', name: block.name, target: toolTarget(block.input) });
        }
      }
    }
  }
  return full;
}

async function collectAssistantText(
  prompt: string,
  cwd: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  return streamChat(prompt, cwd, () => {}, signal);
}

export class ClaudeCodeRunner implements AgentRunner {
  constructor(private options: { cwd?: string } = {}) {}

  converse(
    transcript: Message[],
    onEvent: (e: ChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    return streamChat(transcriptToPrompt(transcript), this.options.cwd, onEvent, signal);
  }

  async scribe(
    currentSpecMarkdown: string,
    transcript: Message[],
    signal?: AbortSignal,
  ): Promise<string> {
    const text = await collectAssistantText(
      buildScribePrompt(currentSpecMarkdown, transcript),
      this.options.cwd,
      signal,
    );
    return stripCodeFence(text);
  }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    const text = await collectAssistantText(prompt, this.options.cwd, signal);
    return stripCodeFence(text);
  }
}
