import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runProcess } from "../src/adapters/process.js";
import { BoundedExperimentSearch } from "../src/application/experiment-search.js";
import { SearchStore } from "../src/infrastructure/db/search-store.js";

const root = resolve(".research-data/cases/fasttext-agnews");
const data = join(root, "data");
const searchDir = join(root, "search-validation");
const binary = join(root, "upstream/fastText-0.9.2/fasttext");
mkdirSync(searchDir, { recursive: true });
const all = readFileSync(join(data, "train.ft"), "utf8").trim().split(/\r?\n/);
const validation = all.filter((_, index) => index % 15 === 0);
const training = all.filter((_, index) => index % 15 !== 0);
writeFileSync(join(searchDir, "train.ft"), `${training.join("\n")}\n`);
writeFileSync(join(searchDir, "validation.ft"), `${validation.join("\n")}\n`);

const store = new SearchStore(join(root, "search.db"));
const search = new BoundedExperimentSearch(store);
try {
  const strategy = (process.env.SEARCH_STRATEGY === "linear" ? "linear" : "best-first") as "linear" | "best-first";
  const nodes = await search.run({
    strategy,
    candidates: [
      { wordNgrams: 1, epoch: 3, dim: 10, priority: 0 }, { wordNgrams: 1, epoch: 5, dim: 10, priority: 0 },
      { wordNgrams: 2, epoch: 3, dim: 10, priority: 1 }, { wordNgrams: 2, epoch: 5, dim: 10, priority: 1 },
    ],
    budget: { maxCandidates: 2, maxWallMs: 120_000, maxCostUsd: 1, concurrency: 1 },
    runner: async (parameters) => {
      const prefix = join(searchDir, `model-${parameters.wordNgrams}-${parameters.epoch}-${parameters.dim}`);
      const train = await runProcess(binary, ["supervised", "-input", join(searchDir, "train.ft"), "-output", prefix,
        "-dim", String(parameters.dim), "-lr", "0.25", "-epoch", String(parameters.epoch), "-minCount", "1", "-bucket", "1000000", "-thread", "1", "-wordNgrams", String(parameters.wordNgrams), "-seed", "11"], { cwd: searchDir, timeoutMs: 120_000 });
      if (train.exitCode !== 0) return { metric: null, costUsd: 0, durationMs: train.durationMs, failureClass: "training_failed" };
      const evaluation = await runProcess(binary, ["test", `${prefix}.bin`, join(searchDir, "validation.ft")], { cwd: searchDir, timeoutMs: 30_000 });
      const match = evaluation.stdout.match(/P@1\s+([0-9.]+)/);
      return { metric: match ? Number(match[1]) : null, costUsd: 0, durationMs: train.durationMs + evaluation.durationMs, artifactHash: null, failureClass: match ? undefined : "metric_missing" };
    },
  });
  const best = nodes.filter((node) => node.metric !== null).sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity))[0] ?? null;
  console.log(JSON.stringify({ schemaVersion: 1, dataset: { trainCount: training.length, validationCount: validation.length }, strategy, nodes, best }, null, 2));
} finally { store.close(); }
