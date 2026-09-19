import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RetrievalWorkerClient } from "../src/adapters/retrieval-worker.js";
import { ContentAddressedStore } from "../src/infrastructure/artifacts/content-store.js";

test("PaperQA2 worker ingests and retrieves a passage", async () => {
  const schema=JSON.parse(readFileSync("schemas/rpc/retrieval.v1.json","utf8"));
  assert.ok(schema.properties.method.enum.includes("paperqa_ingest_text"));
  assert.ok(schema.properties.method.enum.includes("search_passages"));
  const worker = new RetrievalWorkerClient({ projectRoot: process.cwd() });
  try {
    const handshake = await worker.start();
    assert.equal((handshake.result as { paperqaAvailable: boolean }).paperqaAvailable, true);
    const ingest = await worker.request({ method: "paperqa_ingest_text", params: { docname: "test", dockey: "test", texts: ["word bigrams improve text classification accuracy", "unrelated biology evidence"] }, deadlineMs: 30_000 });
    assert.equal(ingest.ok, true);
    const search = await worker.request({ method: "search_passages", params: { query: "classification bigrams", limit: 1 }, deadlineMs: 30_000 });
    const hits = (search.result as { hits: Array<{ text: string }> }).hits;
    assert.match(hits[0]?.text ?? "", /bigrams/);
  } finally { await worker.stop(); }
});

test("content-addressed store deduplicates by SHA-256", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ara-artifacts-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new ContentAddressedStore(dir); const one = store.put("same"); const two = store.put("same");
  assert.equal(one.hash, two.hash); assert.equal(store.get(one.hash).toString(), "same");
});
