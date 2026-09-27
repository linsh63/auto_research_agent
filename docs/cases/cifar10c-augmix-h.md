# CIFAR-10-C / AugMix：H 阶段真实研究案例

状态：**完成，终态为 `publish_bounded_result`**
日期：2026-09-27

## 研究问题

在固定的小型 CIFAR-10 ResNet-18、三颗训练 seed 和单 GPU 资源下，AugMix 相比 standard training 是否提高预声明保留组的 mean corruption accuracy？

本案例验证科研 pipeline，不主张 AugMix 或 CIFAR-10-C 的方法新颖性。closest-work 状态为 partial overlap，novelty 状态保持 unresolved。

## 证据边界

- [Benchmarking Neural Network Robustness to Common Corruptions and Perturbations](https://arxiv.org/abs/1903.12261)：CIFAR-10-C benchmark 与 common corruption 评估。
- [AugMix: A Simple Data Processing Method to Improve Robustness and Uncertainty](https://arxiv.org/abs/1912.02781)：所选训练干预及其既有证据。
- [On Calibration of Modern Neural Networks](https://proceedings.mlr.press/v70/guo17a.html)：calibration 背景。
- [mixup: Beyond Empirical Risk Minimization](https://arxiv.org/abs/1710.09412)：scope 阶段筛选的邻近方法。

四篇 full text 均保存内容 hash 与 passage provenance。检索不是系统综述，因此不支持“首次”或完整 novelty 声明。

## Frozen protocol

- architecture：torchvision ResNet-18，CIFAR stem，从头训练；
- seeds：11、23、47；
- epochs：固定12，不按 interim result 或 p-value 停止；
- experimental unit：独立训练 seed；corruption group 是 seed 内重复测量；
- exploration：brightness 与 defocus blur，severity 3；
- confirmation：Gaussian noise 与 contrast，severity 3；clean test 是 secondary outcome；
- primary：每颗 seed 内两个 confirmation group accuracy 的均值，再做 candidate-minus-baseline seed-level paired analysis；
- minimum meaningful effect：0.01 absolute accuracy；
- interval：95% t interval；同时报告 paired standardized effect、diagnostics 与 leave-one-seed-out sensitivity。

## 数据隔离与人工门

scope、protocol 与 candidate 三个人工门均由用户明确批准。CandidateFreeze 固定 protocol、analysis plan、代码、配置、数据 manifest 和 checkpoint hashes。confirmation token 只签发并消费一次；之前的 exploration sandbox 没有挂载 clean test、Gaussian noise 或 contrast 路径。

## 结果

### Primary outcome

| Seed | Baseline mean | AugMix mean | Difference |
| ---: | ---: | ---: | ---: |
| 11 | 0.63275 | 0.79330 | +0.16055 |
| 23 | 0.64250 | 0.79290 | +0.15040 |
| 47 | 0.63465 | 0.76640 | +0.13175 |

确定性 seed-by-corruption 分析：

- mean difference：**+0.14757**；
- 95% interval：**[+0.11128, +0.18386]**；
- paired standardized effect：10.102；该数值因三颗 seed 的差值高度一致而很大，不能解释为跨任务通用效应；
- independent units：3；
- complete pairs：6/6；
- leave-one-seed-out estimates：0.14108、0.14615、0.15547，方向稳定。

### Secondary observations

| Seed | Clean accuracy difference | Clean ECE difference |
| ---: | ---: | ---: |
| 11 | -0.0008 | -0.01182 |
| 23 | +0.0093 | -0.01493 |
| 47 | +0.0088 | -0.01383 |

这些 secondary observations 没有替代 primary analysis，也没有用于选择新的 candidate。

## ClaimAssessment

候选 claim：

> 对于使用 seeds 11、23、47 训练的该 CIFAR ResNet-18，AugMix 相比 standard training 在保留的 Gaussian-noise 与 contrast severity-3 groups 上将 mean accuracy 提高 0.1476；95% interval 为 0.1113 至 0.1839。

grade：**suggestive**。

模型建议 `supported`，系统保守降为 suggestive，因为独立 seed 只有3颗、只有一个 architecture、两个 corruption groups 和一个 severity。结果不能外推到完整 CIFAR-10-C、其他架构、其他训练长度或其他 AugMix 实现。

## 四维审查

evidence、methods、statistics、reproducibility 均由实际 7B 模型通过独立只读 pi session 审查，verdict 均为 `needs_work`。共10条 findings：

- 新增 seeds、corruption groups、架构或数据集的请求登记为 accepted limitation；
- 范围限制、数值区间、sensitivity、hash 和报告字段用已有结构化对象响应；
- major finding 要求限制外部泛化，已由 ClaimAssessment scope 处理；
- response 后 open finding 为0。

## 资源与执行限制

- 模型调用：15/20，9成功、6个结构或模型失败；已知成本0 USD；
- GPU 与 sandbox resource usage：约3.374 GPU小时；
- artifact 目录：约855 MiB；
- 单 run 和总运行均在 12 GPU-hour、24小时、20 GiB 与10 USD 上限内；
- 12次成功 sandbox run，6次失败 run 全部保留。

当前主机 cuDNN 初始化失败，因此固定使用原生 CUDA convolution。AugMix 使用 activation checkpointing，并将 PyTorch/BLAS 线程固定为4，避免 `RLIMIT_CPU` 按线程累计触发 SIGKILL。以上限制进入 reproduction manifest。

## 最终决定

四维 review 没有 invalid verdict，major finding 已响应。第四个人工门由用户批准，最终终态为 `publish_bounded_result`，只发布上述范围受限的 suggestive claim。
