import { BoundedExperimentSearch, type CandidateRunner } from "./experiment-search.js";
import { analyzePairedObservations, type StatisticalAnalysisResult } from "../adapters/statistics.js";
import { runBubblewrap, type BubblewrapSpec } from "../adapters/bubblewrap-runner.js";
import { hashPayload } from "../domain/research.js";
import type { SearchBudget, SearchNode } from "../domain/search.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import { SearchStore } from "../infrastructure/db/search-store.js";
import { StudyStore } from "../infrastructure/db/study-store.js";

export class StudyWorkflow {
  private readonly search: BoundedExperimentSearch;
  constructor(readonly studies: StudyStore, readonly searches: SearchStore, readonly research: ResearchStore) { this.search=new BoundedExperimentSearch(searches); }

  async runExploration(input:{studyId:string;strategy:"linear"|"best-first";candidates:Array<Record<string,unknown>>;budget:SearchBudget;runner:CandidateRunner;direction?:"maximize"|"minimize"}):Promise<SearchNode[]>{
    const study=this.studies.beginExploration(input.studyId);const hypothesis=this.research.getHypothesisSet(study.hypothesisSetId);
    return this.search.run({strategy:input.strategy,candidates:input.candidates,budget:input.budget,runner:input.runner,direction:input.direction,context:{protocolId:study.protocolId,hypothesisSetId:study.hypothesisSetId,predictionIds:hypothesis.hypotheses.flatMap(item=>item.discriminatingObservations)}});
  }

  freezeBestCandidate(studyId:string,searchRunId:string,nodeId:string,input:{codeHash:string;configHash:string}){
    const study=this.studies.getStudy(studyId);const protocol=this.research.getProtocol(study.protocolId);const plan=this.studies.getAnalysisPlan(studyId);
    return this.studies.freezeCandidate(studyId,{searchRunId,nodeId,protocolHash:protocol.contentHash,analysisPlanHash:plan.contentHash,codeHash:input.codeHash,configHash:input.configHash,dataManifestHash:this.studies.dataManifestHash(studyId)});
  }

  analyzeConfirmation(studyId:string):StatisticalAnalysisResult{
    const plan=this.studies.getAnalysisPlan(studyId);const outcome=this.studies.outcomes(studyId).find(item=>item.id===plan.primaryOutcomeId)!;const observations=this.studies.observations(studyId,"confirmation");
    const result=analyzePairedObservations(observations,plan,outcome);this.studies.recordAnalysis(studyId,result);return result;
  }

  async runSandbox(studyId:string,spec:BubblewrapSpec&{purpose?:"general"|"baseline"|"exploration"|"confirmation"}){
    this.studies.getStudy(studyId);if(spec.readOnlyMounts?.length)throw new Error("Study sandbox mounts are derived from unsealed data roles");const readOnlyMounts=this.studies.dataRoles(studyId).map(role=>({source:role.path,target:`/data/${role.role}`})),{purpose="general",...runSpec}=spec,output=await runBubblewrap({...runSpec,readOnlyMounts}),gpuList=spec.gpuDevices??(spec.gpuDevice===undefined?[]:[spec.gpuDevice]);const run=this.studies.recordSandboxRun({studyId,backend:"bubblewrap",purpose,status:output.timedOut?"timed_out":output.exitCode===0?"succeeded":"failed",commandHash:hashPayload({command:spec.command,args:spec.args,workspace:spec.workspace}),exitCode:output.exitCode,timedOut:output.timedOut,durationMs:output.durationMs,gpuDevice:gpuList.length?gpuList.join(","):null,artifactHashes:[]});this.studies.recordResourceUsage({studyId,runId:run.id,kind:"sandbox",wallMs:output.durationMs,cpuSeconds:null,gpuSeconds:gpuList.length?output.durationMs/1000*gpuList.length:null,peakMemoryBytes:null,diskBytes:null,costUsd:0});return{output,run};
  }
}
