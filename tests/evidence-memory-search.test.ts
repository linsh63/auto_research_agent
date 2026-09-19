import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { SearchStore } from "../src/infrastructure/db/search-store.js";
import { BoundedExperimentSearch } from "../src/application/experiment-search.js";
import { assertPatchAllowed, validateDatasetRoles } from "../src/domain/search.js";
import { dockerArgs } from "../src/adapters/docker-runner.js";

test("evidence store preserves searchable passage and claim evidence", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-evidence-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new EvidenceStore(join(dir, "research.db"));
  store.upsertSource({ id: "s1", title: "A paper", authors: [], year: 2025, abstract: "A test", identifiers: [{ scheme: "doi", value: "10.1000/test", isCanonical: true, source: "crossref" }], sourceUrl: "https://example.org/paper", accessUrl: "https://example.org/paper", accessStatus: "open", license: "cc-by", origin: "test", accessedAt: new Date().toISOString() });
  assert.equal(store.lookupIdentifier("doi", "10.1000/TEST")?.id, "s1");
  store.addDocumentVersion({ id: "d1", sourceId: "s1", artifactHash: null, contentType: "text", parser: "test", parserVersion: "1", parserConfigHash: "test", contentHash: "a".repeat(64), status: "parsed", warning: null, createdAt: new Date().toISOString() });
  store.addPassage({ id: "p1", documentVersionId: "d1", parentId: null, kind: "paragraph", sectionPath: ["Results"], text: "The proposed method improves accuracy.", pageStart: 2, pageEnd: 2, charStart: 0, charEnd: 38, locatorHash: "loc", ordinal: 0 });
  assert.equal(store.searchPassages("improves accuracy").length, 1);
  store.addClaim({ id: "c1", runId: "run", kind: "fact", text: "The method improves accuracy.", status: "reviewed", createdAt: new Date().toISOString() });
  assert.equal(store.validateClaimForFinal("c1").ok, false);
  store.linkClaim({ claimId: "c1", passageId: "p1", experimentRunId: null, relation: "supports", note: "result passage", createdAt: new Date().toISOString() });
  assert.equal(store.validateClaimForFinal("c1").ok, true);
  store.addCitationEdge("s1","s2","fixture"); assert.equal(store.expandCitations("s1").length,1);
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

test("search reuses identical node signatures without rerunning", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-search-cache-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new SearchStore(join(dir, "research.db")); const search = new BoundedExperimentSearch(store); let calls = 0;
  const options = { strategy: "linear" as const, candidates: [{ x: 1 }], budget: { maxCandidates: 1, maxWallMs: 1000, maxCostUsd: 1, concurrency: 1 }, runner: async () => { calls++; return { metric: 1, costUsd: 0, durationMs: 1 }; } };
  const first=await search.run(options); const second=await search.run(options); assert.equal(calls, 1);
  assert.throws(()=>store.assertFinalTestApproved(first[0]!.searchRunId),/sealed/);
  store.approveFinalTest(second[0]!.searchRunId); store.assertFinalTestApproved(second[0]!.searchRunId); store.completeFinalTest(second[0]!.searchRunId); store.close();
});

test("patch policy and Docker runner enforce boundaries", () => {
  const plan = { mode: "patch" as const, allowedPaths: ["src/model"], forbiddenPaths: ["test", "evaluation", "scheduler", "sandbox"], datasets: [{ name: "train" as const, manifestHash: "a", path: "/train", sealed: false }, { name: "validation" as const, manifestHash: "b", path: "/val", sealed: false }], finalTestApproved: false };
  assertPatchAllowed(["src/model/layer.py"], plan);
  assert.throws(() => assertPatchAllowed(["evaluation/metric.py"], plan), /forbidden/);
  const args = dockerArgs({ image: "example@sha256:" + "a".repeat(64), workspace: "/work", command: "python", args: ["train.py"], timeoutMs: 1000, gpuDevice: "0" });
  assert.ok(args.includes("none")); assert.ok(args.includes("device=0"));
});

test("best-first expansion creates parent-child lineage", async (t) => {
  const dir=mkdtempSync(join(tmpdir(),"ara-tree-")); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const store=new SearchStore(join(dir,"research.db")); const search=new BoundedExperimentSearch(store);
  const nodes=await search.run({strategy:"best-first",candidates:[{x:1,_priority:1}],budget:{maxCandidates:2,maxWallMs:1000,maxCostUsd:1,concurrency:1},runner:async(p)=>({metric:Number(p.x),costUsd:0,durationMs:1}),expand:async(node)=>node.parentId?[]:[{x:2,_priority:2}]});
  const child=nodes.find((node)=>node.parameters.x===2); assert.ok(child?.parentId); assert.equal(nodes[0]?.metric,2); store.close();
});
