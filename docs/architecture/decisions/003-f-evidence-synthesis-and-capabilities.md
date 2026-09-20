# ADR 003: F 阶段证据综合与能力契约

状态：accepted
日期：2026-09-20

## 决策

F 层使用独立 EvidenceSynthesisStore，在同一 SQLite 事实库中保存 SearchProtocol、ScreeningDecision、EvidenceMap、EvidenceGap、ClosestWorkComparison 和 capability invocation。A 层 Source/DocumentVersion/Passage/Claim 仍是原始事实；F 对这些对象只保存 ID 引用，不复制正文。

Confirmatory HypothesisSet 必须引用 frozen EvidenceMap。关键 premise 和 direct result 必须引用 full-text Passage；abstract/metadata 只能作为背景、uncertain 或 coverage gap。coverage incomplete 或高严重度未解决 gap 时，novelty 必须为 `unresolved`。

EvidenceMap freeze 时对 map metadata、screening decisions、entries、gaps 和 closest-work comparisons 生成统一 snapshot hash；HypothesisSet 引用该 frozen map ID，后续对象据此回溯同一证据快照。

Skills 在 confirmatory workflow 中使用版本化 CapabilityManifest 和显式 invocation；旧 ResearchEngine 的截断方法文本只保留在 smoke 兼容路径。

## 原因

- 将检索结果与证据综合分开，保留纳排决定、矛盾和遗漏范围。
- 让 novelty、hypothesis 和最终 claim 读取同一冻结证据快照。
- skill hash、输入输出 hash、side effect、预算和失败语义可以审计。
- 保留 A 层成熟检索和 v1.1 smoke 路径，避免复制索引与全文。

## Migration

`migrations/004_evidence_synthesis.sql` 将全局 schema version 从4升级到5。升级前使用 SQLite online backup 并生成 artifact manifest snapshot，migration 在事务中执行。Ledger、EvidenceStore 和 ResearchStore 接受 version 5。

## 硬门

1. SearchProtocol 至少包含 problem、method、adjacent 三类查询。
2. Screening 保存 source/document version hash、决定、理由、执行者和时间。
3. critical premise 需要 full-text Passage；background 不得满足 critical gate。
4. scoped novelty 需要有 passage 证据的 resolved closest-work comparison；exact overlap 不能声明 scoped novelty。
5. active target/null/rival 需要判别性 observation 和预声明 update rule。
6. confirmatory hypothesis evidence 必须来自同一 frozen EvidenceMap。

## 限制

F benchmark 验证的是确定性 domain gate，不证明 LLM 能正确筛选真实文献。真实模型的问题形成、证据判断和研究价值仍需 H 阶段案例与人工评估。
