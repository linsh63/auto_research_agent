import assert from "node:assert/strict";
import test from "node:test";
import { restrictedExperimentEnv, runProcess } from "../src/adapters/process.js";

test("process runner enforces timeout", async () => {
  const result = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], { timeoutMs: 50 });
  assert.equal(result.timedOut, true);
  assert.ok(result.durationMs < 3_000);
});

test("experiment environment rejects likely secrets", () => {
  assert.throws(() => restrictedExperimentEnv({ PRIVATE_API_TOKEN: "secret" }), /Secret-like/);
});
