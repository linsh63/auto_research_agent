import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePairedObservations } from "../src/adapters/statistics.js";
import { AnalysisPlanSchema, ObservationSchema, OutcomeDefinitionSchema } from "../src/domain/study.js";
const fixture=JSON.parse(readFileSync(resolve("benchmarks/statistics/fixture.json"),"utf8")) as {seeds:number[];groups:string[];differences:Record<string,number>};
const oracle=JSON.parse(readFileSync(resolve("benchmarks/statistics/oracle.json"),"utf8")) as Record<string,number|number[]>;
const outcome=OutcomeDefinitionSchema.parse({id:"outcome",studyId:"study",name:"robust_accuracy",role:"primary",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:.01,createdAt:new Date(0).toISOString()});
const observations=fixture.seeds.flatMap(seed=>fixture.groups.flatMap(group=>[
  ObservationSchema.parse({id:`b-${seed}-${group}`,studyId:"study",phase:"confirmation",variant:"baseline",seed,group,outcomeId:outcome.id,value:.5,missingReason:null,runId:`b-${seed}-${group}`,createdAt:new Date(0).toISOString()}),
  ObservationSchema.parse({id:`c-${seed}-${group}`,studyId:"study",phase:"confirmation",variant:"candidate",seed,group,outcomeId:outcome.id,value:.5+fixture.differences[String(seed)]!,missingReason:null,runId:`c-${seed}-${group}`,createdAt:new Date(0).toISOString()}),
]));
const plan=AnalysisPlanSchema.parse({id:"plan",studyId:"study",design:"seed_by_corruption",primaryOutcomeId:outcome.id,confidenceLevel:.95,multiplicityMethod:"holm",missingPolicy:"fail",outlierPolicy:"Retain all predeclared observations.",status:"frozen",contentHash:"a".repeat(64),createdAt:new Date(0).toISOString()});
const result=analyzePairedObservations(observations,plan,outcome);const estimate=result.estimates[0]!;
const checks={meanDifference:Math.abs(estimate.estimate-(oracle.meanDifference as number)),standardError:Math.abs(estimate.standardError!-(oracle.standardError as number)),intervalLow:Math.abs(estimate.intervalLow!-(oracle.intervalLow as number)),intervalHigh:Math.abs(estimate.intervalHigh!-(oracle.intervalHigh as number)),effectSize:Math.abs(estimate.effectSize!-(oracle.pairedEffectSize as number)),multiplicity:Math.max(...result.multiplicity[0]!.adjustedValues.map((value,index)=>Math.abs(value-(oracle.holmAdjusted as number[])[index]!)))};
console.log(JSON.stringify({checks,estimate,multiplicity:result.multiplicity,sensitivity:result.sensitivity},null,2));
if(Object.entries(checks).some(([name,value])=>value>(name==="multiplicity"?1e-6:1e-4)))process.exitCode=1;
