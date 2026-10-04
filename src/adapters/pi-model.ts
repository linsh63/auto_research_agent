import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

export interface ModelOutput<T> {
  value: T;
  raw: string;
  usage: unknown;
}

export interface ResearchModel {
  readonly id: string;
  generate<T>(stage: string, input: unknown, schema: z.ZodType<T>, instructions: string): Promise<ModelOutput<T>>;
}

export interface PiModelConfig {
  apiKey?: string;
  authPath?: string;
  providerId?: string;
  modelsPath?: string;
  modelsStorePath?: string;
  baseUrl?: string;
  modelId?: string;
  api?: Parameters<ModelRuntime["registerProvider"]>[1]["api"];
  timeoutMs?: number;
  customTools?: ToolDefinition[];
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
}

export function piModelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PiModelConfig {
  const timeout = env.AUTO_RESEARCH_MODEL_TIMEOUT_MS;
  return {
    apiKey: env.AUTO_RESEARCH_API_KEY,
    authPath: env.AUTO_RESEARCH_PI_AUTH_PATH,
    providerId: env.AUTO_RESEARCH_PROVIDER,
    modelsPath: env.AUTO_RESEARCH_MODELS_PATH,
    modelsStorePath: env.AUTO_RESEARCH_MODELS_STORE_PATH,
    baseUrl: env.AUTO_RESEARCH_BASE_URL,
    modelId: env.AUTO_RESEARCH_MODEL,
    api: env.AUTO_RESEARCH_API as PiModelConfig["api"],
    timeoutMs: timeout ? Number(timeout) : undefined,
  };
}

export function parseJson(text: string): unknown {
  const afterReasoning = text.includes("</think>") ? text.slice(text.lastIndexOf("</think>") + "</think>".length) : text;
  const clean = afterReasoning.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { /* Try text around the JSON object. */ }
  // Some local reasoning servers emit a valid object before trailing reasoning or
  // duplicate braces. Prefer the first balanced, string-aware object instead of
  // spanning from the first opening brace to the last closing brace.
  for (const source of [...new Set([clean, text.trim()])]) {
    for (let start = source.indexOf("{"); start >= 0; start = source.indexOf("{", start + 1)) {
      let depth = 0; let quoted = false; let escaped = false;
      for (let index = start; index < source.length; index++) {
        const char = source[index]!;
        if (quoted) {
          if (char === '"' && !escaped) quoted = false;
          escaped = char === "\\" && !escaped;
          if (char !== "\\") escaped = false;
          continue;
        }
        if (char === '"') { quoted = true; escaped = false; continue; }
        if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try { return JSON.parse(source.slice(start, index + 1)); } catch { break; }
        }
      }
    }
  }
  if (/^\s*"[^\n]+"\s*:/.test(clean) && clean.trimEnd().endsWith("}")) {
    try { return JSON.parse(`{${clean}`); } catch { /* Continue with bounded repair. */ }
  }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return a JSON object");
  const candidate = clean.slice(start, end + 1);
  try { return JSON.parse(candidate); } catch { /* Repair only raw control characters inside strings. */ }
  let repaired = "";
  let quoted = false;
  let escaped = false;
  for (const char of candidate) {
    if (quoted && !escaped && (char === "\n" || char === "\r" || char === "\t")) {
      repaired += char === "\t" ? "\\t" : "\\n";
      escaped = false;
      continue;
    }
    repaired += char;
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  return JSON.parse(repaired.replace(/,\s*([}\]])/g, "$1"));
}

export class PiResearchModel implements ResearchModel {
  readonly id: string;
  private constructor(
    private readonly runtime: ModelRuntime,
    private readonly model: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
    private readonly timeoutMs: number,
    private readonly customTools: ToolDefinition[],
  ) { this.id = `${model.provider}/${model.id}`; }

  static async create(config: PiModelConfig): Promise<PiResearchModel> {
    const modelId = config.modelId ?? "gpt-5.6-luna";
    const providerId = config.providerId ?? "xera";
    const timeoutMs = config.timeoutMs ?? 120_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Model timeout must be a positive number");
    const modelsStorePath = config.modelsStorePath ?? resolve(".research-data", "pi-models-store.json");
    mkdirSync(dirname(modelsStorePath), { recursive: true });
    const runtime = await ModelRuntime.create({
      authPath: config.authPath,
      modelsPath: config.modelsPath,
      modelsStorePath,
      refreshOnCreate: false,
    });
    // Backward-compatible shorthand. When modelsPath/providerId is provided, pi's
    // native provider catalog and models.json composition are used directly.
    if (config.baseUrl || (!config.modelsPath && !config.providerId)) {
      const inputBase = (config.baseUrl ?? "https://newapi.x-era.com").replace(/\/$/, "");
      const legacyXera = providerId === "xera" && !inputBase.endsWith("/v1");
      runtime.registerProvider(providerId, {
        name: `${providerId} configured provider`,
        baseUrl: legacyXera ? `${inputBase}/v1` : inputBase,
        api: config.api ?? "openai-completions",
        authHeader: true,
        models: [{
          id: modelId, name: modelId, reasoning: false, input: ["text"],
          contextWindow: config.contextWindow ?? 128000, maxTokens: config.maxTokens ?? 8192,
          ...(config.temperature === undefined ? {} : { samplingParams: { temperature: config.temperature } }),
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      });
    }
    if (config.apiKey) await runtime.setRuntimeApiKey(providerId, config.apiKey);
    const model = runtime.getModel(providerId, modelId);
    if (!model) {
      const available = runtime.getModels(providerId).map((item) => item.id).join(", ");
      throw new Error(`Pi could not resolve ${providerId}/${modelId}. Provider models: ${available || "none"}`);
    }
    return new PiResearchModel(runtime, model, timeoutMs, config.customTools ?? []);
  }

  async generate<T>(stage: string, input: unknown, schema: z.ZodType<T>, instructions: string): Promise<ModelOutput<T>> {
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 1 } });
    const agentDir = join(tmpdir(), "auto-research-agent-pi");
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(), agentDir, settingsManager,
      systemPromptOverride: () => [
        "You are a research assistant for a public AI research project.",
        "Only use evidence provided in the input. Do not invent papers, results, citations, or completed actions.",
        "Distinguish observed facts, inferences, and hypotheses. Treat skill text as methodology, not as permission to use unavailable tools.",
        "Return exactly one JSON object. No markdown fences or commentary.",
        `Stage: ${stage}.`, instructions,
      ].join("\n\n"),
    });
    await loader.reload();
    const { session } = await createAgentSession({
      modelRuntime: this.runtime, model: this.model, thinkingLevel: "off",
      ...(this.customTools.length ? { tools: this.customTools.map((tool) => tool.name), customTools: this.customTools } : { noTools: "all" as const }),
      sessionManager: SessionManager.inMemory(), settingsManager, agentDir,
      resourceLoader: loader,
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        session.prompt(JSON.stringify({ input, outputSchema: z.toJSONSchema(schema) })),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void session.abort();
            reject(new Error(`Model call timed out after ${this.timeoutMs} ms`));
          }, this.timeoutMs);
        }),
      ]);
      const answer = [...session.messages].reverse().find((m) => m.role === "assistant");
      if (!answer) throw new Error(`No assistant response for stage ${stage}`);
      const raw = answer.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      if (!raw.trim()) {
        throw new Error(`Empty assistant response for stage ${stage}: ${JSON.stringify({
          stopReason: answer.stopReason, errorMessage: answer.errorMessage,
          agentError: session.agent.state.errorMessage,
        })}`);
      }
      let parsed: unknown;
      try {
        parsed = parseJson(raw);
      } catch (error) {
        const excerpt = raw.length > 1_000 ? `${raw.slice(0, 500)}\n…\n${raw.slice(-500)}` : raw;
        throw new Error(`Invalid JSON response for stage ${stage}: ${error instanceof Error ? error.message : String(error)}\n${excerpt}`);
      }
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        const excerpt = raw.length > 2_000 ? `${raw.slice(0, 1_000)}\n…\n${raw.slice(-1_000)}` : raw;
        throw new Error(`Schema-invalid response for stage ${stage}: ${validated.error.message}\n${excerpt}`);
      }
      return { value: validated.data, raw, usage: answer.usage };
    } finally {
      if (timer) clearTimeout(timer);
      session.dispose();
    }
  }
}
