#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { SkillCatalog } from "./adapters/skills.js";
import { ResearchEngine } from "./core/engine.js";
import { Ledger } from "./core/ledger.js";

const dataDir = resolve(process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data");
const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.log(`Auto Research Agent
Usage:
  npm run dev -- new <brief.json>
  npm run dev -- run <run-id>
  npm run dev -- approve <run-id>
  npm run dev -- finalize <run-id>
  npm run dev -- status <run-id>
  npm run dev -- list
  npm run dev -- skills
  npm run dev -- doctor

Set AUTO_RESEARCH_API_KEY for model stages. Optional: AUTO_RESEARCH_BASE_URL,
AUTO_RESEARCH_MODEL (default gpt-5.6-luna), AUTO_RESEARCH_DATA_DIR,
AUTO_RESEARCH_SKILL_ROOT.`);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!command || command === "help" || command === "--help") usage();
  if (command === "skills") {
    for (const skill of new SkillCatalog().list()) {
      console.log(`${skill.available ? "ready" : "missing"}\t${skill.mode}\t${skill.name}\t${skill.sha256?.slice(0, 12) ?? "-"}`);
    }
    return;
  }
  if (command === "doctor") {
    const root = process.env.AUTO_RESEARCH_SKILL_ROOT ?? join(homedir(), ".codex", "skills");
    const skills = new SkillCatalog(root).list();
    console.log(`Node: ${process.version}`);
    console.log(`Model: ${process.env.AUTO_RESEARCH_MODEL ?? "gpt-5.6-luna"}`);
    console.log(`API key configured: ${Boolean(process.env.AUTO_RESEARCH_API_KEY)}`);
    console.log(`Skill files: ${skills.filter((s) => s.available).length}/${skills.length}`);
    console.log(`paper-search runtime: ${existsSync(join(root, "paper-search", ".venv", "bin", "python"))}`);
    console.log(`Data directory: ${dataDir}`);
    return;
  }
  const ledger = new Ledger(join(dataDir, "research.db"));
  try {
    if (command === "new") {
      if (!args[0]) throw new Error("Brief JSON path is required");
      const input = JSON.parse(readFileSync(resolve(args[0]), "utf8"));
      if (typeof input?.experiment?.workspace === "string") {
        input.experiment.workspace = resolve(input.experiment.workspace);
      }
      const run = ledger.create(input);
      console.log(`Created ${run.id} at stage ${run.stage}`);
      return;
    }
    if (command === "list") {
      for (const run of ledger.list()) console.log(`${run.id}\t${run.stage}\t${run.brief.title}`);
      return;
    }
    const id = args[0];
    if (!id) throw new Error("Run ID is required");
    if (command === "status") {
      const run = ledger.get(id);
      console.log(JSON.stringify({
        id: run.id, title: run.brief.title, stage: run.stage, modelCalls: run.modelCalls,
        lastError: run.lastError, plan: ledger.latest(id, "plan"),
        review: ledger.latest(id, "review"),
        report: join(dataDir, "runs", id, "report.md"),
      }, null, 2));
      return;
    }
    if (command === "approve") {
      const engine = new ResearchEngine(ledger, undefined, { dataDir });
      console.log(`Stage: ${engine.approvePlan(id)}`);
      return;
    }
    if (command === "finalize") {
      const engine = new ResearchEngine(ledger, undefined, { dataDir });
      console.log(`Stage: ${engine.approveConclusion(id)}`);
      return;
    }
    if (command === "run") {
      const key = process.env.AUTO_RESEARCH_API_KEY;
      if (!key) throw new Error("AUTO_RESEARCH_API_KEY is required for model stages");
      const { PiResearchModel } = await import("./adapters/pi-model.js");
      const model = await PiResearchModel.create({
        apiKey: key, baseUrl: process.env.AUTO_RESEARCH_BASE_URL,
        modelId: process.env.AUTO_RESEARCH_MODEL,
        timeoutMs: process.env.AUTO_RESEARCH_MODEL_TIMEOUT_MS
          ? Number(process.env.AUTO_RESEARCH_MODEL_TIMEOUT_MS) : undefined,
      });
      const engine = new ResearchEngine(ledger, model, { dataDir });
      const stage = await engine.run(id);
      console.log(`Stage: ${stage}`);
      if (stage === "approval") console.log("Review the plan with `status`, then run `approve <id>`.");
      if (stage === "final_approval") console.log(`Review ${engine.reportPath(id)}, then run finalize <id>.`);
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally { ledger.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
