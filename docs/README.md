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

1. [v1.2 完整实施规划](planning/v1.2-plan.md)：下一版本的确定决策、任务顺序、验收案例和发布门禁。
2. [V1 总体规划](planning/v1-plan.md)：项目目标、首版边界和基础架构。
3. [V1 阶段总结](reports/stages/v1-summary.md)：最小科研闭环的实际完成情况。
4. [v1.1 实施规划](planning/v1.1-plan.md)：证据、记忆、实验搜索和第二场景的完整设计。
5. [v1.1 进度登记](reports/stages/v1.1-progress.md)：A–D 各阶段的实施与验收状态。
6. [v1.1.0 发布报告](reports/releases/v1.1.0-report.md)：当前版本的最终门禁与已知限制。

## 按主题查找

### 规划

- [V1 总体规划](planning/v1-plan.md)
- [v1.1 实施规划](planning/v1.1-plan.md)
- [v1.2 完整实施规划](planning/v1.2-plan.md)
- [下一阶段备选方案](planning/next-stage-options.md)

### 架构与配置

- [ADR 001：A 阶段检索 backend](architecture/decisions/001-a-retrieval-backend.md)
- [模型 Provider 配置](guides/model-providers.md)

### 研究案例

- [fastText / AG News 文本分类](cases/fasttext-agnews.md)
- [scikit-learn Digits 图像分类](cases/sklearn-digits.md)

### 阶段与发布报告

- [V1 阶段总结](reports/stages/v1-summary.md)
- [v1.1 阶段进度](reports/stages/v1.1-progress.md)
- [v1.2 阶段进度](reports/stages/v1.2-progress.md)
- [v1.0.1：证据与引用](reports/releases/v1.0.1-report.md)
- [v1.0.2：长期记忆](reports/releases/v1.0.2-report.md)
- [v1.0.3：自动实验迭代](reports/releases/v1.0.3-report.md)
- [A–C 重新验收](reports/releases/abc-revalidation-report.md)
- [v1.1.0：CV 第二场景](reports/releases/v1.1.0-report.md)
- [v1.2.0-alpha.1：E 研究协议与认知对象](reports/releases/v1.2.0-alpha.1-report.md)
- [v1.2.0-alpha.1：E 独立验收与整改清单](reports/releases/v1.2.0-alpha.1-e-acceptance-improvements.md)
- [v1.2.0-alpha.1-r1：E 整改复验](reports/releases/v1.2.0-alpha.1-r1-report.md)
- [v1.2.0-alpha.1-r1：E 第二次验收整改清单](reports/releases/v1.2.0-alpha.1-r1-e-reacceptance-improvements.md)

### 自动验证产物

- [pi SDK 探针结果](reports/validation/pi-sdk-probe.json)
- [Skills 验证结果](reports/validation/skill-validation.json)

## 维护约定

- 新的产品或版本计划放入 `planning/`。
- 会长期约束实现的技术决策使用编号 ADR，放入 `architecture/decisions/`。
- 操作方法和配置说明放入 `guides/`，实验协议放入 `cases/`。
- 阶段汇总与版本发布报告分别放入 `reports/stages/` 和 `reports/releases/`。
- 脚本生成的可追踪 JSON 放入 `reports/validation/`；运行日志和大型实验产物继续保存在 `.research-data/`，不提交 Git。
