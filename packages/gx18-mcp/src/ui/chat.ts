// Chat via Claude Code CLI. Spawns `claude --print <message> --output-format stream-json`
// and parses the JSONL output to stream events back to the browser. Conversation context
// is maintained by Claude Code's own session system via --resume <session_id>.

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type http from 'http';
import { loadConfig, detectChatConfig, CLAUDE_MODELS, EFFORT_LEVELS } from '../config';

export type ChatUsage = { inputTokens?: number; outputTokens?: number };

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: string; isError: boolean }
  | { type: 'done'; fullText: string; sessionId: string | null; usage?: ChatUsage; costUsd?: number; model?: string }
  | { type: 'error'; message: string };

export async function streamChat(
  userMessage: string,
  sessionId: string | null,
  model: string | undefined,
  effort: string | undefined,
  _readonly: boolean,
  res: http.ServerResponse,
  signal?: AbortSignal,
  serverPort?: number,
): Promise<void> {
  const cfg = loadConfig();
  const detected = detectChatConfig(cfg.chat);

  const claudeBin = cfg.chat?.claudeCliPath?.trim() || detected.claudeCliPath;
  const projectRoot = cfg.chat?.projectRoot?.trim() || detected.projectRoot;

  const args = [
    '--print', userMessage,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ];

  // Model: only pass a known id (fall back to whatever the saved config has, then CLI default).
  const wantModel = (model ?? cfg.chat?.model ?? '').trim();
  const selectedModel = CLAUDE_MODELS.find((m) => m.id === wantModel);
  if (selectedModel) args.push('--model', selectedModel.id);

  // Effort: only when the chosen model supports it and the level is valid.
  if (selectedModel?.supportsEffort) {
    const wantEffort = (effort ?? cfg.chat?.effort ?? '').trim();
    if ((EFFORT_LEVELS as readonly string[]).includes(wantEffort)) {
      args.push('--effort', wantEffort);
    }
  }

  // nexa skills: use saved override if set, else use detected path when it exists
  const nexaDir = cfg.chat?.nexaSkillsDir !== undefined
    ? cfg.chat.nexaSkillsDir                    // empty string = disabled
    : (detected.nexaExists ? detected.nexaSkillsDir : '');
  if (nexaDir) args.push('--add-dir', nexaDir);

  // extra add-dirs from config
  for (const d of cfg.chat?.addDirs ?? []) { if (d.trim()) args.push('--add-dir', d.trim()); }

  if (sessionId) args.push('--resume', sessionId);

  // Generate a temp MCP config so the subprocess reuses THIS running server
  // instead of spawning a fresh gx18-mcp (which would cold-start the C# worker).
  let tempMcpConfig: string | null = null;
  if (serverPort) {
    tempMcpConfig = join(tmpdir(), `gx18-chat-mcp-${Date.now()}.json`);
    const mcpCfg = {
      mcpServers: {
        gx18: { type: 'http', url: `http://127.0.0.1:${serverPort}/mcp` },
        gxnext: { type: 'http', url: 'http://localhost:8001/mcp' },
      },
    };
    try { writeFileSync(tempMcpConfig, JSON.stringify(mcpCfg, null, 2)); }
    catch { tempMcpConfig = null; }
    if (tempMcpConfig) args.push('--mcp-config', tempMcpConfig);
  }

  function send(event: ChatEvent): void {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
  }

  return new Promise((resolve) => {
    const proc = spawn(claudeBin, args, {
      env: { ...process.env },
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    signal?.addEventListener('abort', () => { try { proc.kill(); } catch { /* ignore */ } });

    let buf = '';
    let fullText = '';
    let newSessionId: string | null = sessionId;
    let usage: ChatUsage | undefined;
    let costUsd: number | undefined;
    let usedModel: string | undefined = selectedModel?.id;
    let sawPartialText = false;  // when partial streaming works, ignore the aggregated assistant block

    proc.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const raw = line.trim();
        if (!raw) continue;

        let ev: Record<string, unknown>;
        try { ev = JSON.parse(raw); } catch {
          // Not JSON — treat as plain text delta (e.g. during startup)
          send({ type: 'delta', text: raw + '\n' });
          fullText += raw + '\n';
          continue;
        }

        const t = ev['type'] as string | undefined;

        if (t === 'stream_event') {
          // --include-partial-messages: real token-by-token deltas.
          const se = ev['event'] as Record<string, unknown> | undefined;
          const seType = se?.['type'] as string | undefined;
          if (seType === 'content_block_delta') {
            const delta = se?.['delta'] as Record<string, unknown> | undefined;
            if (delta?.['type'] === 'text_delta') {
              const text = String(delta['text'] ?? '');
              if (text) {
                sawPartialText = true;
                send({ type: 'delta', text });
                fullText += text;
              }
            }
          }
        } else if (t === 'assistant') {
          // stream-json: assistant turn with content blocks. When partial streaming
          // already delivered the text, skip re-emitting it (avoids duplication);
          // still surface tool_use blocks, which partial events don't carry as text.
          const msg = ev['message'] as { content?: Array<Record<string, unknown>> } | undefined;
          for (const block of (msg?.content ?? [])) {
            if (block['type'] === 'text') {
              if (sawPartialText) continue;
              const text = String(block['text'] ?? '');
              send({ type: 'delta', text });
              fullText += text;
            } else if (block['type'] === 'tool_use') {
              send({ type: 'tool_call', id: String(block['id'] ?? ''), name: String(block['name'] ?? ''), args: block['input'] ?? {} });
            }
          }
        } else if (t === 'tool_result') {
          // Top-level tool_result event (some Claude Code versions)
          const content = ev['content'];
          const result = typeof content === 'string' ? content : JSON.stringify(content ?? '');
          send({ type: 'tool_result', id: String(ev['tool_use_id'] ?? ''), name: '', result, isError: !!ev['is_error'] });
        } else if (t === 'user') {
          // Tool results are embedded in the user turn in stream-json format
          const msg = ev['message'] as { content?: Array<Record<string, unknown>> } | undefined;
          for (const block of (msg?.content ?? [])) {
            if (block['type'] === 'tool_result') {
              const content = block['content'];
              const result = typeof content === 'string' ? content
                : Array.isArray(content) ? (content as Array<Record<string,unknown>>).map(c => c['text'] ?? '').join('\n')
                : JSON.stringify(content ?? '');
              send({ type: 'tool_result', id: String(block['tool_use_id'] ?? ''), name: '', result: String(result), isError: !!block['is_error'] });
            }
          }
        } else if (t === 'result') {
          // Final result event: contains session_id, usage, cost, and the model used.
          const sid = ev['session_id'];
          if (typeof sid === 'string') newSessionId = sid;
          const u = ev['usage'] as Record<string, unknown> | undefined;
          if (u) {
            usage = {
              inputTokens: typeof u['input_tokens'] === 'number' ? u['input_tokens'] as number : undefined,
              outputTokens: typeof u['output_tokens'] === 'number' ? u['output_tokens'] as number : undefined,
            };
          }
          if (typeof ev['total_cost_usd'] === 'number') costUsd = ev['total_cost_usd'] as number;
          if (typeof ev['model'] === 'string') usedModel = ev['model'] as string;
        } else if (t === 'text') {
          // Older / simpler text event format
          const text = String(ev['text'] ?? '');
          send({ type: 'delta', text });
          fullText += text;
        }
        // Ignore: system, debug, user, etc.
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      // Route to our log bus (intercepted by log-bus.ts)
      process.stderr.write(`[gx18-chat] ${chunk.toString()}`);
    });

    proc.on('close', () => {
      if (tempMcpConfig) { try { unlinkSync(tempMcpConfig); } catch { /* ignore */ } }
      send({ type: 'done', fullText, sessionId: newSessionId, usage, costUsd, model: usedModel });
      resolve();
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      const hint = err.code === 'ENOENT'
        ? "'claude' not found in PATH. Make sure Claude Code CLI is installed (npm i -g @anthropic-ai/claude-code)."
        : err.message;
      send({ type: 'error', message: hint });
      resolve();
    });
  });
}
