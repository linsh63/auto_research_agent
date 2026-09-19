import { join } from "node:path";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { ingestSources } from "../src/adapters/evidence-ingest.js";
import { Ledger } from "../src/core/ledger.js";
import type { PaperSearchResult } from "../src/adapters/papers.js";

const dataDir = process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data";
const ledger = new Ledger(join(dataDir, "research.db"));
const store = new EvidenceStore(join(dataDir, "research.db"));
try {
  const runId = process.argv[2];
  const runs = runId ? [ledger.get(runId)] : ledger.list();
  let migrated = 0;
  for (const run of runs) {
    const evidence = ledger.latest<PaperSearchResult>(run.id, "evidence");
    if (!evidence) continue;
    ingestSources(store, evidence.sources);
    migrated++;
  }
  console.log(JSON.stringify({ migratedRuns: migrated, counts: store.counts() }, null, 2));
} finally { store.close(); ledger.close(); }
