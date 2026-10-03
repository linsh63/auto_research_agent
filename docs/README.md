# 项目文档导航

这里集中保存项目规划、架构决策、使用指南、研究案例和验收记录。项目根目录的 [README](../README.md) 负责快速开始；本页负责完整文档导航。

## 目录结构

```text
docs/
├── planning/                 # 版本规划、路线和备选方案
├── architecture/decisions/  # 已接受的架构决策记录（ADR）
├── guides/                   # 面向使用者和开发者的操作指南
├── cases/                    # 真实研究案例、实验协议与结果边界
└── reports/
    ├── stages/               # 跨版本阶段总结和进度登记
    ├── releases/             # 每个发布版本的验收报告
    └── validation/           # 工具生成的机器可读验证结果
```

## 推荐阅读顺序

1. [v1.6 公共科研能力与跨系统规划](planning/v1.6-plan.md)：七类公共科研接口，以及后续跨系统工作。
2. [v1.5 核心产品化规划](planning/v1.5-plan.md)：已完成的 Headless Research Kernel、SDK、Worker、Scenario 和项目存档。
3. [v1.4 规划](planning/v1.4-plan.md)：泛化、机制诊断和隔离确认。
4. [v1.4 阶段报告](reports/stages/v1.4-progress.md)：最近一次真实研究和能力边界。
5. [v1.3 规划](planning/v1.3-plan.md)：可靠性基础设施，以及 B/C 联合迭代。
6. [v1.2 完整实施规划](planning/v1.2-plan.md)：确认性科研工作流与发布门禁。
7. [V1 总体规划](planning/v1-plan.md)：项目目标、首版边界和基础架构。

## 按主题查找

### 规划

- [V1 总体规划](planning/v1-plan.md)
- [v1.1 实施规划](planning/v1.1-plan.md)
- [v1.2 完整实施规划](planning/v1.2-plan.md)
- [v1.3 规划](planning/v1.3-plan.md)
- [v1.3 B/C 联合迭代计划](planning/v1.3-bc-plan.md)
- [v1.4 泛化与隔离确认计划](planning/v1.4-plan.md)
- [v1.5 Headless Research Kernel 产品化](planning/v1.5-plan.md)
- [v1.6 公共科研能力与跨系统开发](planning/v1.6-plan.md)
- [v1.5 T 阶段拆分计划](planning/v1.5-t-plan.md)
- [下一阶段备选方案](planning/next-stage-options.md)

### 架构与配置

- [ADR 001：A 阶段检索 backend](architecture/decisions/001-a-retrieval-backend.md)
- [ADR 002：E 研究状态与兼容](architecture/decisions/002-e-research-state-and-compatibility.md)
- [ADR 003：F 证据综合与能力契约](architecture/decisions/003-f-evidence-synthesis-and-capabilities.md)
- [ADR 004：G 确认实验、统计与本地沙箱](architecture/decisions/004-g-confirmation-statistics-and-sandbox.md)
- [ADR 005：H 审查、决策与真实验收](architecture/decisions/005-h-review-decision-and-real-acceptance.md)
- [ADR 006：v1.3 可靠性基础设施](architecture/decisions/006-v13-reliability-foundations.md)
- [ADR 007：v1.5 公共契约与兼容 Facade](architecture/decisions/007-v15-public-contract-boundary.md)
- [ADR 008：v1.5 Project 事件、命令收据与 Bundle](architecture/decisions/008-v15-project-events-and-bundles.md)
- [ADR 009：v1.5 ResearchAction 与执行策略](architecture/decisions/009-v15-research-actions-and-execution-policy.md)
- [ADR 010：v1.5 Job/Worker 与 Pi 复用边界](architecture/decisions/010-v15-job-worker-and-pi-reuse.md)
- [ADR 011：v1.5 Scenario SDK 与插件目录](architecture/decisions/011-v15-scenario-sdk-and-plugin-catalog.md)
- [ADR 012：v1.5 Core Service、客户端 SDK 与安全边界](architecture/decisions/012-v15-core-service-and-client-sdks.md)
- [ADR 013：v1.5 Research Project Bundle v2](architecture/decisions/013-v15-bundle-v2.md)
- [ADR 014：v1.6 系统 OpenSSH 与远程 Linux Worker](architecture/decisions/014-v16-ssh-remote-worker.md)
- [模型 Provider 配置](guides/model-providers.md)
- [H 审查与真实验收指南](guides/h-review-and-acceptance.md)
- [v1.5 公共 Kernel API](guides/public-kernel-api.md)
- [Project、事件、分支与 Bundle](guides/project-events-and-bundles.md)
- [ResearchAction、聊天候选与执行策略](guides/research-actions-and-policies.md)
- [Job、Worker 与本地执行](guides/jobs-and-workers.md)
- [Scenario SDK](guides/scenario-sdk.md)
- [Pi 插件目录与权限管理](guides/plugin-catalog.md)
- [Core Service、客户端 SDK 与参考 CLI](guides/core-service-and-sdks.md)
- [Research Project Bundle v2](guides/project-bundle-v2.md)
- [兼容、弃用与迁移政策](guides/compatibility-and-deprecation.md)
- [公共科研能力接口](guides/public-scientific-capabilities.md)
- [平台能力与跨系统调度](guides/platform-capabilities.md)
- [SSH 远程 Linux Worker](guides/ssh-remote-workers.md)
- [Portable SSH workspace 与 Artifact](guides/portable-ssh-workspaces.md)
- [Baseline 与发布评估](guides/baseline-and-release-evaluation.md)
- [Scenario 扩展教程](guides/extensions/scenario-development.md)
- [Plugin 扩展教程](guides/extensions/plugin-development.md)
- [Worker 扩展教程](guides/extensions/worker-development.md)
- [客户端 SDK 扩展教程](guides/extensions/client-sdk-development.md)
- [扩展、RFC 与 ADR 模板](templates/README.md)

### 研究案例

- [fastText / AG News 文本分类](cases/fasttext-agnews.md)
- [scikit-learn Digits 图像分类](cases/sklearn-digits.md)
- [CIFAR-10-C / AugMix H 阶段真实案例](cases/cifar10c-augmix-h.md)
- [T2a：RIO 多模态路由公共 SDK 迁移](cases/mllm-routing-t2a.md)
- [T2b：fastText / AG News 公共 SDK 迁移](cases/fasttext-agnews.md#t2b-公共-scenario-迁移)

### 阶段与发布报告

- [V1 阶段总结](reports/stages/v1-summary.md)
- [v1.1 阶段进度](reports/stages/v1.1-progress.md)
- [v1.2 阶段进度](reports/stages/v1.2-progress.md)
- [v1.3 A 阶段进度](reports/stages/v1.3-a-progress.md)
- [v1.3 B/C 联合迭代进度](reports/stages/v1.3-bc-progress.md)
- [v1.4 泛化、诊断与受限发布](reports/stages/v1.4-progress.md)
- [v1.5 N 阶段：公共契约与包边界](reports/stages/v1.5-n-progress.md)
- [v1.5 O 阶段：Project 存档、事件与分支](reports/stages/v1.5-o-progress.md)
- [v1.5 P 阶段：聊天、候选与执行策略](reports/stages/v1.5-p-progress.md)
- [v1.5 Q 阶段：Job/Worker 与 Pi 复用](reports/stages/v1.5-q-progress.md)
- [v1.5 R 阶段：Scenario SDK 与 Pi 插件目录](reports/stages/v1.5-r-progress.md)
- [v1.5 S 阶段：Core Service 与客户端 SDK](reports/stages/v1.5-s-progress.md)
- [v1.5 T1 阶段：Bundle v2 与跨实例迁移](reports/stages/v1.5-t1-progress.md)
- [v1.5 T2a 阶段：多模态 MLLM Scenario 迁移](reports/stages/v1.5-t2a-progress.md)
- [v1.5 T2b 阶段：fastText / AG News Scenario 迁移](reports/stages/v1.5-t2b-progress.md)
- [v1.5 T2 双案例总结](reports/stages/v1.5-t2-summary.md)
- [v1.5 T3 阶段：Research Capability Benchmark v1](reports/stages/v1.5-t3-progress.md)
- [Research Capability Benchmark v1 基线](reports/stages/v1.5-t3-baseline.md)
- [v1.5 T4 阶段：开源发布工程](reports/stages/v1.5-t4-progress.md)
- [v1.6 U 阶段：七类公共科研能力](reports/stages/v1.6-u-progress.md)
- [v1.6 V 阶段：跨平台基础与能力协商](reports/stages/v1.6-v-progress.md)
- [v1.6 W 阶段：SSH Host、远程安装与 stdio Worker](reports/stages/v1.6-w-progress.md)
- [v1.6 X 阶段：远程 workspace、Artifact 与 confirmation](reports/stages/v1.6-x-progress.md)
- [v1.6 Y 阶段：Baseline 与发布评估](reports/stages/v1.6-y-progress.md)
- [v1.0.1：证据与引用](reports/releases/v1.0.1-report.md)
- [v1.0.2：长期记忆](reports/releases/v1.0.2-report.md)
- [v1.0.3：自动实验迭代](reports/releases/v1.0.3-report.md)
- [A–C 重新验收](reports/releases/abc-revalidation-report.md)
- [v1.1.0：CV 第二场景](reports/releases/v1.1.0-report.md)
- [v1.2.0-alpha.1：E 研究协议与认知对象](reports/releases/v1.2.0-alpha.1-report.md)
- [v1.2.0-alpha.1：E 独立验收与整改清单](reports/releases/v1.2.0-alpha.1-e-acceptance-improvements.md)
- [v1.2.0-alpha.1-r1：E 整改复验](reports/releases/v1.2.0-alpha.1-r1-report.md)
- [v1.2.0-alpha.1-r1：E 第二次验收整改清单](reports/releases/v1.2.0-alpha.1-r1-e-reacceptance-improvements.md)
- [v1.2.0-alpha.1-r2：E 最终复验](reports/releases/v1.2.0-alpha.1-r2-report.md)
- [v1.2.0-alpha.1-r2：E 第三次验收整改清单](reports/releases/v1.2.0-alpha.1-r2-e-reacceptance-improvements.md)
- [v1.2.0-alpha.1-r3：E 最终验收](reports/releases/v1.2.0-alpha.1-r3-report.md)
- [v1.2.0-alpha.2：F 证据综合与竞争假设](reports/releases/v1.2.0-alpha.2-report.md)
- [v1.2.0-beta.1：G 实验设计、统计与确认](reports/releases/v1.2.0-beta.1-report.md)
- [v1.2.0-rc.1：H 审查、决策与真实验收](reports/releases/v1.2.0-rc.1-report.md)
- [v1.2.0：正式发布验收](reports/releases/v1.2.0-report.md)
- [v1.3.0-alpha.1：A 可靠性基础设施](reports/releases/v1.3.0-alpha.1-report.md)
- [v1.3.0-alpha.1：A 阶段严格重新验收](reports/releases/v1.3.0-alpha.1-a-reacceptance.md)
- [v1.3.0-alpha.2：A 阶段强制门禁整改](reports/releases/v1.3.0-alpha.2-report.md)
- [v1.5.0：正式发布验收](reports/releases/v1.5.0-report.md)

### 自动验证产物

- [pi SDK 探针结果](reports/validation/pi-sdk-probe.json)
- [Pi SDK Q 阶段复用审计](reports/validation/pi-sdk-q-audit.md)
- [T2a MLLM 机器运行记录](reports/validation/t2a-mllm-run.json)
- [T2b fastText / AG News 机器运行记录](reports/validation/t2b-fasttext-run.json)
- [T3 Research Capability Benchmark v1 机器基线](reports/validation/t3-capability-baseline.json)
- [T4 npm 候选包机器审计](reports/validation/t4-package-audit.json)
- [T5 最终 npm 包机器审计](reports/validation/t5-package-audit.json)
- [v1.5.0 正式发布机器审计](reports/validation/v1.5-release-audit.json)
- [T3 v1.1 公共能力机器基线](reports/validation/t3-capability-v1.1-baseline.json)
- [T3 v1.1 与 v1.0 比较](reports/validation/t3-capability-v1.1-vs-v1.0.json)
- [T3 v1.2 完整能力基线](reports/validation/t3-capability-v1.2-baseline.json)
- [T3 v1.2 确定性重复运行](reports/validation/t3-capability-v1.2-repeat.json)
- [v1.6 package-only 能力审计](reports/validation/v1.6-package-audit.json)
- [v1.6 V 本地平台能力](reports/validation/v1.6-v-platform-local.json)
- [v1.6 V package-only 安装审计](reports/validation/v1.6-v-package-audit.json)
- [v1.6 V Linux/macOS 原生矩阵](reports/validation/v1.6-v-platform-matrix.json)
- [v1.6 W 本地 SSH transport](reports/validation/v1.6-w-ssh-local.json)
- [v1.6 W package-only 安装审计](reports/validation/v1.6-w-package-audit.json)
- [v1.6 W Linux/macOS SSH transport 矩阵](reports/validation/v1.6-w-ssh-matrix.json)
- [v1.6 X 本地远端执行门禁](reports/validation/v1.6-x-local.json)
- [v1.6 X package-only 安装审计](reports/validation/v1.6-x-package-audit.json)
- [v1.6 Y 本地验收](reports/validation/v1.6-y-local.json)
- [v1.6 Y package-only 安装审计](reports/validation/v1.6-y-package-audit.json)
- [Skills 验证结果](reports/validation/skill-validation.json)
- [v1.2 正式发布人工盲评包](reports/validation/v1.2-blind-review-packet.md)
- [v1.2 正式发布机器审计](reports/validation/v1.2-release-audit.json)

## 维护约定

- 新的产品或版本计划放入 `planning/`。
- 会长期约束实现的技术决策使用编号 ADR，放入 `architecture/decisions/`。
- 操作方法和配置说明放入 `guides/`，实验协议放入 `cases/`。
- 阶段汇总与版本发布报告分别放入 `reports/stages/` 和 `reports/releases/`。
- 脚本生成的可追踪 JSON 放入 `reports/validation/`；运行日志和大型实验产物继续保存在 `.research-data/`，不提交 Git。
