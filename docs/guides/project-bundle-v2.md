# Research Project Bundle v2 指南

## 导出

`project.bundle` 默认返回 Bundle v2：

```ts
const result = await client.query({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  queryId: crypto.randomUUID(),
  type: "project.bundle",
  workspaceId,
  projectId,
  actor,
  bundleVersion: "2",
  artifactPolicy: "embed",
  maxEmbeddedBytes: 20_000_000,
});
```

`artifactPolicy=metadata` 只保存 Artifact 地址和哈希。`embed` 只内嵌可找到、非 private 且不超过上限的内容。

导出前所有 Job 必须处于 succeeded、failed 或 cancelled。该要求防止把仍有 lease 或进程副作用的中间状态伪装为可恢复存档。

## 导入

Bundle v1/v2 都使用 `project.import`：

```ts
const imported = await client.execute({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  commandId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workspaceId: destinationWorkspace,
  projectId: null,
  actor,
  issuedAt: new Date().toISOString(),
  type: "project.import",
  payload: { bundle },
});
```

v2 结果包含 compatibility report。blocked 不会创建 Project；degraded 会导入只读历史，同时保持不能安全执行的依赖关闭。

## 依赖状态

`project.dependencies` 返回最近一次导入报告、插件 requirement 和 Artifact requirement。

缺失插件的处理流程：

1. 使用插件目录查看 Bundle 要求的 plugin ID、version、hash 和权限；
2. 用户显式添加来源、检查、安装并启用 exact lock；
3. 调用 `plugin.runtime` 重新协调 requirement；
4. exact lock 满足后 requirement 变为 available。

核心不会因为导入 Bundle 而下载、安装或启用代码。

## Artifact 语义

| disposition | 含义 |
| --- | --- |
| `embedded` | 内容包含在 Bundle，导入后校验并写入目标 CAS |
| `content_addressed` | 只保存 CAS hash/URI；目标已有内容时 available |
| `missing` | 只有可验证哈希，目标需要另行补充 |
| `private_omitted` | 因访问级别不导出，目标状态 restricted |

导入的终态 Job 不会因路径脱敏而自动重跑。failed/cancelled Job retry 会要求先完成执行环境重绑定。

## Bundle v1

范围阶段兼容测试仍可显式请求 `bundleVersion: "1"`。v1 不支持 Conversation、Job、插件或高级科学状态；存在这些对象时继续 fail closed。

## 安全检查

- Bundle 不包含 command receipt、服务 token、API key、confirmation token、lease token 或 secret audit。
- 已消费 confirmation capability 使用无关占位 hash；未消费 capability 在目标重新签发。
- 本地数据路径和插件绝对路径不会直接暴露。
- 修改任一行、分区、插件锁、Artifact 内容或根对象都会破坏哈希并拒绝导入。
