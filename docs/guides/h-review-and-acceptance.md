# H 审查与真实验收指南

H 在 G 的 frozen study 和一次性 confirmation capability 之上增加 claim assessment、四维审查、response、研究决策和 reproduction manifest。

## 默认预算

项目配置沿用以下安全默认值，具体 run 可以在 protocol 冻结前调低：

```yaml
budgets:
  wallHours: 24
  gpuHours: 12
  diskGiB: 20
  modelCalls: 20
  knownCostUsd: 10
```

`ReviewWorkflow` 在第 20 次已登记调用后拒绝继续调用模型。已知调用成本记录在 `model_invocations`；本地模型成本为 0，但 token usage 仍保存。实验 GPU、墙钟和 sandbox 失败记录在 `resource_usage` 与 `sandbox_runs`。

## 人工门

1. **scope**：选择一个模型生成的问题，然后执行 `research select-question` 与 `research approve-scope`。
2. **protocol**：审阅 hypothesis、outcome、数据角色、停止规则和分析计划，然后执行 `research approve-protocol` 与 `research freeze-protocol`。
3. **candidate**：审阅 exploration 结果及所有冻结 hash，然后执行 `research candidate-approve`。只有此后才能签发并消费 confirmation token。
4. **final claim**：审阅 ClaimAssessment、validity threats、四维 review 和 response，再执行 `research decision`。

每个门必须保存 `actor=user` 的结构化记录。高层的“自动完成”指令不能替代具体对象的审批。

## Review CLI

```text
research claim-assessment <assessment.json>
research validity-threat <threat.json>
research review <program-id> <study-id> <dimension> <snapshot.json>
research respond-review <response.json>
research reproduction-manifest <manifest.json>
research model-invocations <program-id>
research decision <decision.json>
research review-report <program-id> <study-id> <decision.json>
```

四个 dimension 为 `evidence`、`methods`、`statistics`、`reproducibility`。review session 只有 evidence/protocol/study/analysis 的只读能力；同一模型的不同 session 只登记 session independence。

## CIFAR H 案例

案例脚本位于 `examples/cifar-h/` 与 `scripts/h_*.ts`。大型数据、checkpoint、SQLite 和运行报告保存在 `.research-data/cases/cifar-h/`，不提交 Git。

Python 可用 `H_PYTHON` 指定；bubblewrap 挂载的完整环境用 `H_PYTHON_ENV` 指定，GPU 用 `H_GPU_DEVICE` 指定。当前验收 profile 使用：

```bash
export H_PYTHON=/data0/lixinyu/miniconda3/envs/sal/bin/python
export H_PYTHON_ENV=/data0/lixinyu/miniconda3/envs/sal
export H_GPU_DEVICE=0
```

关键边界：

- exploration 代码固定为 `experiment-exploration-frozen.py`；
- confirmation 使用冻结 checkpoint，禁止重新训练；
- confirmation sandbox 只挂载 clean test、Gaussian noise severity 3 和 contrast severity 3；
- 数值分析由 `StudyWorkflow.analyzeConfirmation` 完成；
- LLM 只读取数值结果并给出有界解释与 review。

当前主机 cuDNN 不可初始化，因此案例显式关闭 cuDNN，使用原生 CUDA convolution。PyTorch/BLAS 线程固定为4，以使 `RLIMIT_CPU` 的累计语义可预测。该环境限制属于 reproduction manifest 的组成部分。
