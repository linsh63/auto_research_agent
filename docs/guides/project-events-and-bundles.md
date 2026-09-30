# Project、事件、分支与 Bundle

## Project 存档

每个公共研究 Project 现在持久绑定到一个 Workspace，并拥有：

- 追加式 ResearchEvent；
- Project lineage；
- 当前 projection；
- 持久化 command receipt；
- 现有 ResearchProgram 科研状态。

Core Service 重启后不再需要为新 Project 重新提供 Workspace binding。v1.5 N 阶段的 `workspaceBindings` 只用于显式接管 schema 11 之前创建的旧 ResearchProgram。

## 新增公共命令

- `project.fork`：从当前 Project 最新节点创建独立分支。
- `project.import`：验证并导入 Project Bundle。

原有 `project.create`、`question.propose`、`question.select` 和 `scope.approve` 现在都会产生持久事件。

## 新增公共查询

- `project.events`：按 sequence 分页读取事件。
- `project.bundle`：导出范围阶段 Project Bundle。
- `project.status`：新增 root、parent、branch 和事件序号投影。

## 命令收据

每个命令以 `(workspaceId, projectId, idempotencyKey)` 作为幂等作用域：

- 相同命令重放返回原结果，不新增事件；
- 相同 key 的不同命令返回 `CONFLICT`；
- 跨 Workspace 访问返回 `FORBIDDEN`；
- 事件提交失败时返回 `CONFLICT/in-doubt`，后续重试继续被阻止。

这可以避免服务重启、网络重试或客户端重复点击造成科研状态重复变化。

## 事件顺序与恢复

事件在单个 Project 内从 1 开始连续编号。`ProjectStore.auditProject()` 检查：

- sequence 连续性；
- payload hash；
- 数据库独立 hash 列；
- Workspace 一致性；
- projection sequence；
- projection hash。

projection 损坏时可以调用确定性重建。事件版本无法 upcast 时读取失败，不会猜测兼容方式。

## 分支

`project.fork` 在父 Project 写入 `branch.created`，在子 Project 写入 `project.forked`。子 Project 保存：

- `rootProjectId`；
- `parentProjectId`；
- `forkedFromEventId`；
- `branchName`。

当前只允许从最新节点 fork。任意历史节点重放将在公共事件覆盖更多科研对象后实现。

## Project Bundle v1

Bundle 包含：

- Project metadata；
- 完整公共事件；
- projection；
- ResearchProgram、问题和范围审批快照；
- state hash；
- bundle content hash。

导入时保留 Project ID 和事件 ID，允许把存档迁移到另一独立实例和另一个 Workspace。导入本身追加 `project.imported` 事件。

### 当前限制

Bundle v1 只支持范围阶段。如果 Project 已经包含假设、证据图、协议、study 或研究 derivation，导出会明确拒绝。不得把 v1 Bundle 描述成完整实验存档；完整科研图和 Artifact 打包将在后续阶段扩展。

## 迁移

schema 10 升级到 schema 11 前会创建数据库备份和 Artifact manifest 快照。旧 ResearchProgram 不会被自动归入任意 Workspace；调用者必须显式传入 compatibility binding，避免把旧项目静默暴露给错误用户空间。
