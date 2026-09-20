import { randomUUID } from "node:crypto";
import {
  AnalysisRunSchema, DiagnosticResultSchema, MultiplicityRecordSchema, SensitivityAnalysisSchema, StatisticalEstimateSchema,
  type AnalysisPlan, type AnalysisRun, type DiagnosticResult, type MultiplicityRecord, type Observation,
  type OutcomeDefinition, type SensitivityAnalysis, type StatisticalEstimate,
} from "../domain/study.js";
import { hashPayload } from "../domain/research.js";

export interface StatisticalAnalysisResult { run: AnalysisRun; estimates: StatisticalEstimate[]; diagnostics: DiagnosticResult[]; multiplicity: MultiplicityRecord[]; sensitivity: SensitivityAnalysis[]; }

function mean(values:number[]):number{return values.reduce((a,b)=>a+b,0)/values.length;}
function sampleSd(values:number[]):number{return values.length<2?0:Math.sqrt(values.reduce((sum,value)=>sum+(value-mean(values))**2,0)/(values.length-1));}
function tCritical95(df:number):number{const table=[12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];return df<=30?table[Math.max(0,df-1)]!:1.96;}
function erf(x:number):number{const sign=x<0?-1:1;const a=Math.abs(x);const t=1/(1+0.3275911*a);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-a*a);return sign*y;}
function normalTwoSided(z:number):number{return Math.max(0,Math.min(1,1-erf(Math.abs(z)/Math.sqrt(2))));}
function holm(values:number[]):number[]{const indexed=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);const out=new Array(values.length).fill(0);let previous=0;for(let rank=0;rank<indexed.length;rank++){const adjusted=Math.max(previous,Math.min(1,indexed[rank]!.value*(indexed.length-rank)));out[indexed[rank]!.index]=adjusted;previous=adjusted;}return out;}

export function analyzePairedObservations(observations: Observation[], plan: AnalysisPlan, outcome: OutcomeDefinition): StatisticalAnalysisResult {
  const relevant=observations.filter(item=>item.outcomeId===outcome.id&&item.phase==="confirmation");
  const missing=relevant.filter(item=>item.value===null);
  if(missing.length&&plan.missingPolicy==="fail")throw new Error("Analysis plan requires failure when observations are missing");
  const byKey=new Map<string,{seed:number;group:string|null;baseline?:number;candidate?:number}>();
  for(const item of relevant){if(item.value===null)continue;const key=`${item.seed}|${item.group??""}`;const row=byKey.get(key)??{seed:item.seed,group:item.group};row[item.variant]=item.value;byKey.set(key,row);}
  const pairs=[...byKey.values()].filter((row):row is {seed:number;group:string|null;baseline:number;candidate:number}=>row.baseline!==undefined&&row.candidate!==undefined);
  if(!pairs.length)throw new Error("No complete baseline/candidate pairs for analysis");
  const bySeed=new Map<number,number[]>();for(const pair of pairs)bySeed.set(pair.seed,[...(bySeed.get(pair.seed)??[]),pair.candidate-pair.baseline]);
  const unitDifferences=[...bySeed.values()].map(mean);if(unitDifferences.length<2)throw new Error("At least two independent training seeds are required");
  const estimate=mean(unitDifferences),sd=sampleSd(unitDifferences),se=sd/Math.sqrt(unitDifferences.length),critical=tCritical95(unitDifferences.length-1);
  const now=new Date().toISOString();const runId=`analysis-${randomUUID()}`;
  const run=AnalysisRunSchema.parse({id:runId,studyId:plan.studyId,analysisPlanId:plan.id,design:plan.design,status:"completed",inputHash:hashPayload(relevant),implementation:"typescript-paired-v1",createdAt:now});
  const estimates:StatisticalEstimate[]=[StatisticalEstimateSchema.parse({id:`estimate-${randomUUID()}`,analysisRunId:runId,outcomeId:outcome.id,estimand:"candidate_minus_baseline_by_training_seed",estimate,standardError:se,intervalLow:estimate-critical*se,intervalHigh:estimate+critical*se,effectSize:sd===0?null:estimate/sd,method:plan.design==="paired_repeated_run"?"paired seed mean with t interval":"seed-level mean across corruption groups with t interval",nUnits:unitDifferences.length,createdAt:now})];
  const diagnostics:DiagnosticResult[]=[
    DiagnosticResultSchema.parse({id:`diagnostic-${randomUUID()}`,analysisRunId:runId,name:"pair_completeness",status:missing.length?"warn":"pass",details:`${pairs.length} complete pairs; ${missing.length} missing observations.`,createdAt:now}),
    DiagnosticResultSchema.parse({id:`diagnostic-${randomUUID()}`,analysisRunId:runId,name:"experimental_unit",status:"pass",details:`Inference uses ${unitDifferences.length} training seeds as independent units; corruption groups are repeated measures.`,createdAt:now}),
    DiagnosticResultSchema.parse({id:`diagnostic-${randomUUID()}`,analysisRunId:runId,name:"small_sample",status:unitDifferences.length<5?"warn":"pass",details:`Independent seed count is ${unitDifferences.length}.`,createdAt:now}),
  ];
  const multiplicity:MultiplicityRecord[]=[];
  if(plan.design==="seed_by_corruption"){
    const groups=[...new Set(pairs.map(item=>item.group??"ungrouped"))];const pValues=groups.map(group=>{const values=pairs.filter(item=>(item.group??"ungrouped")===group).map(item=>item.candidate-item.baseline);const groupSe=sampleSd(values)/Math.sqrt(values.length);return groupSe===0?(mean(values)===0?1:0):normalTwoSided(mean(values)/groupSe);});
    multiplicity.push(MultiplicityRecordSchema.parse({id:`multiplicity-${randomUUID()}`,analysisRunId:runId,family:"corruption_groups",comparisons:groups.length,method:plan.multiplicityMethod,adjustedValues:plan.multiplicityMethod==="holm"?holm(pValues):pValues,createdAt:now}));
  }
  const leaveOneOut=unitDifferences.map((_,index)=>mean(unitDifferences.filter((__,other)=>other!==index)));
  const sensitivity=[SensitivityAnalysisSchema.parse({id:`sensitivity-${randomUUID()}`,analysisRunId:runId,name:"leave_one_seed_out",estimates:leaveOneOut,conclusionStable:leaveOneOut.every(value=>Math.sign(value)===Math.sign(estimate)||value===0),createdAt:now})];
  return{run,estimates,diagnostics,multiplicity,sensitivity};
}
