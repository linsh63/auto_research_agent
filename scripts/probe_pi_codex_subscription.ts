#!/usr/bin/env node
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join,resolve } from "node:path";
import { z } from "zod";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiResearchModel } from "../src/adapters/pi-model.js";

const args=process.argv.slice(2),live=args.includes("--live"),providerId="openai-codex",modelId=process.env.AUTO_RESEARCH_MODEL??"gpt-5.6-luna",authPath=resolve(process.env.AUTO_RESEARCH_PI_AUTH_PATH??join(homedir(),".pi","agent","auth.json")),modelsStorePath=resolve(process.env.AUTO_RESEARCH_MODELS_STORE_PATH??join(".research-data","pi-codex-models-store.json")),runtime=await ModelRuntime.create({authPath,modelsStorePath,refreshOnCreate:false}),catalog=runtime.getModels(providerId),available=await runtime.getAvailable(),authenticated=available.some(model=>model.provider===providerId),selected=catalog.find(model=>model.id===modelId);let authModeSafe=false;try{authModeSafe=(statSync(authPath).mode&0o077)===0;}catch{}
if(!selected)throw new Error(`Pi ${providerId} catalog does not contain ${modelId}`);
const result:Record<string,unknown>={status:authenticated?"ready":"login_required",providerId,modelId,catalogCount:catalog.length,authenticated,authFileModeSafe:authModeSafe,liveCall:"not_requested"};
if(live){if(!authenticated)throw new Error("Pi OpenAI Codex login is required; run pi, enter /login, and select ChatGPT Plus/Pro (Codex)");const model=await PiResearchModel.create({providerId,modelId,authPath,modelsStorePath,timeoutMs:120_000}),response=await model.generate("codex-subscription-probe",{request:"Return ok=true."},z.object({ok:z.literal(true)}).strict(),"Return exactly {\"ok\":true}. This is a minimal subscription connectivity probe.");result.liveCall=response.value.ok?"pass":"fail";result.usage=response.usage;}
console.log(JSON.stringify(result,null,2));
