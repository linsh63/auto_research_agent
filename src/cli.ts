#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { SkillCatalog } from "./adapters/skills.js";
import { ResearchEngine } from "./core/engine.js";
import { Ledger } from "./core/ledger.js";
import { EvidenceStore } from "./infrastructure/db/evidence-store.js";
import { MemoryStore } from "./infrastructure/db/memory-store.js";
import { RetrievalWorkerClient } from "./adapters/retrieval-worker.js";
import { parseTextFile } from "./adapters/parsing.js";
import { createHash } from "node:crypto";

const dataDir = resolve(process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data");
const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.log(`Auto Research Agent
Usage:
  npm run dev -- new <brief.json>
  npm run dev -- run <run-id>
  npm run dev -- approve <run-id>
  npm run dev -- revise-plan <run-id> <plan.json>
  npm run dev -- finalize <run-id>
  npm run dev -- respond-review <run-id> <response.json>
  npm run dev -- status <run-id>
  npm run dev -- list
  npm run dev -- skills
  npm run dev -- evidence-status
  npm run dev -- evidence-search <query>
  npm run dev -- evidence-ingest-file <path> <source-url>
  npm run dev -- memory-status
  npm run dev -- memory-search <query>
  npm run dev -- memory-add <memory.json>
  npm run dev -- memory-promote <id> <reviewed|verified|archived|retracted>
  npm run dev -- memory-purge <id>
  npm run dev -- retrieval-check
  npm run dev -- doctor
  npm run dev -- model-check

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
    console.log(`Provider: ${process.env.AUTO_RESEARCH_PROVIDER ?? "xera (legacy shorthand)"}`);
    console.log(`Models file: ${process.env.AUTO_RESEARCH_MODELS_PATH ?? "pi default / inline shorthand"}`);
    console.log(`Runtime API key configured: ${Boolean(process.env.AUTO_RESEARCH_API_KEY)}`);
    console.log(`Skill files: ${skills.filter((s) => s.available).length}/${skills.length}`);
    console.log(`paper-search runtime: ${existsSync(join(root, "paper-search", ".venv", "bin", "python"))}`);
    console.log(`Data directory: ${dataDir}`);
    return;
  }
  if (command === "retrieval-check") {
    const worker = new RetrievalWorkerClient({ projectRoot: process.cwd() });
    try {
      const handshake = await worker.start();
      console.log(JSON.stringify(handshake, null, 2));
    } finally { await worker.stop(); }
    return;
  }
  if (command === "evidence-status") {
    const store = new EvidenceStore(join(dataDir, "research.db"));
    try { console.log(JSON.stringify(store.counts(), null, 2)); } finally { store.close(); }
    return;
  }
  if (command === "evidence-search") {
    const store = new EvidenceStore(join(dataDir, "research.db"));
    try { console.log(JSON.stringify(store.searchPassages(args.join(" ")), null, 2)); } finally { store.close(); }
    return;
  }
  if (command === "evidence-ingest-file") {
    if (!args[0] || !args[1]) throw new Error("File path and source URL are required");
    const store = new EvidenceStore(join(dataDir, "research.db"));
    try {
      const sourceId = `local-${createHash("sha256").update(resolve(args[0])).digest("hex").slice(0, 16)}`;
      const document = await parseTextFile(resolve(args[0]), { id: sourceId, title: resolve(args[0]), authors: [], year: null, abstract: "", identifiers: [], sourceUrl: new URL(args[1]).toString(), accessUrl: new URL(args[1]).toString(), accessStatus: "user_provided", license: null, origin: "user-provided", accessedAt: new Date().toISOString() });
      console.log(JSON.stringify(store.addCanonicalDocument(document), null, 2));
    } finally { store.close(); }
    return;
  }
  if (command === "memory-status" || command === "memory-search" || command === "memory-add" || command === "memory-promote" || command === "memory-purge") {
    const store = new MemoryStore(join(dataDir, "research.db"));
    try {
      if (command === "memory-status") console.log(JSON.stringify(store.counts(), null, 2));
      else if (command === "memory-search") console.log(JSON.stringify(store.search(args.join(" ")), null, 2));
      else if (command === "memory-add") {
        if (!args[0]) throw new Error("Memory JSON path is required");
        console.log(JSON.stringify(store.createCandidate(JSON.parse(readFileSync(resolve(args[0]), "utf8"))), null, 2));
      } else if (command === "memory-purge") {
        if (!args[0]) throw new Error("Memory ID is required");
        console.log(JSON.stringify(store.purge(args[0], "researcher"), null, 2));
      } else {
        if (!args[0] || !args[1]) throw new Error("Memory ID and target status are required");
        console.log(JSON.stringify(store.promote(args[0], args[1] as "reviewed" | "verified" | "archived" | "retracted", "researcher"), null, 2));
      }
    } finally { store.close(); }
    return;
  }
  if (command === "model-check") {
    const { z } = await import("zod");
    const { PiResearchModel, piModelConfigFromEnv } = await import("./adapters/pi-model.js");
    const model = await PiResearchModel.create(piModelConfigFromEnv());
    const result = await model.generate(
      "connectivity-check",
      { request: "Return ok=true and the exact provider/model identifier shown in the instruction." },
      z.object({ ok: z.literal(true), note: z.string().max(100) }),
      `This is a minimal API connectivity check for ${model.id}. Return a very short note.`,
    );
    console.log(JSON.stringify({ model: model.id, value: result.value, usage: result.usage }, null, 2));
    return;
  }
    const ledger = new Ledger(join(dataDir, "research.db"));
    const evidenceStore = new EvidenceStore(join(dataDir, "research.db"));
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
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore });
      console.log(`Stage: ${engine.approvePlan(id)}`);
      return;
    }
    if (command === "revise-plan") {
      if (!args[1]) throw new Error("Plan JSON path is required");
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore });
      const plan = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
      engine.revisePlan(id, plan);
      console.log("Plan revised; review with status before approval.");
      return;
    }
    if (command === "finalize") {
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore });
      console.log(`Stage: ${engine.approveConclusion(id)}`);
      return;
    }
    if (command === "respond-review") {
      if (!args[1]) throw new Error("Review response JSON path is required");
      const engine = new ResearchEngine(ledger, undefined, { dataDir });
      const response = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
      engine.respondToReview(id, response);
      console.log("Review response recorded; review the updated report before finalizing.");
      return;
    }
    if (command === "run") {
      const { PiResearchModel, piModelConfigFromEnv } = await import("./adapters/pi-model.js");
      const model = await PiResearchModel.create(piModelConfigFromEnv());
      const engine = new ResearchEngine(ledger, model, { dataDir, evidenceStore });
      const stage = await engine.run(id);
      console.log(`Stage: ${stage}`);
      if (stage === "approval") console.log("Review the plan with `status`, then run `approve <id>`.");
      if (stage === "final_approval") console.log(`Review ${engine.reportPath(id)}, then run finalize <id>.`);
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally { evidenceStore.close(); ledger.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
