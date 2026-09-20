import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { executeExperiment } from "../src/adapters/experiment.js";
import { BriefSchema } from "../src/core/schema.js";

test("CV scenario is adapter-only and preserves mixed paired outcomes", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "research-cv-scenario-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const brief = BriefSchema.parse(JSON.parse(readFileSync(resolve("examples/sklearn-digits/brief.json"), "utf8")));
  brief.experiment.workspace = resolve(brief.experiment.workspace);

  const baseline = await executeExperiment(brief, "baseline", dir);
  const candidate = await executeExperiment(brief, "candidate", dir);
  assert.equal(baseline.exitCode, 0);
  assert.equal(candidate.exitCode, 0);
  assert.equal(baseline.details?.dataset_sha256, candidate.details?.dataset_sha256);
  assert.ok(candidate.metric! > baseline.metric!);

  const baselineRows = baseline.details?.per_seed as Array<{ seed: number; accuracy: number }>;
  const candidateRows = candidate.details?.per_seed as Array<{ seed: number; accuracy: number }>;
  const differences = candidateRows.map((row, index) => row.accuracy - baselineRows[index].accuracy);
  assert.ok(differences.some((value) => value > 0));
  assert.ok(differences.some((value) => value === 0));
  assert.ok(differences.some((value) => value < 0));

  const coreFiles = ["src/core/schema.ts", "src/core/engine.ts", "src/domain/search.ts", "src/application/experiment-search.ts"];
  for (const path of coreFiles) {
    assert.doesNotMatch(readFileSync(resolve(path), "utf8"), /digits|scikit-learn|image classification/i);
  }
});
