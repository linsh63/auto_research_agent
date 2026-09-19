import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { SearchStore } from "../src/infrastructure/db/search-store.js";
import { BoundedExperimentSearch } from "../src/application/experiment-search.js";
import { validateDatasetRoles } from "../src/domain/search.js";

test("evidence store preserves searchable passage and claim evidence", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-evidence-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new EvidenceStore(join(dir, "research.db"));
  store.upsertSource({ id: "s1", title: "A paper", authors: [], year: 2025, abstract: "A test", identifiers: [], sourceUrl: "https://example.org/paper", accessUrl: "https://example.org/paper", accessStatus: "open", license: "cc-by", origin: "test", accessedAt: new Date().toISOString() });
  store.addDocumentVersion({ id: "d1", sourceId: "s1", artifactHash: null, contentType: "text", parser: "test", parserVersion: "1", parserConfigHash: "test", contentHash: "a".repeat(64), status: "parsed", warning: null, createdAt: new Date().toISOString() });
  store.addPassage({ id: "p1", documentVersionId: "d1", parentId: null, kind: "paragraph", sectionPath: ["Results"], text: "The proposed method improves accuracy.", pageStart: 2, pageEnd: 2, charStart: 0, charEnd: 38, locatorHash: "loc", ordinal: 0 });
  assert.equal(store.searchPassages("improves accuracy").length, 1);
  store.close();
});

test("bounded experiment search records successes, failures, and budget", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-search-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new SearchStore(join(dir, "research.db"));
  const search = new BoundedExperimentSearch(store);
  const nodes = await search.run({ strategy: "linear", candidates: [{ x: 1 }, { x: 2 }, { x: 3 }], budget: { maxCandidates: 2, maxWallMs: 10_000, maxCostUsd: 1, concurrency: 1 }, runner: async (parameters) => parameters.x === 2 ? { metric: null, costUsd: 0, durationMs: 1, failureClass: "known_failure" } : { metric: 0.5, costUsd: 0.1, durationMs: 1 } });
  assert.equal(nodes.length, 2); assert.equal(nodes[0]?.status, "succeeded"); assert.equal(nodes[1]?.status, "failed");
  store.close();
});

test("dataset roles keep test data sealed during search", () => {
  validateDatasetRoles([
    { name: "train", manifestHash: "train", path: "/train", sealed: false },
    { name: "validation", manifestHash: "validation", path: "/validation", sealed: false },
    { name: "test", manifestHash: "test", path: "/test", sealed: true },
  ]);
  assert.throws(() => validateDatasetRoles([{ name: "train", manifestHash: "train", path: "/train", sealed: false }, { name: "validation", manifestHash: "validation", path: "/validation", sealed: false }, { name: "test", manifestHash: "test", path: "/test", sealed: false }]), /sealed/);
});
