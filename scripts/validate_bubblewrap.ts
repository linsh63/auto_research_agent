import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBubblewrap } from "../src/adapters/bubblewrap-runner.js";

const workspace=mkdtempSync(join(tmpdir(),"ara-bwrap-"));
try{
  writeFileSync(join(workspace,"network_probe.py"),"import socket\ns=socket.socket(); s.settimeout(1)\nprint('network', s.connect_ex(('1.1.1.1', 53)))\n");
  writeFileSync(join(workspace,"gpu_probe.py"),"import os, subprocess\nprint('visible', os.environ.get('CUDA_VISIBLE_DEVICES'))\nprint(subprocess.run(['/usr/bin/nvidia-smi','-L'],capture_output=True,text=True,check=True).stdout.strip())\n");
  const cpu=await runBubblewrap({workspace,command:"/usr/bin/python3",args:["network_probe.py"],timeoutMs:10_000});
  if(cpu.exitCode!==0||!cpu.stdout.includes("network 101"))throw new Error(`Network isolation smoke failed: ${cpu.stderr||cpu.stdout}`);
  const gpu=await runBubblewrap({workspace,command:"/usr/bin/python3",args:["gpu_probe.py"],timeoutMs:10_000,gpuDevice:"0"});
  if(gpu.exitCode!==0||!gpu.stdout.includes("visible 0")||!gpu.stdout.includes("GPU 0:"))throw new Error(`GPU isolation smoke failed: ${gpu.stderr||gpu.stdout}`);
  console.log(JSON.stringify({cpu:{exitCode:cpu.exitCode,networkIsolated:true},gpu:{exitCode:gpu.exitCode,device:"0",output:gpu.stdout.trim()}},null,2));
}finally{rmSync(workspace,{recursive:true,force:true});}
