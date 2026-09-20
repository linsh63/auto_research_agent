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
import { ContentAddressedStore } from "./infrastructure/artifacts/content-store.js";
import { createEvidenceTools } from "./adapters/evidence-tools.js";
import { WorkflowCoordinator } from "./application/workflow-coordinator.js";
import { ResearchStore } from "./infrastructure/db/research-store.js";
import { loadProjectConfig } from "./infrastructure/config/config.js";

const dataDir = resolve(process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data");
const argv = process.argv.slice(2);
let command = argv.shift();
const args = argv;
let researchMode = false;
if (command === "research") {
  researchMode = true;
  command = args.shift() ?? "help";
}

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
  npm run dev -- memory-trace <id>
  npm run dev -- memory-correct <id> <new-id> <text>
  npm run dev -- memory-export <namespace>
  npm run dev -- memory-import <bundle.json>
  npm run dev -- retrieval-check
  npm run dev -- doctor
  npm run dev -- model-check

Research graph (v1.2 E):
  npm run dev -- research new <intent.json>
  npm run dev -- research question <program-id> <question.json>
  npm run dev -- research select-question <program-id> <question-id>
  npm run dev -- research approve-scope <program-id> [actor]
  npm run dev -- research protocol <program-id> <protocol.json>
  npm run dev -- research hypothesis-set <program-id> <hypotheses.json>
  npm run dev -- research assumption-register <question-id> <assumption-ids.json>
  npm run dev -- research freeze-assumption-register <question-id> <register-id>
  npm run dev -- research freeze-hypothesis-set <program-id> <set-id>
  npm run dev -- research approve-protocol <program-id> <protocol-id>
  npm run dev -- research freeze-protocol <program-id> <protocol-id>
  npm run dev -- research assumption <question-id> <assumption.json>
  npm run dev -- research deviation <program-id> <deviation.json>
  npm run dev -- research approve-deviation <program-id> <deviation-id> <revised-protocol.json> [actor]
  npm run dev -- research reject-deviation <program-id> <deviation-id>
  npm run dev -- research visibility <program-id> <visibility.json>
  npm run dev -- research derive <program-id> <reason.json>
  npm run dev -- research status <program-id>

Set AUTO_RESEARCH_API_KEY for model stages. Optional: AUTO_RESEARCH_BASE_URL,
AUTO_RESEARCH_MODEL (default gpt-5.6-luna), AUTO_RESEARCH_DATA_DIR,
AUTO_RESEARCH_SKILL_ROOT.`);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!command || command === "help" || command === "--help") usage();
  if (researchMode) {
    const store = await ResearchStore.open(join(dataDir, "research.db"), { maxDerivedRuns: loadProjectConfig().research.maxDerivedRuns });
    const workflow = new WorkflowCoordinator(store);
    const readJson = (path: string | undefined): unknown => {
      if (!path) throw new Error("JSON input path is required");
      return JSON.parse(readFileSync(resolve(path), "utf8"));
    };
    try {
      if (command === "new") console.log(JSON.stringify(workflow.createIntent(readJson(args[0])), null, 2));
      else if (command === "question") console.log(JSON.stringify(workflow.proposeQuestion(args[0]!, readJson(args[1]) as never), null, 2));
      else if (command === "select-question") console.log(JSON.stringify(workflow.selectQuestion(args[0]!, args[1]!), null, 2));
      else if (command === "approve-scope") console.log(JSON.stringify(workflow.approveScope(args[0]!, args[1] ?? "researcher"), null, 2));
      else if (command === "protocol") console.log(JSON.stringify(workflow.draftProtocol(args[0]!, readJson(args[1]) as never), null, 2));
      else if (command === "approve-protocol") console.log(JSON.stringify(workflow.approveProtocol(args[0]!, args[1]!), null, 2));
      else if (command === "freeze-protocol") console.log(JSON.stringify(workflow.freezeProtocol(args[0]!, args[1]!), null, 2));
      else if (command === "assumption") console.log(JSON.stringify(workflow.addAssumption(args[0]!, readJson(args[1]) as never), null, 2));
      else if (command === "assumption-register") {
        const input = readJson(args[1]) as { assumptionIds?: string[]; parentId?: string | null };
        if (!Array.isArray(input.assumptionIds)) throw new Error("assumptionIds array is required");
        console.log(JSON.stringify(workflow.createAssumptionRegister(args[0]!, input.assumptionIds, input.parentId ?? null), null, 2));
      } else if (command === "hypothesis-set") console.log(JSON.stringify(workflow.createHypothesisSet(args[0]!, readJson(args[1]) as never), null, 2));
      else if (command === "freeze-assumption-register") console.log(JSON.stringify(workflow.freezeAssumptionRegister(args[0]!, args[1]!), null, 2));
      else if (command === "freeze-hypothesis-set") console.log(JSON.stringify(workflow.freezeHypothesisSet(args[0]!, args[1]!), null, 2));
      else if (command === "deviation") console.log(JSON.stringify(workflow.recordDeviation(args[0]!, readJson(args[1]) as never), null, 2));
      else if (command === "approve-deviation") console.log(JSON.stringify(workflow.approveDeviation(args[0]!, args[1]!, readJson(args[2]) as never, args[3] ?? "researcher"), null, 2));
      else if (command === "reject-deviation") console.log(JSON.stringify(workflow.rejectDeviation(args[0]!, args[1]!), null, 2));
      else if (command === "visibility") console.log(JSON.stringify(workflow.recordVisibility(readJson(args[0]) as never), null, 2));
      else if (command === "derive") {
        const input = readJson(args[1]) as { reason?: string; actor?: string; observedData?: string[] };
        if (!input.reason) throw new Error("Derivation reason is required");
        console.log(JSON.stringify(workflow.derive(args[0]!, input.reason, input.actor ?? "researcher", input.observedData ?? []), null, 2));
      } else if (command === "status") console.log(JSON.stringify(workflow.status(args[0]!), null, 2));
      else throw new Error(`Unknown research command: ${command}`);
    } finally { store.close(); }
    return;
  }
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
      const artifacts = new ContentAddressedStore(join(dataDir, "artifacts"));
      const stored = artifacts.put(readFileSync(resolve(args[0])));
      document.version.artifactHash = stored.hash;
      const ingested = store.addCanonicalDocument(document);
      const worker = new RetrievalWorkerClient({ projectRoot: process.cwd() });
      let paperqa: unknown = null;
      try {
        await worker.start();
        paperqa = await worker.request({ method: "paperqa_ingest_text", params: { docname: document.source.title, dockey: document.version.id, citation: document.source.title, texts: document.passages.map((passage) => passage.text) }, idempotencyKey: document.version.contentHash, deadlineMs: 60_000 });
      } finally { await worker.stop(); }
      console.log(JSON.stringify({ ...ingested, artifact: stored, paperqa }, null, 2));
    } finally { store.close(); }
    return;
  }
  if (["memory-status","memory-search","memory-add","memory-promote","memory-purge","memory-trace","memory-correct","memory-export","memory-import"].includes(command)) {
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
      } else if (command === "memory-trace") {
        if (!args[0]) throw new Error("Memory ID is required");
        console.log(JSON.stringify(store.trace(args[0]), null, 2));
      } else if (command === "memory-correct") {
        if (!args[0] || !args[1] || !args[2]) throw new Error("Memory ID, new ID and correction text are required");
        console.log(JSON.stringify(store.correct(args[0], args[1], args.slice(2).join(" "), "researcher"), null, 2));
      } else if (command === "memory-export") {
        if (!args[0]) throw new Error("Namespace is required");
        console.log(JSON.stringify(store.exportNamespace(args[0]), null, 2));
      } else if (command === "memory-import") {
        if (!args[0]) throw new Error("Memory bundle path is required");
        console.log(JSON.stringify(store.importBundle(JSON.parse(readFileSync(resolve(args[0]),"utf8"))),null,2));
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
    const memoryStore = new MemoryStore(join(dataDir, "research.db"));
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
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore, memoryStore });
      console.log(`Stage: ${engine.approvePlan(id)}`);
      return;
    }
    if (command === "revise-plan") {
      if (!args[1]) throw new Error("Plan JSON path is required");
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore, memoryStore });
      const plan = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
      engine.revisePlan(id, plan);
      console.log("Plan revised; review with status before approval.");
      return;
    }
    if (command === "finalize") {
      const engine = new ResearchEngine(ledger, undefined, { dataDir, evidenceStore, memoryStore });
      console.log(`Stage: ${engine.approveConclusion(id)}`);
      return;
    }
    if (command === "respond-review") {
      if (!args[1]) throw new Error("Review response JSON path is required");
      const engine = new ResearchEngine(ledger, undefined, { dataDir, memoryStore });
      const response = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
      engine.respondToReview(id, response);
      console.log("Review response recorded; review the updated report before finalizing.");
      return;
    }
    if (command === "run") {
      const { PiResearchModel, piModelConfigFromEnv } = await import("./adapters/pi-model.js");
      const retrievalWorker = new RetrievalWorkerClient({ projectRoot: process.cwd() });
      try {
        try {
          await retrievalWorker.start();
          const byDocument = new Map<string, string[]>();
          for (const passage of evidenceStore.listPassages()) byDocument.set(passage.documentVersionId, [...(byDocument.get(passage.documentVersionId) ?? []), passage.text]);
          for (const [documentId, texts] of byDocument) await retrievalWorker.request({ method: "paperqa_ingest_text", params: { docname: documentId, dockey: documentId, texts }, idempotencyKey: documentId, deadlineMs: 60_000 });
        } catch { /* Evidence tools retain SQLite fallback. */ }
        const model = await PiResearchModel.create({ ...piModelConfigFromEnv(), customTools: createEvidenceTools(evidenceStore, retrievalWorker) });
        const engine = new ResearchEngine(ledger, model, { dataDir, evidenceStore, memoryStore, memoryRetrievalEnabled: process.env.AUTO_RESEARCH_MEMORY_ENABLED === "1" });
        const stage = await engine.run(id);
        console.log(`Stage: ${stage}`);
        if (stage === "approval") console.log("Review the plan with `status`, then run `approve <id>`.");
        if (stage === "final_approval") console.log(`Review ${engine.reportPath(id)}, then run finalize <id>.`);
      } finally { await retrievalWorker.stop(); }
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally { memoryStore.close(); evidenceStore.close(); ledger.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
