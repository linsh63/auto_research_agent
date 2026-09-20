# ADR 004: G 阶段确认实验、统计与本地沙箱

状态：accepted
日期：2026-09-20

## 决策

G 使用版本化 StudyDesign 将 frozen protocol、HypothesisSet 和 EvidenceMap 接入实验执行。训练 seed 是正式支持模板的独立实验单位；corruption group 是 seed 内的重复测量，不能作为独立复制。

探索只能读取 train/validation role。CandidateFreeze 固定 search node、代码、配置、protocol、analysis plan 和 data manifest hash；人工批准后才签发一次性 confirmation token。token 消费与 study 状态转换在同一事务内完成，随后禁止返回 exploration。

统计由版本化 TypeScript adapter 计算，LLM 不参与数值计算。首批支持 paired repeated-run 与 `training seed × corruption group`：报告原始差值、seed-level effect size、t interval、诊断、Holm multiplicity 和 leave-one-seed-out sensitivity。

agent生成或修改的代码使用 bubblewrap：无网络 namespace、独立可写 workspace、只读数据、清理环境、prlimit、进程组回收和单 GPU device bind。固定哈希可信脚本仍可使用受限 process runner。

## 原因

- seed 与corruption层级分开，避免把重复测量当独立样本。
- confirmation capability 在批准前不暴露路径，减少测试集逐步泄漏。
- candidate freeze 让确认结果对应唯一代码、配置和分析计划。
- 本机无Docker权限，但bubblewrap/user namespace和NVIDIA device bind已实际可用。

## Migration

`migrations/005_study_analysis.sql` 将 schema version 从5升级到6。迁移前保存 SQLite online backup 和 artifact manifest，DDL 在事务内执行。

## 验证边界

F/G fixture 验证的是执行契约和统计实现。真实 CIFAR 数据、实际模型形成研究问题和最终 claim 属于 H 阶段。
