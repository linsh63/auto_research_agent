# ResearchAction、聊天候选与执行策略

## 核心语义

Project 创建后有三种入口：

- `action.execute`：客户端直接提交结构化 ResearchAction；
- `conversation.send`：提交自由文本，由核心根据当前状态给出候选或自动执行；
- `candidate.choose`：选择候选，或者提交 `freeInput` 重新进入行动规划。

三种入口最终调用同一个行动执行器。状态变化仍经过科研 Workflow，并生成 `question.proposed`、`question.selected` 或 `scope.approved` 事件。

## 执行策略

使用 `policy.set` 为 Project 设置策略：

```ts
await app.execute({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  commandId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workspaceId,
  projectId,
  actor: userActor,
  issuedAt: new Date().toISOString(),
  type: "policy.set",
  payload: {
    mode: "candidate",
    maxAutoActionsPerTurn: 1,
    maxKnownCostUsdPerAction: 0,
    autoAllowedActionTypes: ["question.propose", "question.select"],
  },
});
```

| 模式 | 行为 |
| --- | --- |
| `manual` | 返回一个建议行动和自由输入，等待用户确认 |
| `candidate` | 返回所有当前合法行动和自由输入 |
| `auto` | 在白名单、成本、权限和单轮数量墙内执行；否则返回候选 |

策略只能由 `user` Actor 修改。`scope.approve` 不在自动白名单中，也不能由 Agent 或自动聊天执行。

## 聊天和候选

```ts
const response = await app.execute({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  commandId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workspaceId,
  projectId,
  actor: userActor,
  issuedAt: new Date().toISOString(),
  type: "conversation.send",
  payload: { sessionId: null, message: "给出下一步研究行动" },
});
```

响应包含 `sessionId`、普通回复、候选集合、当前策略，以及可能已自动执行的行动。候选集合的最后一项总是 `free_input`。

选择结构化候选时提交 `candidateId`，并把 `freeInput` 设为 `null`。使用自由输入时提交 `freeInput`，并把 `candidateId` 设为 `null`。两个字段必须且只能使用一个。

候选集合是一次性的。执行、自由输入或其他消费完成后再次使用会返回 `CONFLICT`。候选和 Session 不能跨 Workspace 或 Project 使用。

## 查询与恢复

- `conversation.get` 返回 Session、按序消息、最近候选和当前策略；
- `policy.get` 返回 Project 的 ExecutionPolicy；
- 没有显式策略时默认 `manual`；
- Session、消息、候选、策略和行动审计在服务重启后保留。

## 当前边界

P 阶段的确定性规划器覆盖提出问题、选择问题和批准范围。它用于验证交互协议和门禁，不声称已经理解任意自然语言。Q 阶段会在该协议后接入 Pi runtime 和持久化 Job；模型只能提出 ResearchAction，不能直接修改科研状态。
