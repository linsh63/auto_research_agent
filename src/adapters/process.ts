import { spawn } from "node:child_process";

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
}

export async function runProcess(
  program: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number; maxOutputBytes?: number; signal?:AbortSignal; onStdout?:(chunk:string)=>void; onStderr?:(chunk:string)=>void },
): Promise<ProcessOutput> {
  const start = Date.now();
  const maxBytes = options.maxOutputBytes ?? 2_000_000;
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const stop = () => {
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      } else child.kill("SIGKILL");
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
    const onAbort=()=>{cancelled=true;stop();};
    if(options.signal?.aborted)onAbort();else options.signal?.addEventListener("abort",onAbort,{once:true});
    child.stdout.on("data", (chunk: Buffer) => {
      const text=chunk.toString();stdout += text;options.onStdout?.(text);
      if (Buffer.byteLength(stdout) > maxBytes) { stderr += "\nOutput limit exceeded"; stop(); }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text=chunk.toString();stderr += text;options.onStderr?.(text);
      if (Buffer.byteLength(stderr) > maxBytes) stop();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort",onAbort);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort",onAbort);
      resolve({ stdout: stdout.slice(0, maxBytes), stderr: stderr.slice(0, maxBytes), exitCode, timedOut, cancelled, durationMs: Date.now() - start });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin ?? "");
  });
}

export function restrictedExperimentEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const allowed = ["PATH", "LANG", "LC_ALL", "PYTHONPATH", "PYTHONUNBUFFERED", "TMPDIR"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  for (const [key, value] of Object.entries(extra)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key)) throw new Error(`Secret-like experiment environment variable blocked: ${key}`);
    env[key] = value;
  }
  return env;
}
