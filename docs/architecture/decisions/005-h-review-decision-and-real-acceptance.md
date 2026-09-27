# ADR 005：H 阶段审查、研究决策与真实验收

状态：accepted
日期：2026-09-22

## 决策

H 将最终结论表示为 `ClaimAssessment`。每项 assessment 必须关联 frozen protocol、EvidenceMap、completed AnalysisRun、统计 estimate、支持与反证、适用范围、替代解释和失效条件。没有外部复现时禁止使用 `replicated` 等级。

最终决策前分别执行 evidence、methods、statistics、reproducibility 四维审查。每个 reviewer 使用独立、只读的 pi session，保存 provider/model、冻结输入 hash、usage、输出 hash 和独立性等级。同一底层模型只能登记 session 独立，不能声称模型或提供方独立。

major finding 必须得到带证据的 response 或登记为 accepted limitation；`invalid` verdict 阻止 `publish_bounded_result`。最终动作只允许规划列出的有界终态，并由人工门批准。

真实验收使用 CIFAR-10/CIFAR-10-C、三颗训练 seed、单 GPU、固定 12 epochs。探索只暴露 brightness 与 defocus blur severity 3；confirmation 的 clean test、Gaussian noise 与 contrast severity 3 只有 CandidateFreeze 人工批准并消费一次性 token 后才能挂载。LLM 负责问题、假设、协议叙述、解释与审查；数据划分、训练配置、统计和门禁由确定性代码执行。

## 原因

- claim 与 observation、analysis 和 evidence 显式连接，避免报告强度超过证据。
- 四维审查把证据、设计、统计和复现问题分开定位，并保留 response 历史。
- 模型调用账本使真实 LLM 验收、失败与成本可核对。
- confirmation capability 防止在候选选择期间逐步窥视保留数据。

## Migration

`migrations/006_claim_review_decision.sql` 将 schema version 从 6 升至 7，新增 role session、model invocation、claim assessment、validity threat、review、response、decision和reproduction manifest表。迁移前保存 SQLite online backup 与 artifact manifest。

## 已知环境限制

当前共享主机的 PyTorch cuDNN 初始化返回 `CUDNN_STATUS_NOT_INITIALIZED`。真实案例使用确定性的原生 CUDA convolution；bubblewrap 继续断网并只映射 GPU 0。AugMix 三路前向使用 activation checkpointing，并把 PyTorch/BLAS CPU 线程固定为 4，以避免 `RLIMIT_CPU` 按线程累计触发 SIGKILL。所有失败探针作为 sandbox run 或过程记录保留。
