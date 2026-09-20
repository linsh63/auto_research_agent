import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { restrictedExperimentEnv, runProcess, type ProcessOutput } from "./process.js";

export interface BubblewrapSpec {
  workspace:string; command:string; args:string[]; timeoutMs:number; env?:Record<string,string>;
  readOnlyMounts?:Array<{source:string;target:string}>; gpuDevice?:string;
  maxProcesses?:number; maxAddressSpaceBytes?:number; maxCpuSeconds?:number; maxFileBytes?:number;
}

function requireAbsoluteExisting(path:string,label:string):string{const absolute=resolve(path);if(path!==absolute||!existsSync(absolute))throw new Error(`${label} must be an existing absolute path`);return absolute;}
function systemMount(path:string,args:string[]):void{if(existsSync(path))args.push("--ro-bind",path,path);}

export function bubblewrapArgs(spec:BubblewrapSpec):string[]{
  const workspace=requireAbsoluteExisting(spec.workspace,"workspace");
  if(!spec.command.startsWith("/"))throw new Error("Bubblewrap command must be absolute");
  const safeEnv=restrictedExperimentEnv(spec.env??{});
  const args=["--unshare-user","--uid","0","--gid","0","--unshare-net","--die-with-parent","--new-session"];
  for(const path of ["/usr","/bin","/lib","/lib64"])systemMount(path,args);
  args.push("--proc","/proc","--dev","/dev","--tmpfs","/tmp","--dir","/home","--dir","/data","--bind",workspace,"/work","--chdir","/work","--clearenv","--setenv","PATH","/usr/bin:/bin","--setenv","HOME","/home/sandbox","--setenv","TMPDIR","/tmp");
  for(const [key,value] of Object.entries(safeEnv)){if(["PATH","HOME","TMPDIR"].includes(key))continue;args.push("--setenv",key,value!);}
  for(const mount of spec.readOnlyMounts??[]){const source=requireAbsoluteExisting(mount.source,"read-only mount");if(!mount.target.startsWith("/data/"))throw new Error("Read-only targets must be below /data");args.push("--ro-bind",source,mount.target);}
  if(spec.gpuDevice!==undefined){if(!/^\d+$/.test(spec.gpuDevice))throw new Error("GPU device must be a numeric index");for(const device of [`/dev/nvidia${spec.gpuDevice}`,"/dev/nvidiactl","/dev/nvidia-uvm","/dev/nvidia-uvm-tools"]){if(existsSync(device))args.push("--dev-bind",device,device);}args.push("--setenv","CUDA_VISIBLE_DEVICES",spec.gpuDevice);}
  args.push("/usr/bin/prlimit",`--nproc=${spec.maxProcesses??128}`,"--",spec.command,...spec.args);return args;
}

export async function runBubblewrap(spec:BubblewrapSpec):Promise<ProcessOutput>{
  const limitArgs=[`--as=${spec.maxAddressSpaceBytes??8*1024**3}`,`--cpu=${spec.maxCpuSeconds??Math.max(1,Math.ceil(spec.timeoutMs/1000))}`,`--fsize=${spec.maxFileBytes??2*1024**3}`,"--","bwrap",...bubblewrapArgs(spec)];
  return runProcess("prlimit",limitArgs,{timeoutMs:spec.timeoutMs,maxOutputBytes:2_000_000});
}
