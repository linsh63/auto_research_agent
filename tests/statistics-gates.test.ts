import assert from "node:assert/strict";
import test from "node:test";
import { analyzePairedObservations } from "../src/adapters/statistics.js";
import { AnalysisPlanSchema, ObservationSchema, OutcomeDefinitionSchema } from "../src/domain/study.js";

const now=new Date(0).toISOString();
const outcome=OutcomeDefinitionSchema.parse({id:"outcome",studyId:"study",name:"accuracy",role:"primary",direction:"maximize",unit:"proportion",minimumMeaningfulEffect:.01,createdAt:now});
const plan=AnalysisPlanSchema.parse({id:"plan",studyId:"study",design:"seed_by_corruption",primaryOutcomeId:outcome.id,confidenceLevel:.95,multiplicityMethod:"holm",missingPolicy:"fail",outlierPolicy:"Retain all predeclared units.",status:"frozen",contentHash:"a".repeat(64),createdAt:now});

test("release statistics gates reject missing values and keep correlated groups within seed",()=>{
  const observations=[];
  for(const seed of [11,23,47])for(let group=0;group<20;group++){
    observations.push(ObservationSchema.parse({id:`b-${seed}-${group}`,studyId:"study",phase:"confirmation",variant:"baseline",seed,group:`g${group}`,outcomeId:outcome.id,value:.5,missingReason:null,runId:`b-${seed}`,createdAt:now}));
    observations.push(ObservationSchema.parse({id:`c-${seed}-${group}`,studyId:"study",phase:"confirmation",variant:"candidate",seed,group:`g${group}`,outcomeId:outcome.id,value:.5+seed/1000,missingReason:null,runId:`c-${seed}`,createdAt:now}));
  }
  const result=analyzePairedObservations(observations,plan,outcome);
  assert.equal(result.estimates[0]!.nUnits,3);
  assert.match(result.diagnostics.find(item=>item.name==="experimental_unit")!.details,/3 training seeds/);
  assert.equal(result.multiplicity[0]!.method,"holm");
  assert.equal(result.multiplicity[0]!.comparisons,20);
  const missing=[...observations,ObservationSchema.parse({id:"missing",studyId:"study",phase:"confirmation",variant:"candidate",seed:99,group:"g0",outcomeId:outcome.id,value:null,missingReason:"declared failure",runId:"missing",createdAt:now})];
  assert.throws(()=>analyzePairedObservations(missing,plan,outcome),/requires failure when observations are missing/);
});
