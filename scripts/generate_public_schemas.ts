import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  PUBLIC_SCHEMA_VERSION, CandidateSetReadModelSchema, CommandResultSchema, ConversationReadModelSchema,
  ExecutionPolicySchema, JobLogListSchema, JobReadModelSchema, JobSpecSchema, ProjectEventListSchema, ProjectStatusReadModelSchema, PublicCommandSchema,
  PublicErrorSchema, PublicProjectBundleSchema, PublicQuerySchema, QueryResultSchema, ResearchActionSchema, ResearchEventEnvelopeSchema, WorkerRequestSchema, WorkerResultSchema,
} from "../src/public/contracts.js";

const root = resolve("schemas/public/v1");
const definitions = {
  "command.schema.json": PublicCommandSchema,
  "command-result.schema.json": CommandResultSchema,
  "query.schema.json": PublicQuerySchema,
  "query-result.schema.json": QueryResultSchema,
  "project-status.schema.json": ProjectStatusReadModelSchema,
  "project-events.schema.json": ProjectEventListSchema,
  "project-bundle.schema.json": PublicProjectBundleSchema,
  "research-action.schema.json": ResearchActionSchema,
  "candidate-set.schema.json": CandidateSetReadModelSchema,
  "conversation.schema.json": ConversationReadModelSchema,
  "execution-policy.schema.json": ExecutionPolicySchema,
  "job-spec.schema.json": JobSpecSchema,
  "job.schema.json": JobReadModelSchema,
  "job-logs.schema.json": JobLogListSchema,
  "worker-request.schema.json": WorkerRequestSchema,
  "worker-result.schema.json": WorkerResultSchema,
  "event.schema.json": ResearchEventEnvelopeSchema,
  "error.schema.json": PublicErrorSchema,
};
const rendered = Object.fromEntries(Object.entries(definitions).map(([name, schema]) => {
  const value = z.toJSONSchema(schema, { target: "draft-2020-12" });
  return [name, `${JSON.stringify({ $id: `https://auto-research.local/schemas/v1/${name}`, ...value }, null, 2)}\n`];
}));
const hashes = Object.fromEntries(Object.entries(rendered).map(([name, content]) => [name, createHash("sha256").update(content).digest("hex")]));
const manifest = `${JSON.stringify({ schemaVersion: PUBLIC_SCHEMA_VERSION, jsonSchemaDraft: "2020-12", files: hashes }, null, 2)}\n`;
const check = process.argv.includes("--check");
if (check) {
  const expected = { ...rendered, "manifest.json": manifest };
  const stale = Object.entries(expected).filter(([name, content]) => !existsSync(resolve(root, name)) || readFileSync(resolve(root, name), "utf8") !== content).map(([name]) => name);
  if (stale.length) throw new Error(`Public contract schemas are stale or missing: ${stale.join(", ")}`);
  console.log(JSON.stringify({ status: "pass", schemaVersion: PUBLIC_SCHEMA_VERSION, files: Object.keys(expected).length }));
} else {
  mkdirSync(root, { recursive: true });
  for (const [name, content] of Object.entries(rendered)) writeFileSync(resolve(root, name), content);
  writeFileSync(resolve(root, "manifest.json"), manifest);
  console.log(JSON.stringify({ status: "generated", schemaVersion: PUBLIC_SCHEMA_VERSION, files: Object.keys(rendered).length + 1 }));
}
