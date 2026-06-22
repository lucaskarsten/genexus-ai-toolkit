// Log bus: intercepts process.stderr writes, maintains a ring buffer, and emits
// events so the SSE endpoint can stream logs to the browser in real time.
// Activates as a side-effect when this module is first imported (by server.ts).

import { EventEmitter } from 'events';

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}

const MAX_BUFFER = 200;
export const logBuffer: LogEntry[] = [];
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(100);

function classify(raw: string): LogEntry['level'] {
  const m = raw.toLowerCase();
  if (m.includes('[error]') || m.includes('error:') || m.includes('[fail]')) return 'error';
  if (m.includes('[warn]') || m.includes('warning:')) return 'warn';
  if (m.includes('[debug]') || m.includes('[verbose]')) return 'debug';
  return 'info';
}

function ingest(raw: string): void {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  for (const msg of lines) {
    const entry: LogEntry = { ts: new Date().toISOString(), level: classify(msg), msg };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
    logEmitter.emit('log', entry);
  }
}

const origWrite = process.stderr.write.bind(process.stderr) as typeof process.stderr.write;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.stderr as any).write = function(...args: Parameters<typeof process.stderr.write>): boolean {
  const [chunk] = args;
  ingest(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk ?? ''));
  return origWrite(...args);
};
