import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTextFile } from "../src/adapters/parsing.js";
import { EvidenceStore } from "../src/infrastructure/db/evidence-store.js";
import { EvidenceSynthesisStore } from "../src/infrastructure/db/evidence-synthesis-store.js";
import { hCaseDb, hCaseRoot, hScopeContext } from "./h_case_context.js";

const root=hCaseRoot,db=hCaseDb;
const {programId,questionId}=hScopeContext();
const records=[
  {id:"hendrycks-dietterich-2019",file:"cifar10c.pdf",title:"Benchmarking Neural Network Robustness to Common Corruptions and Perturbations",authors:["Dan Hendrycks","Thomas Dietterich"],year:2019,url:"https://arxiv.org/abs/1903.12261",arxiv:"1903.12261",topic:"dataset" as const,critical:true,summary:"Defines the CIFAR-10-C common-corruption benchmark and its intended robustness evaluation."},
  {id:"hendrycks-etal-2020-augmix",file:"augmix.pdf",title:"AugMix: A Simple Data Processing Method to Improve Robustness and Uncertainty",authors:["Dan Hendrycks","Norman Mu","Ekin D. Cubuk","Barret Zoph","Justin Gilmer","Balaji Lakshminarayanan"],year:2020,url:"https://arxiv.org/abs/1912.02781",arxiv:"1912.02781",topic:"method" as const,critical:true,summary:"Describes AugMix as a limited-overhead training-time method evaluated for common-corruption robustness."},
  {id:"guo-2017-calibration",file:"calibration.pdf",title:"On Calibration of Modern Neural Networks",authors:["Chuan Guo","Geoff Pleiss","Yu Sun","Kilian Q. Weinberger"],year:2017,url:"https://proceedings.mlr.press/v70/guo17a.html",arxiv:"",topic:"metric" as const,critical:false,summary:"Provides background for post-hoc calibration and expected calibration error interpretation."},
  {id:"zhang-etal-2018-mixup",file:"mixup.pdf",title:"mixup: Beyond Empirical Risk Minimization",authors:["Hongyi Zhang","Moustapha Cisse","Yann N. Dauphin","David Lopez-Paz"],year:2018,url:"https://arxiv.org/abs/1710.09412",arxiv:"1710.09412",topic:"method" as const,critical:false,summary:"Provides an adjacent low-cost augmentation comparator considered during scope selection."},
];
const evidence=new EvidenceStore(db),synthesis=await EvidenceSynthesisStore.open(db);
try{
  const existing=synthesis.listSearchProtocols(programId).at(-1);const draft=existing??synthesis.createSearchProtocol(programId,{queryFamilies:[
    {id:"q-problem",kind:"problem",queries:["CIFAR-10-C common corruption robustness"],rationale:"Identify the benchmark definition and known failure mode."},
    {id:"q-method",kind:"method",queries:["AugMix CIFAR-10-C robustness uncertainty"],rationale:"Identify the selected intervention and its evaluation boundary."},
    {id:"q-adjacent",kind:"adjacent",queries:["Mixup temperature scaling CIFAR-10 calibration"],rationale:"Identify low-cost adjacent interventions and calibration context."},
    {id:"q-refute",kind:"refutation",queries:["AugMix limitations corruption robustness"],rationale:"Search for limitations and results that could weaken the intervention premise."},
  ],databases:["arXiv","OpenReview","PMLR"],startYear:2017,endYear:2026,inclusionCriteria:["Uses CIFAR-10, CIFAR-10-C, augmentation robustness, or calibration methods relevant to the question"],exclusionCriteria:["No empirical or methodological connection to image classification robustness"],stopConditions:["Selected method and benchmark have full text plus at least two adjacent methods are screened"]});const protocol=draft.status==="frozen"?draft:synthesis.freezeSearchProtocol(programId,draft.id);
  const parsed=[];
  for(const item of records){const doc=await parseTextFile(join(root,"evidence",item.file),{id:item.id,title:item.title,authors:item.authors,year:item.year,abstract:"",identifiers:[...(item.arxiv?[{scheme:"arxiv" as const,value:item.arxiv,isCanonical:true,source:"arXiv"}]:[]),{scheme:"url" as const,value:item.url,isCanonical:!item.arxiv,source:"publisher"}],sourceUrl:item.url,accessUrl:item.url,accessStatus:"open",license:null,origin:"primary-source-download",accessedAt:new Date().toISOString()},{targetTokens:450,maxTokens:700});evidence.addCanonicalDocument(doc);synthesis.screen({searchProtocolId:protocol.id,sourceId:item.id,documentVersionId:doc.version.id,decision:"include",reason:"Primary full text is relevant to the benchmark, selected method, or adjacent method.",actor:"agent",sourceVersionHash:doc.version.contentHash});parsed.push({item,doc});}
  const map=synthesis.createEvidenceMap(programId,{searchProtocolId:protocol.id,coverageStatus:"incomplete",noveltyStatus:"unresolved",noveltyScope:null});
  for(const {item,doc} of parsed){const passage=doc.passages[0]!;synthesis.addEntry(map.id,{claimId:null,sourceId:item.id,passageId:passage.id,relation:item.critical?"premise_support":"background",topic:item.topic,summary:item.summary,evidenceLevel:"full_text",critical:item.critical});}
  synthesis.addGap(map.id,{kind:"coverage",description:"The bounded search establishes feasibility and prior overlap but is not a systematic novelty review.",severity:"medium",sourceId:null,resolved:false});
  const augmix=parsed.find(row=>row.item.id==="hendrycks-etal-2020-augmix")!;synthesis.addClosestWork(map.id,{sourceId:augmix.item.id,proposedClaim:"A bounded paired-seed evaluation of AugMix on a predeclared subset of CIFAR-10-C groups.",overlap:"The intervention and benchmark have already been published.",distinction:"This case validates the research pipeline and will make only a replication-style scoped claim.",evidencePassageIds:[augmix.doc.passages[0]!.id],status:"partial_overlap"});
  const frozen=synthesis.freezeEvidenceMap(programId,map.id);const artifact={programId,questionId,searchProtocol:protocol.id,evidenceMap:frozen.id,evidenceMapHash:frozen.contentHash,sources:parsed.map(row=>({id:row.item.id,version:row.doc.version.id,hash:row.doc.version.contentHash,passages:row.doc.passages.length}))};writeFileSync(join(root,"evidence-context.json"),JSON.stringify(artifact,null,2)+"\n");console.log(JSON.stringify(artifact,null,2));
}finally{synthesis.close();evidence.close();}
