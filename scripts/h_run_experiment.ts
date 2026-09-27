import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { runBubblewrap } from "../src/adapters/bubblewrap-runner.js";
import { StudyStore } from "../src/infrastructure/db/study-store.js";
import { hashPayload } from "../src/domain/research.js";
import { hCaseDb, hCaseRoot, hGpuDevice, hPythonEnv, hStudyContext } from "./h_case_context.js";

const [variant,seedText]=process.argv.slice(2);if(!["baseline","augmix"].includes(variant??"")||!["11","23","47"].includes(seedText??""))throw new Error("usage: h_run_experiment.ts <baseline|augmix> <11|23|47>");
const root=hCaseRoot,studyId=hStudyContext().id,workspace=join(root,"sandboxes",`${variant}-seed${seedText}`);mkdirSync(workspace,{recursive:true});
const args=["/data/project/examples/cifar-h/experiment-exploration-frozen.py","--data","/data/input","--variant",variant!,"--seed",seedText!,"--epochs","12","--output",`/work/${variant}-seed${seedText}.json`];
const started=Date.now();const output=await runBubblewrap({workspace,command:"/data/python/bin/python",args,timeoutMs:3*60*60*1000,env:{LD_LIBRARY_PATH:"/data/python/lib",OMP_NUM_THREADS:"4",MKL_NUM_THREADS:"4",OPENBLAS_NUM_THREADS:"4"},readOnlyMounts:[{source:resolve("."),target:"/data/project"},{source:join(root,"data/prepared/exploration"),target:"/data/input"},{source:hPythonEnv,target:"/data/python"}],gpuDevice:hGpuDevice,maxProcesses:256,maxAddressSpaceBytes:64*1024**3,maxCpuSeconds:3*60*60,maxFileBytes:2*1024**3});
const studies=await StudyStore.open(hCaseDb);try{const run=studies.recordSandboxRun({studyId,backend:"bubblewrap",status:output.timedOut?"timed_out":output.exitCode===0?"succeeded":"failed",commandHash:hashPayload({args,variant,seed:seedText}),exitCode:output.exitCode,timedOut:output.timedOut,durationMs:output.durationMs,gpuDevice:hGpuDevice,artifactHashes:[]});studies.recordResourceUsage({studyId,runId:run.id,kind:variant==="baseline"?"baseline":"exploration",wallMs:Date.now()-started,cpuSeconds:null,gpuSeconds:output.durationMs/1000,peakMemoryBytes:null,diskBytes:null,costUsd:0});console.log(JSON.stringify({workspace,run,output},null,2));}finally{studies.close();}
