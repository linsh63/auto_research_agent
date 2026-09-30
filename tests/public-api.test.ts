import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PUBLIC_SCHEMA_VERSION, ProjectStatusReadModelSchema, ResearchApplication,
  type Actor,
} from "../src/public/index.js";

const actor: Actor = { id: "user:test", kind: "user", displayName: "Test user" };
const base = { schemaVersion: PUBLIC_SCHEMA_VERSION, workspaceId: "workspace:test", actor, issuedAt: "2026-09-30T00:00:00.000Z" };

test("v1.5 public application completes a minimal scoped research flow", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ara-public-api-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const application = await ResearchApplication.open({ databasePath: join(directory, "research.db") });
  t.after(() => application.close());

  const create = { ...base, type: "project.create", commandId: "command:create", idempotencyKey: "create-once", projectId: null,
    payload: { intent: { title: "Public API study", direction: "Evaluate whether the public facade preserves research scope gates.",
      domain: "AI/ML", constraints: ["public API only"], allowedData: ["fixture"], prohibitions: ["no internal imports"], profile: "confirmatory",
      budget: { gpuHours: 1, wallHours: 2, diskGiB: 1, modelCalls: 2, knownCostUsd: 0 } } } } as const;
  const created = await application.execute(create);
  assert.equal(created.status, "accepted");
  assert.ok(created.projectId);
  assert.deepEqual(await application.execute(create), created, "idempotent replay must return the original result");
  const conflictingReplay = await application.execute({ ...create, commandId: "command:create-conflict",
    payload: { intent: { ...create.payload.intent, title: "Changed title" } } });
  assert.equal(conflictingReplay.status, "rejected");
  assert.equal(conflictingReplay.error?.code, "CONFLICT");
  const projectId = created.projectId!;

  const prematureApproval = await application.execute({ ...base, type: "scope.approve", commandId: "command:premature-scope",
    idempotencyKey: "premature-scope", projectId, payload: { note: "Must be rejected before question selection." } });
  assert.equal(prematureApproval.status, "rejected");
  assert.equal(prematureApproval.error?.code, "GATE_REJECTED");

  const proposed = await application.execute({ ...base, type: "question.propose", commandId: "command:question", idempotencyKey: "question-once", projectId,
    payload: { question: { question: "Does the public application preserve mandatory scope approval semantics?",
      rationale: "A stable facade must reproduce the existing research state machine without exposing internal stores.",
      targetPopulation: "Public API research projects", intervention: "Versioned public command facade", comparator: "Direct internal store access",
      primaryOutcome: "Scope state consistency", scope: "One deterministic public API fixture", sourceIds: [] } } });
  assert.equal(proposed.status, "accepted");
  const questionId = (proposed.data as { question: { id: string } }).question.id;

  assert.equal((await application.execute({ ...base, type: "question.select", commandId: "command:select", idempotencyKey: "select-once", projectId,
    payload: { questionId } })).status, "accepted");
  assert.equal((await application.execute({ ...base, type: "scope.approve", commandId: "command:scope", idempotencyKey: "scope-once", projectId,
    payload: { note: "Public boundary acceptance fixture." } })).status, "accepted");

  const queried = await application.query({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: "query:status", type: "project.status",
    workspaceId: base.workspaceId, projectId, actor });
  assert.equal(queried.status, "ok");
  const status = ProjectStatusReadModelSchema.parse(queried.data);
  assert.equal(status.project.status, "scoped");
  assert.equal(status.questions.filter(item => item.status === "selected").length, 1);
  assert.equal(status.counts.approvals, 1);

  const crossWorkspace = await application.query({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: "query:cross-workspace", type: "project.status",
    workspaceId: "workspace:other", projectId, actor });
  assert.equal(crossWorkspace.status, "rejected");
  assert.equal(crossWorkspace.error?.code, "FORBIDDEN");
});

test("public contracts fail closed with stable error codes", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ara-public-invalid-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const application = await ResearchApplication.open({ databasePath: join(directory, "research.db") });
  t.after(() => application.close());
  const invalid = await application.execute({ schemaVersion: PUBLIC_SCHEMA_VERSION, commandId: "bad", idempotencyKey: "bad",
    workspaceId: "workspace:test", projectId: null, issuedAt: "now", type: "project.create", payload: {} });
  assert.equal(invalid.status, "rejected");
  assert.equal(invalid.error?.code, "INVALID_COMMAND");

  const unsupported = await application.query({ schemaVersion: "2.0.0", queryId: "bad-version", type: "project.status",
    workspaceId: "workspace:test", projectId: "missing", actor });
  assert.equal(unsupported.status, "rejected");
  assert.equal(unsupported.error?.code, "INCOMPATIBLE_VERSION");
});

test("legacy projects require an explicit workspace compatibility binding", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ara-public-legacy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "research.db");
  const creator = await ResearchApplication.open({ databasePath: path });
  const created = await creator.execute({ ...base, type: "project.create", commandId: "legacy:create", idempotencyKey: "legacy-create", projectId: null,
    payload: { intent: { title: "Legacy fixture", direction: "Verify explicit workspace adoption after reopening the public facade.",
      domain: "AI/ML", constraints: [], allowedData: [], prohibitions: [], profile: "exploratory",
      budget: { gpuHours: 1, wallHours: 1, diskGiB: 1, modelCalls: 1, knownCostUsd: 0 } } } });
  creator.close();
  const projectId = created.projectId!;

  const unbound = await ResearchApplication.open({ databasePath: path });
  assert.equal((await unbound.query({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: "legacy:unbound", type: "project.status",
    workspaceId: base.workspaceId, projectId, actor })).error?.code, "NOT_FOUND");
  unbound.close();

  const adopted = await ResearchApplication.open({ databasePath: path, workspaceBindings: { [projectId]: base.workspaceId } });
  assert.equal((await adopted.query({ schemaVersion: PUBLIC_SCHEMA_VERSION, queryId: "legacy:bound", type: "project.status",
    workspaceId: base.workspaceId, projectId, actor })).status, "ok");
  adopted.close();
});
