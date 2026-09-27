import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const hCaseRoot=resolve(".research-data/cases/cifar-h");
export const hCaseDb=join(hCaseRoot,"research.db");
export const hPythonEnv=resolve(process.env.H_PYTHON_ENV??"/data0/lixinyu/miniconda3/envs/sal");
export const hGpuDevice=process.env.H_GPU_DEVICE??"0";

export function readHArtifact<T=any>(name:string):T{
  return JSON.parse(readFileSync(join(hCaseRoot,name),"utf8")) as T;
}

export function hScopeContext(){
  const artifact=readHArtifact<{programId:string;candidates:Array<{id:string;intervention:string}>}>("scope-candidates-refined.json");
  const question=artifact.candidates.find(item=>/AugMix/i.test(item.intervention));
  if(!question)throw new Error("Refined scope artifact has no AugMix candidate");
  return{programId:artifact.programId,questionId:question.id};
}

export function hProtocolContext(){
  return readHArtifact<{programId:string;questionId:string;evidenceMapId:string;protocol:{id:string;hypothesisSetId:string}}>("protocol-draft.json");
}

export function hStudyContext(){
  return readHArtifact<{study:{id:string;programId:string;protocolId:string;hypothesisSetId:string;evidenceMapId:string}}>("study.json").study;
}
