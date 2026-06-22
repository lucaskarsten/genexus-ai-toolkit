import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { loadConfig } from '../config';
import { WorkerRequest, WorkerResponse } from './protocol';

interface Pending {
  resolve: (r: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

class SdkBridge {
  private worker: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private restarts = 0;
  private readonly MAX_RESTARTS = 3;
  private lineBuffer = '';
  private starting: Promise<void> | null = null;

  async send<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    await this.ensureStarted();
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer });
      const req: WorkerRequest = { id, method, params };
      this.worker!.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.worker && this.worker.exitCode === null) return;
    if (this.starting) return this.starting;
    this.starting = this.start().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async start(): Promise<void> {
    const config = loadConfig();
    if (!fs.existsSync(config.workerExe)) {
      throw new Error(
        `Worker not found: ${config.workerExe}\n` +
        `Run: npm run build:worker`
      );
    }

    this.worker = spawn(config.workerExe, [], {
      env: {
        ...process.env,
        GX_KB_PATH: config.kbPath,
        GX_KB_SERVER: config.kbServer,
        GX_KB_DATABASE: config.kbDatabase,
        GX18_INSTALL_DIR: config.gx18Dir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.worker.stdout!.on('data', (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split('\n');
      this.lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp: WorkerResponse = JSON.parse(line);
          const pending = this.pending.get(resp.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(resp.id);
            if (resp.error) pending.reject(new Error(resp.error));
            else pending.resolve(resp.result);
          }
        } catch {
          // ignore malformed line
        }
      }
    });

    this.worker.stderr!.on('data', (chunk: Buffer) => {
      process.stderr.write(`[gx18-worker] ${chunk.toString()}`);
    });

    this.worker.on('exit', (code) => {
      process.stderr.write(`[gx18-bridge] Worker exited (code ${code})\n`);
      // Reject all pending requests
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Worker exited (code ${code})`));
        this.pending.delete(id);
      }
      this.worker = null;
      if (this.restarts < this.MAX_RESTARTS) {
        this.restarts++;
        process.stderr.write(`[gx18-bridge] Restarting worker (attempt ${this.restarts}/${this.MAX_RESTARTS})\n`);
      }
    });

    // Wait for ping to confirm worker is ready (15s timeout for startup)
    await this.send('ping', {}, 15000);
    this.restarts = 0;
  }

  async shutdown(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.send('shutdown', {}, 3000);
    } catch {
      // best-effort
    }
    await new Promise<void>(resolve => setTimeout(resolve, 2000));
    this.worker?.kill();
  }
}

export const bridge = new SdkBridge();

// Graceful shutdown on process signals
process.on('SIGTERM', () => { bridge.shutdown().finally(() => process.exit(0)); });
process.on('SIGINT', () => { bridge.shutdown().finally(() => process.exit(0)); });
