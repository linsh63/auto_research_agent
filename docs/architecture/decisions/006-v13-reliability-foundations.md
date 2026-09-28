# ADR 006：v1.3 可靠性基础设施

状态：accepted

## 决策

1. `ExperimentalUnit.id` 取代 seed 作为新研究的通用独立单位；seed 仅作为兼容输入。
2. 关键事实由确定性组件写入 FactLedger。LLM 必须通过 FactAssertion 引用，不能成为数值真源。
3. 关键声明和报告数字通过 fact ID 渲染；自由文字只承担定性解释。
4. 数据替换必须显式证明科学契约保持不变；protocol freeze 后沿用已有 deviation 门。
5. Bubblewrap 执行前必须完成静态运行环境预检；GPU 枚举桥属于显式、可审计的兼容模式。

## 原因

真实多模态研究中，image ID 被迫映射为 seed；本地规划和审稿模型多次写错数据集、效应值、区间和预算；POPEv2 下载失败需要人工判断 COCO 替换是否改变问题；GPU 1/2 在进入模型加载后才暴露设备枚举失败。这些问题都可能产生形式完整但事实错误的研究记录。

## 兼容性

schema 8 新增 `experimental_units`、`unit_observations`、`fact_ledgers` 和 `fact_audits`；schema 9 新增持久化 dataset substitution，并把新 study 默认策略设为 `fact_bound_v1`。旧 seeds 和 observations 不删除；迁移生成相应 training-seed 单位。已有无 FactLedger 的 v1.2 对象以 `legacy_v1_2` 明确读取，新研究强制使用 fact-bound 接口。

## 限制

FactAudit 核对已登记事实，不判断研究构念本身是否有效。定性推理、因果解释和创新性仍需 B 阶段的科学评审。GPU 枚举桥能提升兼容性，但挂载前序设备节点会削弱设备节点隔离，报告必须继续披露。
