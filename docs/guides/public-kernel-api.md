# v1.5 公共 Kernel API 指南

## 目的

`src/public/index.ts` 是 v1.5 起唯一面向客户端和场景开发者的 TypeScript 入口。客户端不得导入 `src/infrastructure`、`src/application`、`src/domain` 或数据库迁移文件。

当前接口已完成 N、O、P、Q 阶段：公共契约、持久 Project、事件、分支、范围阶段 Bundle、ResearchAction、Conversation、ExecutionPolicy 和持久 Job/Worker 可用。Scenario 和服务端推送将在后续阶段补充。

## 公共导出

| 子路径 | 内容 |
| --- | --- |
| `auto-research-agent` | 全部公共 API |
| `auto-research-agent/contracts` | Command、Query、Result、Event、Error 和 read model schema |
| `auto-research-agent/kernel` | schema/context guard 与稳定错误映射 |
| `auto-research-agent/application` | `ResearchApplication` 兼容 facade |

## 最小流程

```ts
import { PUBLIC_SCHEMA_VERSION, ResearchApplication } from "auto-research-agent";

const app = await ResearchApplication.open({ databasePath: ".research-data/research.db" });
const actor = { id: "user:local", kind: "user" as const };

const created = await app.execute({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  commandId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workspaceId: "workspace:default",
  projectId: null,
  actor,
  issuedAt: new Date().toISOString(),
  type: "project.create",
  payload: {
    intent: {
      title: "Example study",
      direction: "Evaluate a concrete and falsifiable AI research question.",
      domain: "AI/ML",
      constraints: [], allowedData: [], prohibitions: [], profile: "exploratory",
      budget: { gpuHours: 1, wallHours: 2, diskGiB: 2, modelCalls: 5, knownCostUsd: 0 },
    },
  },
});

if (created.status !== "accepted") throw new Error(created.error?.message);
const projectId = created.projectId!;
const status = await app.query({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  queryId: crypto.randomUUID(),
  type: "project.status",
  workspaceId: "workspace:default",
  projectId,
  actor,
});
app.close();
```

## 当前命令

- `project.create`
- `question.propose`
- `question.select`
- `scope.approve`
- `project.fork`
- `project.import`
- `action.execute`
- `conversation.send`
- `candidate.choose`
- `policy.set`
- `job.submit`
- `job.cancel`
- `job.retry`

查询包括 `project.status`、`project.events`、`project.bundle`、`conversation.get`、`policy.get`、`job.get` 和 `job.logs`。返回值是稳定 read model 或版本化 Bundle，不是数据库记录。聊天与策略见 [ResearchAction 指南](research-actions-and-policies.md)，长任务见 [Job 与 Worker 指南](jobs-and-workers.md)。

## 错误语义

公共错误码包括：

- `INVALID_COMMAND`
- `INCOMPATIBLE_VERSION`
- `NOT_FOUND`
- `CONFLICT`
- `FORBIDDEN`
- `GATE_REJECTED`
- `INTERNAL`

内部异常不向客户端泄露堆栈。科研状态门禁失败使用 `GATE_REJECTED`；跨 Workspace 访问使用 `FORBIDDEN`；相同幂等键提交不同命令使用 `CONFLICT`。

## 持久幂等与 Workspace

新 Project 的幂等结果和 Workspace binding 已持久化，服务重启后继续有效。接管 schema 11 之前创建的旧 Project 时必须显式传入：

```ts
await ResearchApplication.open({
  databasePath,
  workspaceBindings: { [projectId]: "workspace:default" },
});
```

没有显式绑定时旧 Project 查询会 fail closed。该参数只用于兼容迁移，不用于新 Project。

如果科研状态已经改变但事件提交失败，命令收据保持 pending，后续重试返回 `CONFLICT/in-doubt`。核心不会猜测命令是否可以安全重放。

## 语言无关契约

提交版 JSON Schema 位于 `schemas/public/v1/`，`manifest.json` 保存每个 schema 的 SHA-256。修改公共 Zod schema 后必须执行：

```bash
npm run generate:contracts
npm run check:contracts
```

CI 使用 `check:contracts` 阻止未同步的 schema 进入发布。

## 边界检查

```bash
npm run check:boundaries
```

该检查只允许 `application.ts` 使用两个已声明的旧实现入口；其他公共文件引用内部模块会失败。后续迁移会逐步移除这两个例外。
