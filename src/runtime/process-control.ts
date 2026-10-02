import { spawnSync } from "node:child_process";

export function processTreeTerminationPlan(pid:number,signal:NodeJS.Signals="SIGKILL",platform:NodeJS.Platform=process.platform):{command:string;args:string[];processGroup:boolean}{return platform==="win32"?{command:"taskkill",args:["/pid",String(pid),"/t",...(signal==="SIGKILL"?["/f"]:[])],processGroup:false}:{command:"process.kill",args:[String(-pid),signal],processGroup:true};}
/** Terminate a spawned process and its descendants without shell interpolation. */
export function terminateProcessTree(pid:number,signal:NodeJS.Signals="SIGKILL",platform:NodeJS.Platform=process.platform):void{
  if(platform==="win32"){const plan=processTreeTerminationPlan(pid,signal,platform),result=spawnSync(plan.command,plan.args,{windowsHide:true,stdio:"ignore"});if(result.error)try{process.kill(pid,signal);}catch{};return;}
  try{process.kill(-pid,signal);}catch{try{process.kill(pid,signal);}catch{}}
}
