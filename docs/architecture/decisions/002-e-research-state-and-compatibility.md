# ADR 002: E 阶段研究状态、版本与兼容策略

状态：accepted
日期：2026-09-20
阶段：v1.2 E / `v1.2.0-alpha.1`

## 背景

v1.1 的 `ResearchEngine` 能运行一条固定的 evidence → hypothesis → plan → experiment 线，但不能表达问题版本、protocol freeze、确认数据可见性或由已观察结果派生新研究。直接重写旧状态机会破坏已有 v1.1 run 和 `smoke` 案例。

## 决策

E 阶段增加独立的 versioned research graph：`ResearchProgram → ResearchQuestion → ResearchProtocol`，并通过 `WorkflowCoordinator` 处理 scope/protocol approval、freeze、deviation、visibility 和 derivation。旧 `ResearchEngine` 保留为 `smoke` 兼容路径；v1.2 confirmatory workflow 不把新状态塞回旧 `switch`。

所有研究对象保存 canonical JSON SHA-256。scope 和 protocol approval 保存审批时的对象 hash；protocol freeze 只允许对 approved 且未冻结的对象执行。confirmation/test visibility 写入不可变事件，之后原 program 不能继续 exploration，只能派生新 program。

## 数据库与迁移

- `migrations/003_research_protocol.sql` 创建研究程序、问题、protocol、审批、freeze、deviation、visibility 和 derivation 表；`003b_research_cognitive_objects.sql` 补充 AssumptionRegister/HypothesisSet，schema version 到4。
- ResearchStore 使用 SQLite online backup API，并在迁移前生成 artifact manifest snapshot。
- Ledger 与 EvidenceStore 接受 schema version 4，旧表和旧 run 保持可读。
- 新对象无法从旧记录确定推导时不填充默认科学事实；旧 run 只读引用。

## 状态不变量

1. 没有 selected question 不能 approve scope。
2. 没有 scope approval 不能创建 protocol。
3. 没有 protocol approval 不能 freeze。
4. frozen protocol 不能原地再次 freeze 或修改；修改必须创建新 protocol version。
5. confirmation/test visibility 只能登记一次同一 data role；之后 exploration 被阻止。
6. 派生 program 保存父 program、原因和已观察数据，不继承为已冻结 confirmation。
7. confirmation/test visibility 后，原 program 的问题、scope、protocol 和 deviation 写操作全部拒绝；只能派生新 program。
8. 未决 deviation 不能进入 confirmation；批准 deviation 生成新 draft protocol，必须重新 approval/freeze；驳回 deviation 保留审计记录并恢复原 frozen protocol。

## 备选方案与取舍

- 直接扩展 `ResearchEngine`：改动较少，但会把 v1.2 版本图和 v1.1 线性状态混在一起，回滚和兼容难以证明。
- 单一 JSON blob：开发快，但无法对审批、freeze、visibility 和跨对象引用建立事务性门禁。
- 新建独立数据库：隔离简单，但旧 evidence、memory 和 run 不能在同一事实库中追溯。

选择同一 SQLite 事实库加新增表，兼顾 lineage、事务和旧记录只读兼容。

## Corrective release

首次 alpha 实现的独立验收发现上述不变量缺口；`v1.2.0-alpha.1-r1` 补齐 aggregate、mutation guard、deviation resolution、online backup、artifact manifest 和 schema 3→4 测试。复验结果见 [corrective release report](../../reports/releases/v1.2.0-alpha.1-r1-report.md)。

## 已知限制

E 阶段只建立研究对象和门禁，不实现 F 阶段的 EvidenceMap/竞争假设内容生成，也不实现 G 阶段的统计和 confirmation runner。CLI 输入目前通过 Zod contract 解析；真实 LLM 问题生成在 H 阶段验收。
