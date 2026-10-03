#!/usr/bin/env node
import { createInterface } from "node:readline";
import { arch,platform } from "node:os";
import { createHash } from "node:crypto";
import { createReadStream,existsSync,lstatSync,readFileSync,realpathSync,readdirSync,statSync } from "node:fs";
import { resolve,relative,isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn,spawnSync } from "node:child_process";

const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]},expectedHash=value("--content-hash"),remoteRoot=value("--remote-root"),hash=createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");
if(!args.includes("--stdio")||!/^[a-f0-9]{64}$/.test(expectedHash??"")||expectedHash!==hash||!safeAbsolute(remoteRoot)){process.stderr.write("fixed stdio launcher arguments, content hash, or remote root are invalid\n");process.exit(2);}
const sessions=new Set(),running=new Map(),emit=value=>process.stdout.write(`${JSON.stringify(value)}\n`),probe=command=>spawnSync(command,["--version"],{encoding:"utf8"});
const bwrap=probe("bwrap"),python=probe("python3"),prlimit=probe("prlimit");
const gpuDevices=existsSync("/dev")?readdirSync("/dev").flatMap(name=>/^nvidia(\d+)$/.exec(name)?.[1]??[]):[];
emit({type:"hello",protocolVersion:"1",contentHash:hash,platform:{os:platform(),arch:arch(),nodeVersion:process.version,pythonVersion:python.status===0?(python.stdout||python.stderr).trim():null,executors:{bubblewrap:bwrap.status===0,python:python.status===0},resourceLimits:prlimit.status===0,gpuDevices,storageModes:["cas_sync","remote_existing"]}});
createInterface({input:process.stdin,crlfDelay:Infinity}).on("line",line=>{let frame;try{frame=JSON.parse(line);}catch{emit({type:"error",code:"invalid_json"});return;}void dispatch(frame).catch(error=>emit({type:"error",code:"execution_error",requestId:frame?.requestId??null,message:error instanceof Error?error.message:String(error)}));});

async function dispatch(frame){
  if(frame.type==="ping")return emit({type:"pong",requestId:frame.requestId});
  if(frame.type==="lease.open"&&typeof frame.leaseId==="string"){sessions.add(frame.leaseId);return emit({type:"lease.accepted",leaseId:frame.leaseId});}
  if(frame.type==="lease.heartbeat"&&sessions.has(frame.leaseId))return emit({type:"lease.heartbeat",leaseId:frame.leaseId});
  if(frame.type==="lease.log"&&sessions.has(frame.leaseId))return emit({type:"lease.log",leaseId:frame.leaseId,stream:frame.stream??"progress",message:String(frame.message??"")});
  if(frame.type==="lease.cancel"&&sessions.has(frame.leaseId)){const child=running.get(frame.leaseId);if(child)try{process.kill(-child.pid,"SIGTERM");}catch{}sessions.delete(frame.leaseId);return emit({type:"lease.cancelled",leaseId:frame.leaseId});}
  if(frame.type==="job.execute"&&sessions.has(frame.leaseId))return execute(frame);
  if(frame.type==="shutdown"){for(const child of running.values())try{process.kill(-child.pid,"SIGTERM");}catch{}emit({type:"shutdown"});return process.exit(0);}
  emit({type:"error",code:"invalid_state",requestId:frame.requestId??null});
}

async function execute(frame){
  const spec=validateExecution(frame),started=Date.now(),limitArgs=[`--as=${spec.resources.memoryMiB*1024**2}`,`--cpu=${spec.limits.cpuTimeSeconds}`,`--fsize=${spec.limits.maxArtifactBytes}`,"--","bwrap","--unshare-user","--uid","0","--gid","0","--unshare-net","--die-with-parent","--new-session"];
  for(const path of ["/usr","/bin","/lib","/lib64"])if(existsSync(path))limitArgs.push("--ro-bind",path,path);
  limitArgs.push("--proc","/proc","--dev","/dev","--tmpfs","/tmp","--dir","/home","--dir","/data","--bind",spec.workspace,"/work","--chdir","/work","--clearenv","--setenv","PATH","/usr/bin:/bin","--setenv","HOME","/home/sandbox","--setenv","TMPDIR","/tmp");
  for(const [key,value] of Object.entries(spec.execution.env??{})){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)||["PATH","HOME","TMPDIR"].includes(key)||/[\0\r\n]/.test(value))continue;limitArgs.push("--setenv",key,value);}
  for(const mount of spec.mounts)limitArgs.push("--ro-bind",mount.source,mount.target);
  for(const device of spec.gpuDevices){for(const path of [`/dev/nvidia${device}`,"/dev/nvidiactl","/dev/nvidia-uvm","/dev/nvidia-uvm-tools"])if(existsSync(path))limitArgs.push("--dev-bind",path,path);}
  if(spec.gpuDevices.length)limitArgs.push("--setenv","CUDA_VISIBLE_DEVICES",spec.gpuDevices.join(","));
  const command=spec.execution.kind==="python"?"/usr/bin/python3":spec.execution.command,commandArgs=spec.execution.kind==="python"?[`/work/${spec.execution.script}`,...spec.execution.args]:spec.execution.args;
  limitArgs.push("/usr/bin/prlimit","--nproc=128","--",command,...commandArgs);
  emit({type:"job.started",leaseId:frame.leaseId});const child=spawn("prlimit",limitArgs,{stdio:["ignore","pipe","pipe"],detached:true}),timer=setTimeout(()=>{try{process.kill(-child.pid,"SIGKILL");}catch{}},spec.limits.wallTimeMs);running.set(frame.leaseId,child);
  let outputBytes=0,overflow=false;const consume=(stream,chunk)=>{if(overflow)return;outputBytes+=chunk.length;if(outputBytes>spec.limits.maxOutputBytes){overflow=true;try{process.kill(-child.pid,"SIGKILL");}catch{};return;}emit({type:"job.log",leaseId:frame.leaseId,stream,message:chunk.toString("utf8")});};child.stdout.on("data",chunk=>consume("stdout",chunk));child.stderr.on("data",chunk=>consume("stderr",chunk));
  const result=await new Promise(resolveResult=>child.once("close",(code,signal)=>resolveResult({code,signal})));clearTimeout(timer);running.delete(frame.leaseId);if(!sessions.has(frame.leaseId))return;
  const usage={durationMs:Date.now()-started,outputBytes,gpuDevices:spec.gpuDevices};if(overflow)return emit({type:"job.failed",leaseId:frame.leaseId,failureClass:"budget",message:"Remote output byte limit exceeded",resourceUsage:usage});if(usage.durationMs>=spec.limits.wallTimeMs&&result.signal)return emit({type:"job.failed",leaseId:frame.leaseId,failureClass:"timeout",message:"Remote wall time exceeded",resourceUsage:usage});if(result.code!==0)return emit({type:"job.failed",leaseId:frame.leaseId,failureClass:"scientific",message:`Remote process exited with code ${result.code}`,resourceUsage:usage});
  const artifacts=[];let total=0;for(const output of spec.outputs){const path=inside(spec.workspace,output.path);if(!existsSync(path)||!lstatSync(path).isFile())throw new Error(`Declared output is not a regular file: ${output.path}`);const real=realpathSync(path);assertInside(spec.workspace,real);const bytes=statSync(real).size;total+=bytes;if(bytes>output.maxBytes||total>spec.limits.maxArtifactBytes)throw new Error("Artifact byte limit exceeded");artifacts.push({...output,bytes,contentHash:await sha256(real),remotePath:real});}
  sessions.delete(frame.leaseId);emit({type:"job.completed",leaseId:frame.leaseId,artifacts,resourceUsage:usage});
}

function validateExecution(frame){
  if(typeof frame.leaseId!=="string"||!frame.spec||!safeAbsolute(frame.spec.workspace))throw new Error("Invalid remote execution frame");assertInside(resolve(remoteRoot,"jobs"),frame.spec.workspace);if(!existsSync(frame.spec.workspace))throw new Error("Remote workspace is missing");const execution=frame.spec.execution;if(!execution||!["python","bubblewrap"].includes(execution.kind)||!Array.isArray(execution.args)||execution.args.some(item=>typeof item!=="string"))throw new Error("Unsupported remote execution");if(execution.kind==="python")inside(frame.spec.workspace,execution.script);else if(typeof execution.command!=="string"||!execution.command.startsWith("/"))throw new Error("Bubblewrap command must be absolute");
  const mounts=Array.isArray(frame.spec.mounts)?frame.spec.mounts:[];for(const mount of mounts){if(!safeAbsolute(mount.source)||!/^\/data\/[A-Za-z0-9._/-]+$/.test(mount.target)||mount.target.split("/").includes(".."))throw new Error("Invalid remote read-only mount");assertInside(resolve(remoteRoot,"data"),mount.source);if(!existsSync(mount.source))throw new Error("Remote data alias is missing");}const outputs=Array.isArray(frame.spec.outputs)?frame.spec.outputs:[];for(const output of outputs){inside(frame.spec.workspace,output.path);if(typeof output.maxBytes!=="number"||output.maxBytes<1)throw new Error("Invalid output declaration");}
  const limits=frame.spec.limits,resources=frame.spec.resources;if(!limits||!resources||![limits.wallTimeMs,limits.cpuTimeSeconds,limits.maxOutputBytes,limits.maxArtifactBytes,resources.memoryMiB].every(Number.isFinite))throw new Error("Invalid remote limits");const gpuDevices=Array.isArray(frame.spec.gpuDevices)?frame.spec.gpuDevices:[];if(gpuDevices.some(value=>!/^\d+$/.test(value)))throw new Error("Invalid GPU allocation");return{workspace:frame.spec.workspace,execution,mounts,outputs,limits,resources,gpuDevices};
}
function safeAbsolute(value){return typeof value==="string"&&/^\/[A-Za-z0-9._/-]+$/.test(value)&&!value.split("/").includes("..");}
function assertInside(root,path){const rel=relative(resolve(root),resolve(path));if(rel.startsWith("..")||isAbsolute(rel))throw new Error("Path escapes the authorized remote root");}
function inside(root,path){if(typeof path!=="string"||/[\0\r\n]/.test(path)||path.startsWith("/")||path.startsWith("\\")||/^[A-Za-z]:/.test(path)||path.split(/[\\/]/).some(part=>part===".."||part===""))throw new Error("Invalid portable relative path");const result=resolve(root,path);assertInside(root,result);return result;}
async function sha256(path){const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest("hex");}
