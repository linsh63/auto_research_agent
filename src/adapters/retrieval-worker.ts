import { createInterface } from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface RetrievalRequest { method: string; params?: unknown; deadlineMs?: number; idempotencyKey?: string; }
export interface RetrievalResponse { ok: boolean; result?: unknown; error?: { code: string; message: string }; metrics?: unknown; }

export class RetrievalWorkerClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<string, { resolve: (value: RetrievalResponse) => void; reject: (reason: unknown) => void; timer: NodeJS.Timeout }>();
  private started = false;

  constructor(private readonly options: { projectRoot: string; python?: string; workerPath?: string; skillRoot?: string }) {}

  async start(): Promise<RetrievalResponse> {
    if (this.started) return { ok: true, result: { reused: true } };
    const worker = this.options.workerPath ?? join(this.options.projectRoot, "workers", "retrieval", "worker.py");
    const localPython = join(this.options.projectRoot, "workers", "retrieval", ".venv", "bin", "python");
    const python = this.options.python ?? (existsSync(localPython) ? localPython : "python3");
    this.child = spawn(python, ["-u", worker], {
      cwd: this.options.projectRoot,
      env: { ...process.env, AUTO_RESEARCH_PROJECT_ROOT: this.options.projectRoot, AUTO_RESEARCH_SKILL_ROOT: this.options.skillRoot ?? process.env.AUTO_RESEARCH_SKILL_ROOT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line) as { requestId?: string } & RetrievalResponse;
        if (!message.requestId) return;
        const item = this.pending.get(message.requestId);
        if (!item) return;
        this.pending.delete(message.requestId);
        clearTimeout(item.timer);
        item.resolve(message);
      } catch { /* Protocol diagnostics remain in worker stderr. */ }
    });
    this.child.on("exit", (code, signal) => {
      this.started = false;
      for (const [id, item] of this.pending) {
        clearTimeout(item.timer);
        item.reject(new Error(`Retrieval worker exited (${code ?? "signal " + signal}) while handling ${id}`));
      }
      this.pending.clear();
    });
    this.started = true;
    return this.send({ method: "handshake", params: { schemaVersion: 1 }, deadlineMs: 60_000 });
  }

  async request(request: RetrievalRequest): Promise<RetrievalResponse> {
    if (!this.child || !this.started) await this.start();
    return this.send(request);
  }

  private send(request: RetrievalRequest): Promise<RetrievalResponse> {
    if (!this.child || !this.started) throw new Error("Retrieval worker is not started");
    const requestId = randomUUID();
    const deadlineMs = request.deadlineMs ?? 60_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.child?.kill("SIGKILL");
        this.started = false;
        reject(new Error(`Retrieval request timed out after ${deadlineMs} ms`));
      }, deadlineMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child?.stdin.write(JSON.stringify({ schemaVersion: 1, requestId, ...request }) + "\n");
    });
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.child.kill("SIGTERM");
    this.child = undefined;
    this.started = false;
  }
}
