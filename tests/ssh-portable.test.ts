import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { SshWorkerBridge } from "../src/runtime/ssh-remote-worker.js";

test("system OpenSSH config and SFTP clients are available",()=>{const ssh=spawnSync("ssh",["-V"],{encoding:"utf8",windowsHide:true}),config=spawnSync("ssh",["-G","localhost"],{encoding:"utf8",windowsHide:true}),sftp=spawnSync("sftp",["-h"],{encoding:"utf8",windowsHide:true});assert.equal(ssh.error,undefined);assert.equal(config.status,0,config.stderr);assert.match(config.stdout,/^hostname localhost$/m);assert.equal(sftp.error,undefined);});

test("stdio Worker handshake and lifecycle are platform-neutral",async()=>{const path=resolve("remote/worker-stdio.mjs"),hash=createHash("sha256").update(readFileSync(path)).digest("hex"),bridge=await SshWorkerBridge.connect({sshCommand:process.execPath,args:[path,"--stdio","--content-hash",hash],expectedHash:hash});assert.equal(bridge.hello.protocolVersion,"1");assert.equal((await bridge.request({type:"ping",requestId:"portable"})).type,"pong");assert.equal((await bridge.request({type:"lease.open",leaseId:"portable"})).type,"lease.accepted");assert.equal((await bridge.request({type:"lease.heartbeat",leaseId:"portable"})).type,"lease.heartbeat");assert.equal((await bridge.request({type:"lease.cancel",leaseId:"portable"})).type,"lease.cancelled");await bridge.close();});
