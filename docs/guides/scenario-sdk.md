# Scenario SDK 指南

## TypeScript

Scenario 只从公共子路径导入：

```ts
import type { ResearchScenario, ScenarioManifest } from "auto-research-agent/scenario";
```

`ResearchScenario` 包含：

- `DataAdapter`：返回数据角色、manifest hash、封存状态和实验单位；
- `ExperimentRunner`：只创建公共 JobSpec，不直接运行进程；
- `Evaluator`：确定性解析 metric、缺失原因和实验单位；
- `Analyzer`：声明 estimand、聚类单位、方法、区间和敏感性分析；
- `DomainCapability`：可选领域能力；
- `ScenarioManifest`：版本、兼容范围、权限、预算、执行器和 Artifact。

执行前调用 `negotiateScenario()`；创建 Job 后调用 `assertScenarioJob()`。后者阻止 Scenario 超出声明的 CPU、内存、磁盘、GPU 或时间墙，也阻止未声明 confirmation 权限的 Job。

完整公共示例位于 `examples/scenarios/public-typescript/scenario.ts`。

## Python

将仓库的 `python/` 放入 Python path：

```python
from research_sdk import validate_manifest, negotiate, assert_job_budget
```

`generated_models.py` 根据 17 份 Python SDK 所需的公共 JSON Schema 生成，并记录每份 schema 的 SHA-256。`npm run check:python-sdk` 会阻止 TypeScript/JSON Schema/Python 类型漂移。

Python SDK 只包含契约、协商、预算检查和 transport independent WorkerClient，不复制科研状态机。示例位于 `examples/scenarios/public-python/scenario.py`。

## 权限和失败语义

权限包括文件读写、网络、进程、GPU、模型、密钥、confirmation 和宿主完全访问。Capability 使用的权限必须是 manifest 权限的子集。

稳定失败类型与 Job 一致：environment、data、scientific、budget、timeout、cancelled 和 worker_lost。Scenario 返回失败分类，是否重试仍由 Kernel/用户决定。

## 边界门禁

```bash
npm run check:scenarios
```

该检查禁止示例 Scenario 和 Python SDK 引用内部 Store、Application、Domain 或 migration。TypeScript 示例只能导入 `auto-research-agent/scenario`。
