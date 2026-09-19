import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";

type Query = { id: string; query: string; expectedSourceIds: string[] };
const dataDir = process.env.AUTO_RESEARCH_DATA_DIR ?? ".research-data";
const queries = JSON.parse(readFileSync("benchmarks/retrieval/queries.json", "utf8")) as Query[];
const store = new EvidenceStore(join(dataDir, "research.db"));
try {
  let hits = 0; let reciprocal = 0; let expected = 0; let ndcg = 0; const latencies: number[] = [];
  const rows = queries.map((query) => {
    const started = performance.now();
    const found = store.searchSources(query.query, 20);
    latencies.push(performance.now() - started);
    const ids = found.map((item) => item.id);
    const first = query.expectedSourceIds.findIndex((id) => ids.includes(id));
    const hit = first >= 0;
    hits += hit ? 1 : 0;
    reciprocal += hit ? 1 / (ids.indexOf(query.expectedSourceIds[first]) + 1) : 0;
    const dcg = ids.slice(0,10).reduce((sum,id,index)=>sum+(query.expectedSourceIds.includes(id)?1/Math.log2(index+2):0),0);
    const ideal = query.expectedSourceIds.slice(0,10).reduce((sum,_id,index)=>sum+1/Math.log2(index+2),0);
    ndcg += ideal ? dcg/ideal : 0;
    expected += query.expectedSourceIds.length;
    return { id: query.id, hit, rank: hit ? ids.indexOf(query.expectedSourceIds[first]) + 1 : null, returned: ids };
  });
  latencies.sort((a,b)=>a-b);
  const p95 = latencies[Math.min(latencies.length-1, Math.floor(latencies.length*0.95))] ?? 0;
  console.log(JSON.stringify({ queryCount: queries.length, hitRate: hits / queries.length, mrr: reciprocal / queries.length, ndcgAt10: ndcg / queries.length, p95Ms: p95, expectedCoverage: expected, rows }, null, 2));
} finally { store.close(); }
