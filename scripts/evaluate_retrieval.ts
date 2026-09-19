import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";

type Query = { id: string; query: string; expectedSourceIds: string[] };
const dataDir = process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data";
const queries = JSON.parse(readFileSync("benchmarks/retrieval/queries.json", "utf8")) as Query[];
const store = new EvidenceStore(join(dataDir, "research.db"));
try {
  let hits = 0; let reciprocal = 0; let expected = 0;
  const rows = queries.map((query) => {
    const found = store.searchSources(query.query, 20);
    const ids = found.map((item) => item.id);
    const first = query.expectedSourceIds.findIndex((id) => ids.includes(id));
    const hit = first >= 0;
    hits += hit ? 1 : 0;
    reciprocal += hit ? 1 / (ids.indexOf(query.expectedSourceIds[first]) + 1) : 0;
    expected += query.expectedSourceIds.length;
    return { id: query.id, hit, rank: hit ? ids.indexOf(query.expectedSourceIds[first]) + 1 : null, returned: ids };
  });
  console.log(JSON.stringify({ queryCount: queries.length, hitRate: hits / queries.length, mrr: reciprocal / queries.length, expectedCoverage: expected, rows }, null, 2));
} finally { store.close(); }
