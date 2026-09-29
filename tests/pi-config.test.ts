import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PiResearchModel, parseJson, piModelConfigFromEnv } from "../src/adapters/pi-model.js";

test("environment maps to pi-native provider selection", () => {
  const config = piModelConfigFromEnv({
    AUTO_RESEARCH_MODELS_PATH: "models.json",
    AUTO_RESEARCH_PROVIDER: "deepseek",
    AUTO_RESEARCH_MODEL: "deepseek-flash",
    AUTO_RESEARCH_API_KEY: "runtime-only",
    AUTO_RESEARCH_MODEL_TIMEOUT_MS: "5000",
  });
  assert.deepEqual(config, {
    modelsPath: "models.json", providerId: "deepseek", modelId: "deepseek-flash",
    apiKey: "runtime-only", timeoutMs: 5000, baseUrl: undefined, api: undefined,
    modelsStorePath: undefined,
  });
});

test("pi loads the DeepSeek models.json without a network request", async () => {
  const model = await PiResearchModel.create({
    modelsPath: resolve("examples/models.deepseek.json"),
    providerId: "deepseek", modelId: "deepseek-flash", apiKey: "test-only",
  });
  assert.equal(model.id, "deepseek/deepseek-flash");
});

test("pi JSON repair keeps the first balanced object before trailing reasoning", () => {
  assert.deepEqual(parseJson('output:{"ok":true}}\n<think>later {"noise":1}</think>'), { ok: true });
  assert.deepEqual(parseJson('{"text":"brace } inside string","nested":{"x":1}} trailing'), { text: "brace } inside string", nested: { x: 1 } });
});
