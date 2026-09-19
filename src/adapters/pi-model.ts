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
  providerId?: string;
  modelsPath?: string;
  modelsStorePath?: string;
  baseUrl?: string;
  modelId?: string;
  api?: Parameters<ModelRuntime["registerProvider"]>[1]["api"];
  timeoutMs?: number;
  customTools?: ToolDefinition[];
}

export function piModelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PiModelConfig {
  const timeout = env.AUTO_RESEARCH_MODEL_TIMEOUT_MS;
  return {
    apiKey: env.AUTO_RESEARCH_API_KEY,
    providerId: env.AUTO_RESEARCH_PROVIDER,
    modelsPath: env.AUTO_RESEARCH_MODELS_PATH,
    modelsStorePath: env.AUTO_RESEARCH_MODELS_STORE_PATH,
    baseUrl: env.AUTO_RESEARCH_BASE_URL,
    modelId: env.AUTO_RESEARCH_MODEL,
    api: env.AUTO_RESEARCH_API as PiModelConfig["api"],
    timeoutMs: timeout ? Number(timeout) : undefined,
  };
}

function parseJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { /* Try text around the JSON object. */ }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return a JSON object");
  return JSON.parse(clean.slice(start, end + 1));
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
          contextWindow: 128000, maxTokens: 8192,
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
      return { value: schema.parse(parseJson(raw)), raw, usage: answer.usage };
    } finally {
      if (timer) clearTimeout(timer);
      session.dispose();
    }
  }
}
