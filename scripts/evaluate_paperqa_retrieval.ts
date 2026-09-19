import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RetrievalWorkerClient } from "../src/adapters/retrieval-worker.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";

type Query = { id:string; query:string; expectedSourceIds:string[] };
const dataDir=process.env.AUTO_RESEARCH_DATA_DIR??".research-data";
const store=new EvidenceStore(join(dataDir,"research.db")); const worker=new RetrievalWorkerClient({projectRoot:process.cwd()});
try {
  await worker.start();
  for (const source of store.listSources()) if (source.abstract.trim()) await worker.request({method:"paperqa_ingest_text",params:{docname:source.title,dockey:source.id,citation:source.title,texts:[source.abstract]},idempotencyKey:source.id,deadlineMs:30000});
  const queries=JSON.parse(readFileSync("benchmarks/retrieval/queries.json","utf8")) as Query[];
  let hits=0, reciprocal=0, ndcg=0; const latencies:number[]=[];
  for (const query of queries) {
    const started=performance.now(); const response=await worker.request({method:"search_passages",params:{query:query.query,limit:20},deadlineMs:30000}); latencies.push(performance.now()-started);
    const ids=((response.result as {hits:Array<{documentKey:string}>}).hits??[]).map((hit)=>hit.documentKey);
    const ranks=query.expectedSourceIds.map((id)=>ids.indexOf(id)).filter((rank)=>rank>=0).sort((a,b)=>a-b); if(ranks.length){hits++;reciprocal+=1/(ranks[0]+1);}
    const dcg=ids.slice(0,10).reduce((sum,id,index)=>sum+(query.expectedSourceIds.includes(id)?1/Math.log2(index+2):0),0); const ideal=query.expectedSourceIds.slice(0,10).reduce((sum,_id,index)=>sum+1/Math.log2(index+2),0); ndcg+=ideal?dcg/ideal:0;
  }
  latencies.sort((a,b)=>a-b); const p95=latencies[Math.min(latencies.length-1,Math.floor(latencies.length*0.95))]??0;
  console.log(JSON.stringify({queryCount:queries.length,hitRate:hits/queries.length,mrr:reciprocal/queries.length,ndcgAt10:ndcg/queries.length,p95Ms:p95},null,2));
} finally {await worker.stop();store.close();}
