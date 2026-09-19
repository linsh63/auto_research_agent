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
  const workspaceBlocked = store.search("paired seed", ["project"]);
  const elapsedMs = performance.now() - started;
  const result = { schemaVersion: 1, memoryItems: store.counts(), projectHits: project.length, negativeHits: negative.length, workspaceIsolationHits: workspaceBlocked.length, elapsedMs: Math.round(elapsedMs * 100) / 100, candidateInjection: false };
  console.log(JSON.stringify(result, null, 2));
  store.close();
} finally { rmSync(dir, { recursive: true, force: true }); }
