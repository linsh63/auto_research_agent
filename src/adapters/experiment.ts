import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import type { ExperimentResult, ResearchBrief } from "../core/schema.js";
import { restrictedExperimentEnv, runProcess } from "./process.js";

function parseMetric(stdout: string, metricName: string): number | null {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || !parsed) continue;
      const value = (parsed as Record<string, unknown>)[metricName] ?? (parsed as Record<string, unknown>).metric;
      if (typeof value === "number" && Number.isFinite(value)) return value;
    } catch { /* Log line is not JSON. */ }
  }
  return null;
}

export async function executeExperiment(
  brief: ResearchBrief, variant: "baseline" | "candidate", runDir: string,
): Promise<ExperimentResult> {
  const spec = brief.experiment;
  const command = spec[variant];
  const workspace = resolve(spec.workspace);
  const startedAt = new Date().toISOString();
  mkdirSync(runDir, { recursive: true });
  const firstArg = command.args[0];
  const possibleCodePath = firstArg ? resolve(workspace, firstArg) : null;
  const codePath = possibleCodePath && existsSync(possibleCodePath) ? possibleCodePath : null;
  const codeSha256 = codePath ? createHash("sha256").update(readFileSync(codePath)).digest("hex") : null;
  const codeSnapshotPath = codePath ? join(runDir, `${variant}.source`) : null;
  if (codePath && codeSnapshotPath) copyFileSync(codePath, codeSnapshotPath);
  const env = restrictedExperimentEnv({ ...command.env, RESEARCH_SEED: String(spec.seed) });
  const timeoutMs = brief.limits.maxExperimentSeconds * 1000;
  let program = command.program;
  let args = command.args;
  let cwd = workspace;
  if (spec.execution === "docker") {
    if (!spec.dockerImage) throw new Error("dockerImage is required for docker execution");
    program = "docker";
    args = [
      "run", "--rm", "--network", "none", "--pids-limit", "256", "--cpus", "2", "--memory", "8g",
      "--mount", `type=bind,src=${workspace},dst=/work`, "--workdir", "/work",
      "--env", `RESEARCH_SEED=${spec.seed}`,
      ...Object.entries(command.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
      "--entrypoint", command.program,
      spec.dockerImage, ...command.args,
    ];
    cwd = runDir;
  }
  const output = await runProcess(program, args, { cwd, env, timeoutMs });
  const stdoutPath = join(runDir, `${variant}.stdout.log`);
  const stderrPath = join(runDir, `${variant}.stderr.log`);
  writeFileSync(stdoutPath, output.stdout);
  writeFileSync(stderrPath, output.stderr);
  return {
    variant, command, seed: spec.seed, codePath, codeSha256, codeSnapshotPath,
    metric: output.exitCode === 0 ? parseMetric(output.stdout, spec.metric) : null,
    exitCode: output.exitCode, timedOut: output.timedOut, durationMs: output.durationMs,
    stdoutPath, stderrPath, startedAt, finishedAt: new Date().toISOString(),
  };
}
