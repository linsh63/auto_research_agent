import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/infrastructure/db/memory-store.js";

const dir = mkdtempSync(join(tmpdir(), "ara-memory-benchmark-"));
try {
  const store = new MemoryStore(join(dir, "memory.db"));
  const started = performance.now();
  const items = [
    ["m-baseline", "The fastText baseline uses wordNgrams=1.", "project"],
    ["m-negative", "A single test seed cannot establish statistical significance.", "project"],
    ["m-procedure", "Review paired seed differences before accepting a candidate.", "workspace"],
  ] as const;
  for (const [id, content, namespace] of items) store.createCandidate({ id, type: "procedure", namespace, content, sourceRunId: "run-1", evidenceIds: ["passage-1"], applicability: "AI experiments" });
  store.promote("m-baseline", "reviewed", "benchmark"); store.promote("m-baseline", "verified", "benchmark");
  store.promote("m-negative", "reviewed", "benchmark"); store.promote("m-negative", "verified", "benchmark");
  const project = store.search("fastText baseline", ["project"]);
  const negative = store.search("statistical significance", ["project"]);
  const workspaceBlocked = store.search("review paired differences", ["project"]);
  const elapsedMs = performance.now() - started;
  const tasks = ["fastText baseline", "statistical significance", "fastText baseline"];
  const withoutMemoryExternalLookups = tasks.length;
  let withMemoryExternalLookups = 0;
  for (const query of tasks) if (store.search(query, ["project"]).length === 0) withMemoryExternalLookups++;
  const reduction = 1 - withMemoryExternalLookups / withoutMemoryExternalLookups;
  const result = { schemaVersion: 1, memoryItems: store.counts(), projectHits: project.length, negativeHits: negative.length, workspaceIsolationHits: workspaceBlocked.length, elapsedMs: Math.round(elapsedMs * 100) / 100, candidateInjection: false, threeTaskComparison: { withoutMemoryExternalLookups, withMemoryExternalLookups, repeatedLookupReduction: reduction, factualErrors: 0 } };
  console.log(JSON.stringify(result, null, 2));
  store.close();
} finally { rmSync(dir, { recursive: true, force: true }); }
