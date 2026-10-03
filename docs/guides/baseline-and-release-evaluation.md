# Baseline 与发布评估

Y 阶段新增两个无模型、确定性的公共门禁。

## BaselineSpec / BaselineResult

`baseline.evaluate` 接收：

- protocol hash 和 data manifest hash；
- 实验单位、指标和方向；
- 预期 run ID 完整集合；
- 预期区间和绝对容差；
- 每个 run 必须产生的 Artifact 名称。

每个 `BaselineRun` 明确成功或失败、观测值、失败分类和 Artifact manifest。评估器拒绝缺失或额外 run、重复 run、协议/数据漂移、实验单位漂移、失败 run、缺 Artifact 和越过容差。结果包含稳定的内容 hash，并作为 `baseline.evaluated` Project 事件保存。

候选探索 Job 设置 `executionPhase: "exploration"`，并引用 `baselineGate.resultId/resultHash`。Core 只接受同一 Project 中状态为 `passed` 且 ID/hash 完全匹配的事件。直接构造结果、引用失败结果或引用其他项目结果都不能打开探索门禁。本地和 SSH Worker 接收相同 JobSpec，不各自解释 baseline。

## release.evaluate

`release.evaluate` 是只读查询，统一汇总八类证据：migration、Bundle、真实 Scenario、T3、package、license、secret 和 platform matrix。每项状态只能是：

- `passed`：需要至少一个审计 Artifact hash；
- `failed`：强制项阻断；
- `not_evaluated`：保留未知状态并阻断强制项。

缺失的检查自动补为 `not_evaluated`。结果列出 blocker 和已知限制，并固定返回 `sideEffects: "none"`；接口不会创建 tag、GitHub Release 或执行 npm publish。
