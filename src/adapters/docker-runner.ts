import { runProcess, type ProcessOutput } from "./process.js";

export interface DockerRunSpec { image: string; workspace: string; command: string; args: string[]; timeoutMs: number; cpus?: number; memory?: string; gpuDevice?: string; env?: Record<string,string>; readOnlyMounts?: Array<{source:string;target:string}>; }

export function dockerArgs(spec: DockerRunSpec): string[] {
  const args = ["run","--rm","--network","none","--pids-limit","256","--cpus",String(spec.cpus ?? 2),"--memory",spec.memory ?? "8g","--mount",`type=bind,src=${spec.workspace},dst=/work`,"--workdir","/work"];
  if (spec.gpuDevice) args.push("--gpus", `device=${spec.gpuDevice}`);
  for (const mount of spec.readOnlyMounts ?? []) args.push("--mount", `type=bind,src=${mount.source},dst=${mount.target},readonly`);
  for (const [key,value] of Object.entries(spec.env ?? {})) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key)) throw new Error(`Secret-like Docker environment variable blocked: ${key}`);
    args.push("--env", `${key}=${value}`);
  }
  args.push("--entrypoint", spec.command, spec.image, ...spec.args);
  return args;
}

export async function runDockerExperiment(spec: DockerRunSpec): Promise<ProcessOutput> {
  return runProcess("docker", dockerArgs(spec), { timeoutMs: spec.timeoutMs, cwd: spec.workspace });
}
