import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MemoryStore } from "../src/infrastructure/db/memory-store.js";

test("memory promotion and scope filtering prevent candidate injection", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-memory-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new MemoryStore(join(dir, "research.db"));
  store.createCandidate({ id: "m1", type: "procedure", namespace: "project", content: "Use paired seeds.", sourceRunId: "run1", evidenceIds: ["p1"], applicability: "AI experiments" });
  assert.equal(store.search("paired seeds").length, 0);
  store.promote("m1", "reviewed", "test");
  store.promote("m1", "verified", "test");
  assert.equal(store.search("paired seeds", ["project"]).length, 1);
  assert.equal(store.search("paired seeds", ["workspace"]).length, 0);
  const proof = store.purge("m1", "test");
  assert.equal(proof.purged, true);
  assert.equal(store.search("paired seeds", ["project"]).length, 0);
  store.close();
});
