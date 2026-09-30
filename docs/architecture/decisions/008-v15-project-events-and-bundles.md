# ADR 008：v1.5 Project 事件、命令收据与 Bundle

状态：accepted

## 决策

1. schema 11 新增 Workspace、Actor、Project、ResearchEvent、Projection 和 CommandReceipt 持久化表。
2. 公共命令采用 fail-closed saga：先持久化 pending receipt，再调用已有科研状态机，最后原子提交事件、投影和命令结果。
3. 如果领域状态已经改变而事件提交失败，receipt 保持 pending；相同幂等键的重试返回 `CONFLICT/in-doubt`，禁止静默重复执行。
4. ResearchEvent 按 Project 使用连续 sequence，保存 schema version、Actor、因果关系、关联 ID 和 payload hash。
5. read model 是事件派生的持久化投影；投影哈希、序号和事件哈希可以审计并确定性重建。
6. Project fork 使用已有 research derivation 创建子 Project；当前版本只从最新合法节点创建分支，不伪装支持任意历史节点重放。
7. Project Bundle v1 支持范围阶段项目的跨实例导出和导入，包含状态快照、事件、投影和双层内容哈希。
8. 包含假设、协议、证据、study 或 derivation 的高级项目暂时拒绝导出，等待后续扩展完整快照格式。
9. 事件读取提供显式 upcaster；无已知 upcaster 的版本 fail closed。
10. schema 11 迁移执行在线备份和 Artifact manifest 快照，失败必须回滚到 schema 10。

## 原因

CLI、Web 和游戏需要在服务重启后看到同一个研究存档、时间线和分支。只保存当前 CRUD 状态无法可靠驱动事件流，也无法证明命令是否已经执行。现有科研状态机已经通过真实研究验收，不适合在 O 阶段重写，因此采用命令收据和事件提交组成的过渡 saga。

## 一致性语义

- receipt `completed`：客户端可以安全重放并获得原结果。
- receipt `pending`：命令可能已经改变领域状态，必须先审计，不能自动重试。
- 没有 receipt：命令尚未被核心接受。
- 事件成功而投影损坏：事件是恢复依据，投影可以重建。
- 领域状态成功而事件失败：保留 pending receipt，等待未来 reconciliation 能力处理。

## 被拒绝的方案

- **直接把数据库快照当事件。** 无法表达 Actor、因果关系和客户端流式更新。
- **跨两个 SQLite connection 自动重试。** 可能重复创建问题、审批或确认能力。
- **立即把所有旧 Store 改写为 event sourcing。** 回归风险超过 O 阶段目标。
- **导出不完整但标称可恢复的全流程 Bundle。** 会造成形式可导入、科学状态实际缺失。

## 限制

- 只有经过公共 ResearchApplication 的行动产生 v1.5 ResearchEvent；旧 CLI 的内部调用尚未事件化。
- pending receipt 目前只能查询和人工审计，自动 reconciliation 留给后续阶段。
- fork 从当前节点创建，历史节点重放需要更多领域事件覆盖。
- Bundle v1 只支持范围阶段项目，不包含 Artifact 文件和完整实验图。
