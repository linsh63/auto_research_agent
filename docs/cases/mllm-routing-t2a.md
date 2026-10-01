# T2a 案例：RIO 多模态路由公共 SDK 迁移

## 研究身份与边界

本阶段迁移已有的 `mllm-routing-generalization` 研究，不重新训练或推理 Qwen 模型。源仓库锁定在 commit `a954fc66fa44854df37fc5535e97380793eb4648`，工作区在迁移时为 clean。[T2A-E1]

原研究的受限结论保持不变：回答格式路由在 RIO 确认集达到 1.0 准确率，但任务需求与回答格式存在混杂，只支持 RIO 格式内 transport；不支持通用语义路由、跨数据集泛化、因果机制或方法新颖性。[T2A-E2]

## 冻结证据

`source-lock.json` 固定：

- 最终分析、最终报告、protocol 和 dataset manifest；
- 三个模型的六份确认预测文件；
- 五个 RIO image unit 的 clean、object attack、text attack 图像，共 15 张真实 JPEG；
- 每个文件的字节数和 SHA-256；
- 三个模型在最终分析中登记的 direct/masked source hash。

Source lock 的 manifest hash 为 `2e2e2c6a7ea0a28fbfc420bf053564a71c2bf23f69605f016367d8513f4e682f`。[T2A-E3]

## 新执行

T2a 通过公共 Core Service 和 ResearchClient：

1. 创建并批准一个迁移 Project；
2. 提交 Bubblewrap Job；
3. 由 Worker lease 执行禁网 artifact reanalysis；
4. 验证全部 25 个锁定文件；
5. 对五个 image unit 重算 45 条路由判断；
6. 验证三个模型 source hash 和冻结的 80-image aggregate estimate；
7. 通过 Worker 协议提交 evaluation Artifact；
8. 导出 Bundle v2 并导入第二个 Core Service 实例。

Job 没有模型 API 调用、GPU 使用或新模型输出。它是新的真实执行，但科学角色是迁移完整性和冻结制品复核。[T2A-E4]

## 结果

| 项目 | 结果 |
| --- | --- |
| 锁定研究文件 | 10/10 通过 hash 与大小检查 |
| 真实 JPEG | 15/15 通过 hash、大小和 JPEG 边界检查 |
| 抽样路由记录 | 45 条 |
| 抽样路由准确率 | 1.0 |
| 冻结独立单位 | 80 张图像 |
| 冻结聚合效应 | 0.04074074074074074 |
| 冻结 95% 区间 | [0.024580618382976576, 0.056900863098504895] |
| 新 evaluation Artifact | `809c7cb6d76210abd8791d2471671d2d0f9b1c88e06f8ff4819dc45e0d47bd1b` |
| Worker Job | succeeded |
| Bundle Artifact | embedded，目标实例 available |

Bundle 导入状态为 `degraded`，唯一原因是 T1 按设计脱敏了终态 Job 的源执行路径，历史可读但 retry 前必须重绑定环境。这不是科学结果或 Artifact 缺失。[T2A-E5]

## 证据索引

| ID | 证据 | SHA-256 / 标识 |
| --- | --- | --- |
| T2A-E1 | 源 Git commit 与 clean 检查 | `a954fc66fa44854df37fc5535e97380793eb4648` |
| T2A-E2 | 源最终报告与最终分析 | `3d6e3e...a9c9`、`fb6324...2a65`，完整值在 source lock |
| T2A-E3 | [source-lock.json](../../examples/scenarios/mllm-routing/source-lock.json) | `2e2e2...e682f` |
| T2A-E4 | [T2a 机器运行记录](../reports/validation/t2a-mllm-run.json) | Project、Job、audit、event 和 execution 字段 |
| T2A-E5 | 同一机器运行记录中的 Bundle compatibility 与 dependencies | Bundle hash 随该次导出登记 |

## 限制

- 五个 image unit 的 45 条记录只验证迁移执行路径；80-image 推断仍来自已冻结的 v1.4 分析。
- 未进行新的模型推理或独立 replication。
- 未解除 object-ignore 多选格式与 text-read 开放答案之间的构念混杂。
- 本阶段不能据此提高原有主张等级。
