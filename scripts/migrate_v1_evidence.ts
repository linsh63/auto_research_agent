import { join } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { ingestSources } from "../src/adapters/evidence-ingest.js";
import { Ledger } from "../src/core/ledger.js";
import type { PaperSearchResult } from "../src/adapters/papers.js";

const dataDir = process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data";
const dbPath = join(dataDir, "research.db");
const backupDir = join(dataDir, "backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = join(backupDir, `research-before-evidence-${new Date().toISOString().replaceAll(":", "-")}.db`);
const backupDb = new Database(dbPath, { readonly: true });
await backupDb.backup(backupPath);
backupDb.close();
const ledger = new Ledger(dbPath);
const store = new EvidenceStore(dbPath);
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
  console.log(JSON.stringify({ backupPath, migratedRuns: migrated, counts: store.counts() }, null, 2));
} finally { store.close(); ledger.close(); }
