import type {
  AnalysisContract, DataContract, EvaluationContract, ResearchScenario, ScenarioContext, ScenarioManifest,
} from "research-explorer-core/scenario";

export const manifest:ScenarioManifest={
  id:"example.public-typescript",name:"Public TypeScript fixture",version:"1.0.0",description:"A public-only Scenario SDK fixture.",domain:"testing",
  scenarioSdkVersion:"1.0.0",coreSchemaRange:"^1.0.0",languages:["typescript"],executors:["python"],permissions:["filesystem.read","process"],
  budget:{maxWallTimeMs:1000,maxCpuCores:1,maxMemoryMiB:256,maxDiskMiB:256,maxGpuCount:0,maxKnownCostUsd:0},
  capabilities:[
    {id:"data",kind:"data",description:"Describe fixture data",permissions:["filesystem.read"],inputSchema:{},outputSchema:{},failureClasses:["data"]},
    {id:"experiment",kind:"experiment",description:"Create fixture Job",permissions:["process"],inputSchema:{},outputSchema:{},failureClasses:["scientific"]},
    {id:"evaluation",kind:"evaluation",description:"Score fixture output",permissions:[],inputSchema:{},outputSchema:{},failureClasses:["data"]},
    {id:"analysis",kind:"analysis",description:"Analyze fixture scores",permissions:[],inputSchema:{},outputSchema:{},failureClasses:["scientific"]},
  ],artifacts:[{name:"result.json",mediaType:"application/json",required:true,maxBytes:10000,access:"project"}],
};

export const scenario:ResearchScenario={manifest,
  data:{async describe(_input:unknown,_context:ScenarioContext):Promise<DataContract>{return{datasetId:"fixture",manifestHash:"a".repeat(64),roles:[{role:"train",uri:"fixture://train",sealed:false,contentHash:"b".repeat(64)}],experimentalUnit:{kind:"case",idField:"id",clusterField:null}};}},
  experiments:{async createJob(){return{name:"fixture",dataRole:"exploration",studyId:null,execution:{kind:"python",workspace:"/tmp",script:"run.py",args:[],env:{},artifactPaths:["result.json"]},resources:{cpuCores:1,memoryMiB:128,diskMiB:128,gpuCount:0},limits:{wallTimeMs:1000,cpuTimeSeconds:1,maxOutputBytes:10000,maxArtifactBytes:10000},priority:0,resumable:true,maxAttempts:1};}},
  evaluator:{async evaluate():Promise<EvaluationContract[]>{return[{metric:"score",direction:"maximize",value:1,missingReason:null,unitId:"case-1",group:null,artifactHashes:[]}] ;}},
  analyzer:{async analyze():Promise<AnalysisContract>{return{estimand:"mean score",clusterUnit:"case",method:"identity",estimate:1,interval:null,sensitivity:[],artifactHashes:[]};}},
};
