# Scenario 扩展教程

1. 复制 `docs/templates/scenario/` 到独立仓库。
2. 只从 `auto-research-agent/scenario` 导入类型和校验器。
3. 在 manifest 声明四类必需 capability、执行器、最小权限、预算和 Artifact。
4. DataAdapter 必须记录数据角色、内容 hash、sealed 状态和实验单位。
5. ExperimentRunner 只返回 JobSpec；执行由 Core Worker 完成。
6. Evaluator 按实验单位返回结果，缺失值必须带原因；Analyzer 声明 estimand、聚类单位、方法和敏感性。
7. 用 `negotiateScenario` 与目标核心协商，再用 `assertScenarioJob` 检查资源不超过 manifest。

测试至少覆盖：正常协商、缺少权限、不兼容 schema、资源超限、数据 hash 变化、实验失败和 Artifact 缺失。Scenario 不应导入数据库、内部 Store、Workflow 或 migration。
