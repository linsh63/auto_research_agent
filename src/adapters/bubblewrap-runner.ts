import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { restrictedExperimentEnv, runProcess, type ProcessOutput } from "./process.js";

export interface BubblewrapSpec {
  workspace:string; command:string; args:string[]; timeoutMs:number; env?:Record<string,string>;
  readOnlyMounts?:Array<{source:string;target:string}>; gpuDevice?:string; gpuEnumerationBridge?:boolean;
  maxProcesses?:number; maxAddressSpaceBytes?:number; maxCpuSeconds?:number; maxFileBytes?:number;
}

export interface RuntimePreflightCheck{name:string;status:"pass"|"fail";details:string}
export interface RuntimePreflight{status:"pass"|"fail";checks:RuntimePreflightCheck[];gpuDevice:string|null;devicePaths:string[]}

function requireAbsoluteExisting(path:string,label:string):string{const absolute=resolve(path);if(path!==absolute||!existsSync(absolute))throw new Error(`${label} must be an existing absolute path`);return absolute;}
function systemMount(path:string,args:string[]):void{if(existsSync(path))args.push("--ro-bind",path,path);}
export function gpuDevicePaths(device:string,enumerationBridge=false):string[]{if(!/^\d+$/.test(device))throw new Error("GPU device must be a numeric index");const selected=Number(device),paths=[`/dev/nvidia${selected}`,"/dev/nvidiactl","/dev/nvidia-uvm","/dev/nvidia-uvm-tools"];if(enumerationBridge)for(let index=0;index<selected;index+=1)paths.push(`/dev/nvidia${index}`);return[...new Set(paths)];}
export function preflightBubblewrap(spec:BubblewrapSpec):RuntimePreflight{const checks:RuntimePreflightCheck[]=[];const check=(name:string,condition:boolean,details:string)=>checks.push({name,status:condition?"pass":"fail",details});const mounts=spec.readOnlyMounts??[];const commandExists=existsSync(spec.command)||mounts.some(mount=>spec.command.startsWith(`${mount.target}/`)&&existsSync(`${mount.source}${spec.command.slice(mount.target.length)}`));check("workspace",spec.workspace===resolve(spec.workspace)&&existsSync(spec.workspace),spec.workspace);check("command",spec.command.startsWith("/")&&commandExists,spec.command);check("bubblewrap",existsSync("/usr/bin/bwrap"),"/usr/bin/bwrap");check("prlimit",existsSync("/usr/bin/prlimit"),"/usr/bin/prlimit");for(const mount of mounts)check(`mount:${mount.target}`,mount.source===resolve(mount.source)&&existsSync(mount.source)&&mount.target.startsWith("/data/"),mount.source);let devicePaths:string[]=[];if(spec.gpuDevice!==undefined){try{devicePaths=gpuDevicePaths(spec.gpuDevice,spec.gpuEnumerationBridge);for(const path of devicePaths){const optional=path==="/dev/nvidia-uvm-tools";check(`gpu:${path}`,optional||existsSync(path),optional&&!existsSync(path)?`${path} (optional and absent)`:path);}}catch(error){checks.push({name:"gpu:index",status:"fail",details:error instanceof Error?error.message:String(error)});}}return{status:checks.some(item=>item.status==="fail")?"fail":"pass",checks,gpuDevice:spec.gpuDevice??null,devicePaths};}
export function assertBubblewrapPreflight(result:RuntimePreflight):void{if(result.status==="fail")throw new Error(`Bubblewrap preflight failed: ${result.checks.filter(item=>item.status==="fail").map(item=>`${item.name}=${item.details}`).join(", ")}`);}

export function bubblewrapArgs(spec:BubblewrapSpec):string[]{
  const workspace=requireAbsoluteExisting(spec.workspace,"workspace");
  if(!spec.command.startsWith("/"))throw new Error("Bubblewrap command must be absolute");
  const safeEnv=restrictedExperimentEnv(spec.env??{});
  const args=["--unshare-user","--uid","0","--gid","0","--unshare-net","--die-with-parent","--new-session"];
  for(const path of ["/usr","/bin","/lib","/lib64"])systemMount(path,args);
  args.push("--proc","/proc","--dev","/dev","--tmpfs","/tmp","--dir","/home","--dir","/data","--bind",workspace,"/work","--chdir","/work","--clearenv","--setenv","PATH","/usr/bin:/bin","--setenv","HOME","/home/sandbox","--setenv","TMPDIR","/tmp");
  for(const [key,value] of Object.entries(safeEnv)){if(["PATH","HOME","TMPDIR"].includes(key))continue;args.push("--setenv",key,value!);}
  for(const mount of spec.readOnlyMounts??[]){const source=requireAbsoluteExisting(mount.source,"read-only mount");if(!mount.target.startsWith("/data/"))throw new Error("Read-only targets must be below /data");args.push("--ro-bind",source,mount.target);}
  if(spec.gpuDevice!==undefined){for(const device of gpuDevicePaths(spec.gpuDevice,spec.gpuEnumerationBridge)){if(existsSync(device))args.push("--dev-bind",device,device);}args.push("--setenv","CUDA_VISIBLE_DEVICES",spec.gpuDevice);}
  args.push("/usr/bin/prlimit",`--nproc=${spec.maxProcesses??128}`,"--",spec.command,...spec.args);return args;
}

export async function runBubblewrap(spec:BubblewrapSpec):Promise<ProcessOutput>{
  assertBubblewrapPreflight(preflightBubblewrap(spec));
  const limitArgs=[`--as=${spec.maxAddressSpaceBytes??8*1024**3}`,`--cpu=${spec.maxCpuSeconds??Math.max(1,Math.ceil(spec.timeoutMs/1000))}`,`--fsize=${spec.maxFileBytes??2*1024**3}`,"--","bwrap",...bubblewrapArgs(spec)];
  return runProcess("prlimit",limitArgs,{timeoutMs:spec.timeoutMs,maxOutputBytes:2_000_000});
}
