#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { arch,platform } from "node:os";
import { spawnSync } from "node:child_process";
const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;},output=resolve(value("--output")??".research-data/ssh-ci.json"),worker=resolve("remote/worker-stdio.mjs"),ssh=spawnSync("ssh",["-V"],{encoding:"utf8"}),config=spawnSync("ssh",["-G","localhost"],{encoding:"utf8"}),report={schemaVersion:1,stage:"W",status:!ssh.error&&config.status===0?"pass":"fail",platform:{os:platform(),arch:arch()},sshVersion:`${ssh.stderr}${ssh.stdout}`.trim().split(/\r?\n/)[0],configParsed:config.status===0,workerHash:createHash("sha256").update(readFileSync(worker)).digest("hex"),protocolVersion:"1"};mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));if(report.status!=="pass")process.exitCode=1;
