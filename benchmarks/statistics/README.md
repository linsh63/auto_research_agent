# G statistics oracle

固定 fixture 将训练 seed 作为独立实验单位，将 corruption group 作为同一 seed 下的重复测量。Oracle 使用 NumPy/SciPy 计算 seed-level paired mean、t interval、paired effect size、leave-one-seed-out sensitivity 和 group-level Holm adjustment。

TypeScript 结果与 oracle 的主估计、SE、区间和effect size容差为 `1e-4`，multiplicity容差为 `1e-6`。缺失配对、错误实验单位和未登记 outcome 由单元测试单独拒绝。
