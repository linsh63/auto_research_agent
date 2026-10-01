import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { runBubblewrap, type BubblewrapSpec } from "../adapters/bubblewrap-runner.js";
import { runProcess, type ProcessOutput } from "../adapters/process.js";
import type { JobArtifact, JobFailureClass, JobLease, WorkerDescriptor } from "../domain/job.js";
import { JobStore } from "../infrastructure/db/job-store.js";
import { ContentAddressedStore } from "../infrastructure/artifacts/content-store.js";
import type { PiJobRunner } from "./pi-job-runner.js";

type BubblewrapRunner=(spec:BubblewrapSpec)=>Promise<ProcessOutput>;
interface RunnerEvent{type:"started"|"log"|"completed"|"failed";stream?:"stdout"|"stderr";message?:string;failureClass?:JobFailureClass;exitCode?:number;durationMs?:number}

export interface LocalJobWorkerOptions{
  pythonExecutable?:string;pythonRunnerPath?:string;artifactRoot:string;piRunner?:PiJobRunner;bubblewrapRunner?:BubblewrapRunner;heartbeatIntervalMs?:number;
}

export class LocalJobWorker{
  private readonly artifacts:ContentAddressedStore;
  constructor(private readonly jobs:JobStore,readonly descriptor:WorkerDescriptor,private readonly options:LocalJobWorkerOptions){this.artifacts=new ContentAddressedStore(options.artifactRoot);}

  async runOnce():Promise<JobLease|null>{
    const lease=this.jobs.claim(this.descriptor);if(!lease)return null;const controller=new AbortController();let leaseFailure:Error|null=null;
    const heartbeatMs=this.options.heartbeatIntervalMs??Math.max(50,Math.floor(this.descriptor.leaseDurationMs/3));
    const timer=setInterval(()=>{try{const heartbeat=this.jobs.heartbeat({jobId:lease.job.id,attempt:lease.attempt,workerId:this.descriptor.workerId,leaseToken:lease.leaseToken,leaseDurationMs:this.descriptor.leaseDurationMs});if(heartbeat.cancelRequested)controller.abort();}catch(error){leaseFailure=error instanceof Error?error:new Error(String(error));controller.abort();}},heartbeatMs);
    try{
      const outcome=await this.execute(lease,controller.signal);clearInterval(timer);
      if(leaseFailure)throw leaseFailure;
      const finalHeartbeat=this.jobs.heartbeat({jobId:lease.job.id,attempt:lease.attempt,workerId:this.descriptor.workerId,leaseToken:lease.leaseToken,leaseDurationMs:this.descriptor.leaseDurationMs});
      if(finalHeartbeat.cancelRequested||controller.signal.aborted)return this.finishFailure(lease,"cancelled","Cancellation requested"),lease;
      if(outcome.failureClass)return this.finishFailure(lease,outcome.failureClass,outcome.message??"Job failed"),lease;
      const artifacts=this.collectArtifacts(lease);
      this.jobs.complete({jobId:lease.job.id,attempt:lease.attempt,workerId:this.descriptor.workerId,leaseToken:lease.leaseToken,artifacts});return lease;
    }catch(error){clearInterval(timer);try{this.finishFailure(lease,controller.signal.aborted?"cancelled":"environment",error instanceof Error?error.message:String(error));}catch{}return lease;}
  }

  private async execute(lease:JobLease,signal:AbortSignal):Promise<{failureClass?:JobFailureClass;message?:string}>{
    const execution=lease.job.spec.execution,emit=(stream:"stdout"|"stderr"|"progress",message:string,data?:unknown)=>this.jobs.appendLog({jobId:lease.job.id,attempt:lease.attempt,workerId:this.descriptor.workerId,leaseToken:lease.leaseToken,stream,message,data});
    if(execution.kind==="pi"){
      if(!this.options.piRunner)return{failureClass:"environment",message:"Pi executor is not configured on this worker"};
      const result=await this.options.piRunner.run(lease,signal,emit);emit("progress","Pi session completed",result);return{};
    }
    if(execution.kind==="bubblewrap"){
      const runner=this.options.bubblewrapRunner??runBubblewrap,output=await runner({workspace:execution.workspace,command:execution.command,args:execution.args,env:execution.env,readOnlyMounts:lease.authorizedMounts,timeoutMs:lease.job.spec.limits.wallTimeMs,gpuDevices:lease.allocatedGpuDevices,maxCpuSeconds:lease.job.spec.limits.cpuTimeSeconds,maxAddressSpaceBytes:lease.job.spec.resources.memoryMiB*1024**2,maxFileBytes:lease.job.spec.limits.maxArtifactBytes,signal,onStdout:chunk=>emit("stdout",chunk),onStderr:chunk=>emit("stderr",chunk)});
      if(output.cancelled)return{failureClass:"cancelled",message:"Bubblewrap job was cancelled"};if(output.timedOut)return{failureClass:"timeout",message:"Bubblewrap job exceeded wall time"};if(output.exitCode!==0)return{failureClass:"scientific",message:`Bubblewrap job exited with code ${output.exitCode}`};return{};
    }
    const events:RunnerEvent[]=[],consume=this.lineConsumer(line=>{let event:RunnerEvent;try{event=JSON.parse(line) as RunnerEvent;}catch{emit("stderr",`Invalid Python worker event: ${line}`);return;}events.push(event);if(event.type==="log"&&event.stream)emit(event.stream,event.message??"");else if(event.type==="started")emit("progress","Python worker started");});
    const request={protocolVersion:"1",jobId:lease.job.id,attempt:lease.attempt,execution,limits:lease.job.spec.limits,resources:lease.job.spec.resources,allocatedGpuDevices:lease.allocatedGpuDevices};
    const output=await runProcess(this.options.pythonExecutable??"python3",[this.options.pythonRunnerPath??resolve("python/worker/runner.py")],{stdin:JSON.stringify(request),timeoutMs:lease.job.spec.limits.wallTimeMs+2000,maxOutputBytes:lease.job.spec.limits.maxOutputBytes*2,signal,onStdout:consume,onStderr:chunk=>emit("stderr",chunk)});consume("");
    if(output.cancelled)return{failureClass:"cancelled",message:"Python job was cancelled"};if(output.timedOut)return{failureClass:"timeout",message:"Python worker host exceeded wall time"};const reversed=[...events].reverse(),failed=reversed.find(event=>event.type==="failed"),completed=reversed.find(event=>event.type==="completed");if(failed)return{failureClass:failed.failureClass??"environment",message:failed.message??"Python worker failed"};if(!completed)return{failureClass:"environment",message:`Python worker ended without completion event (exit ${output.exitCode})`};return{};
  }

  private collectArtifacts(lease:JobLease):Array<Omit<JobArtifact,"id"|"jobId"|"attempt"|"createdAt">>{const execution=lease.job.spec.execution;if(execution.kind==="pi")return[];const workspace=resolve(execution.workspace),result:Array<Omit<JobArtifact,"id"|"jobId"|"attempt"|"createdAt">>=[];let total=0;for(const name of execution.artifactPaths){const path=resolve(workspace,name),rel=relative(workspace,path);if(rel.startsWith("..")||isAbsolute(rel))throw new Error(`Artifact path escapes workspace: ${name}`);const bytes=statSync(path).size;total+=bytes;if(total>lease.job.spec.limits.maxArtifactBytes)throw new Error("Artifact byte limit exceeded");const stored=this.artifacts.put(readFileSync(path));result.push({name,mediaType:"application/octet-stream",contentHash:stored.hash,bytes,uri:`cas:sha256:${stored.hash}`,access:"project"});}return result;}
  private finishFailure(lease:JobLease,failureClass:JobFailureClass,message:string):void{this.jobs.fail({jobId:lease.job.id,attempt:lease.attempt,workerId:this.descriptor.workerId,leaseToken:lease.leaseToken,failureClass,message});}
  private lineConsumer(onLine:(line:string)=>void):(chunk:string)=>void{let buffer="";return chunk=>{buffer+=chunk;const lines=buffer.split("\n");buffer=lines.pop()??"";for(const line of lines)if(line.trim())onLine(line);if(chunk===""&&buffer.trim()){onLine(buffer);buffer="";}};}
}
