#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { Type } from "typebox";
import {
  createAgentSession, defineTool, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";

const apiKey = process.env.AUTO_RESEARCH_API_KEY;
if (!apiKey) throw new Error("AUTO_RESEARCH_API_KEY is required");
const modelId = process.env.AUTO_RESEARCH_MODEL ?? "gpt-5.6-luna";
const rawBase = (process.env.AUTO_RESEARCH_BASE_URL ?? "https://newapi.x-era.com").replace(/\/$/, "");
const baseUrl = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
const root = resolve(".research-data/probes/pi-sdk");
const sessions = join(root, "sessions");
const agentDir = join(root, "agent");
mkdirSync(sessions, { recursive: true });
mkdirSync(agentDir, { recursive: true });

const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
runtime.registerProvider("probe", {
  name: "Probe provider", baseUrl, api: "openai-completions", authHeader: true,
  models: [{ id: modelId, name: modelId, reasoning: false, input: ["text"], contextWindow: 128000,
    maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
});
await runtime.setRuntimeApiKey("probe", apiKey);
const model = runtime.getModel("probe", modelId);
if (!model) throw new Error("Probe model registration failed");

let toolExecutions = 0;
const echo = defineTool({
  name: "probe_echo", label: "Probe Echo", description: "Echo a value during SDK validation.",
  parameters: Type.Object({ input: Type.String() }),
  execute: async (_id, params) => {
    toolExecutions++;
    return { content: [{ type: "text", text: `echo:${params.input}` }], details: { input: params.input } };
  },
});
const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 1 } });
const loader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir, settingsManager: settings,
  systemPromptOverride: () => "Follow the request and use the supplied tool when explicitly required." });
await loader.reload();
const manager = SessionManager.create(process.cwd(), sessions);
const { session } = await createAgentSession({ cwd: process.cwd(), agentDir, modelRuntime: runtime, model,
  thinkingLevel: "off", tools: ["probe_echo"], customTools: [echo], sessionManager: manager,
  settingsManager: settings, resourceLoader: loader });
const events: string[] = [];
session.subscribe((event) => events.push(event.type));
await session.prompt("Call probe_echo exactly once with input v1. After its result, answer exactly DONE.");
if (toolExecutions !== 1) throw new Error(`Expected one tool execution, got ${toolExecutions}`);
const sessionFile = session.sessionFile;
if (!sessionFile) throw new Error("Persistent session file was not created");
const messageCount = session.messages.length;
session.dispose();

const reopenedManager = SessionManager.open(sessionFile);
const { session: reopened } = await createAgentSession({ cwd: process.cwd(), agentDir, modelRuntime: runtime, model,
  thinkingLevel: "off", noTools: "all", sessionManager: reopenedManager, settingsManager: settings,
  resourceLoader: loader });
const restoredMessages = reopened.messages.length;
if (restoredMessages < messageCount) throw new Error("Session recovery lost messages");
reopened.dispose();

const cancelManager = SessionManager.inMemory();
const { session: cancellable } = await createAgentSession({ modelRuntime: runtime, model, thinkingLevel: "off",
  noTools: "all", sessionManager: cancelManager, settingsManager: settings, resourceLoader: loader, agentDir });
const pending = cancellable.prompt("Produce a detailed 3000-word essay about sorting algorithms.");
setTimeout(() => void cancellable.abort(), 25);
await pending;
const cancelled = cancellable.messages.some((message) => message.role === "assistant" && message.stopReason === "aborted");
cancellable.dispose();
if (!cancelled) throw new Error("Active prompt cancellation was not recorded as aborted");

const report = { schemaVersion: 1, model: `probe/${modelId}`, toolExecutions,
  eventTypes: [...new Set(events)].sort(), sessionFile: relative(process.cwd(), sessionFile),
  messageCount, restoredMessages, cancelled };
writeFileSync("docs/pi-sdk-probe.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
