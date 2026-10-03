#!/usr/bin/env node
import { createInterface } from "node:readline";
import { arch,platform } from "node:os";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args=process.argv.slice(2),expectedHash=args[args.indexOf("--content-hash")+1],hash=createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");if(!args.includes("--stdio")||!/^[a-f0-9]{64}$/.test(expectedHash??"")||expectedHash!==hash){process.stderr.write("fixed stdio launcher arguments or content hash are invalid\n");process.exit(2);}const sessions=new Set();
const emit=value=>process.stdout.write(`${JSON.stringify(value)}\n`);emit({type:"hello",protocolVersion:"1",contentHash:hash,platform:{os:platform(),arch:arch(),nodeVersion:process.version}});
createInterface({input:process.stdin,crlfDelay:Infinity}).on("line",line=>{let frame;try{frame=JSON.parse(line);}catch{emit({type:"error",code:"invalid_json"});return;}if(frame.type==="ping")emit({type:"pong",requestId:frame.requestId});else if(frame.type==="lease.open"&&typeof frame.leaseId==="string"){sessions.add(frame.leaseId);emit({type:"lease.accepted",leaseId:frame.leaseId});}else if(frame.type==="lease.heartbeat"&&sessions.has(frame.leaseId))emit({type:"lease.heartbeat",leaseId:frame.leaseId});else if(frame.type==="lease.log"&&sessions.has(frame.leaseId))emit({type:"lease.log",leaseId:frame.leaseId,stream:frame.stream??"progress",message:String(frame.message??"")});else if(frame.type==="lease.cancel"&&sessions.delete(frame.leaseId))emit({type:"lease.cancelled",leaseId:frame.leaseId});else if(frame.type==="shutdown"){emit({type:"shutdown"});process.exit(0);}else emit({type:"error",code:"invalid_state",requestId:frame.requestId??null});});
