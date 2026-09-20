# D 阶段 CV 案例：Digits 平移增强

## 研究问题

在分类器和数据划分保持一致时，将训练图像分别向上、下、左、右平移一个像素，是否能提高 scikit-learn Digits 图像分类的平均准确率？

该任务用于检验 agent 是否能从文本分类切换到图像分类。它不以刷新 benchmark 为目标，也不把一个小数据集上的结果外推为通用的数据增强结论。

## 场景契约

- 数据：scikit-learn 1.8.0 内置的 Digits，共 1,797 张 8×8 灰度图像；运行时数据 SHA-256 为 `5889d26819cf830d070975af3c711419825fa0a078137b3d80b8e7d06bd58da0`。
- 划分：预先声明种子 11、23、47、73、101，各自做相同的分层 75/25 holdout。
- 基线：原始训练图像上的 RBF SVC，`C=5`、`gamma=scale`。
- 候选：模型参数不变，训练集增加四个方向的一像素平移图像。
- 指标：五个 paired holdout 的 accuracy 均值，同时强制保留每个划分的结果。
- 成功条件：候选均值严格高于基线；不据此声明统计显著性。
- 资源墙：每个命令 120 秒，总流程 10 分钟，CPU 执行。

数据划分会重叠，因此五次 holdout 不是五个独立数据集。候选的有效训练样本数是基线的五倍，准确率变化必须与额外计算量一起解释。

## 复现

```bash
npm ci
python3 -m pip install -r examples/sklearn-digits/requirements.lock.txt
npm run validate:cv
```

`validate:cv` 会重建 `.research-data/cases/sklearn-digits/`，通过计划审批和最终审批两个门，执行真实 baseline/candidate，生成 SQLite 账本、原始日志、源码快照、研究报告和 `result.json`。为使案例无需付费 API 即可稳定重放，假设、分析和审查使用受 schema 约束的确定性审计 model adapter；实验指标均来自真实 scikit-learn 执行。

## 2026-09-20 结果

| Split seed | Baseline | Candidate | 差值 |
| ---: | ---: | ---: | ---: |
| 11 | 0.991111 | 0.993333 | +0.002222 |
| 23 | 0.993333 | 0.993333 | 0.000000 |
| 47 | 0.988889 | 0.993333 | +0.004444 |
| 73 | 0.991111 | 0.993333 | +0.002222 |
| 101 | 0.995556 | 0.993333 | -0.002222 |
| **Mean** | **0.992000** | **0.993333** | **+0.001333** |

预先定义的均值成功条件通过，但效果很小，而且包含一次负结果。最终结论限定为：在这五个 Digits holdout 和这个固定 RBF SVC 上，平移增强让均值提高约 0.13 个百分点；该结果没有证明一般性的增强收益。

## 执行 profile

本次为 `local-process` profile。主机有 Docker 28.3.3 客户端，但当前用户不属于 `docker` 组，访问 `/var/run/docker.sock` 返回 permission denied；因此不能登记真实 Docker 隔离为已通过。Docker 参数与安全边界仍由已有自动测试覆盖。
