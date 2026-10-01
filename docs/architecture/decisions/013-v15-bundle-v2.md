# ADR 013：Research Project Bundle v2

状态：accepted

## 决策

1. Bundle v2 使用显式允许表的项目快照，不导出整库文件、SQLite page 或任意表。
2. 快照按 core、research、evidence、study、review、interaction、jobs、memory 分区；每行、每分区、插件集合、Artifact 集合和整个 Bundle 分层计算 SHA-256。
3. 导入先完成 schema、列、行哈希、分区哈希、根哈希、主键冲突、插件和 Artifact 检查；出现 blocked 问题时不创建 Project。
4. 导入阶段只允许目标 Workspace 重映射。相关 Project、Event、Projection 和 Job payload 确定性更新并重新计算受影响哈希。
5. 活动中的 queued/running Job 禁止导出。终态 Job 的源 workspace、绝对脚本和 Pi session 路径会脱敏；导入后 retry 必须先显式重绑定环境。
6. 已消费 confirmation token 只保留状态，token hash 替换为与原 secret 无关的确定性占位；未消费 token 完全省略并要求目标重新签发。
7. command receipt、service/secret audit、Job lease、confirmation grant 和跨 Project derivation 不进入 Bundle。
8. 插件只导出版本、内容哈希、来源身份、权限和 descriptor lock。导入不会安装、启用或执行插件。
9. 导入插件锁写入 Project requirement；只有目标 Workspace 中 exact version/hash 的 enabled 插件才能满足 requirement。
10. Artifact 支持 embedded、content_addressed、missing 和 private_omitted；私有内容不内嵌，本地绝对数据路径改写为 `bundle://artifact/<hash>`。
11. Bundle v1 保持显式导出和导入兼容；`project.bundle` 默认生成 v2。

## 兼容状态

- `ready`：所有强制 schema、插件和 Artifact 条件满足。
- `degraded`：Project 可读，但存在缺失插件、缺失 Artifact、私有内容或需要重签发/重绑定的能力。
- `blocked`：core/schema 不兼容、未知表、主键冲突或其他不能安全导入的问题。

哈希、结构或嵌入内容被篡改时直接拒绝，不生成兼容报告来掩盖完整性错误。

## 数据完整性

- 全局证据只沿当前 Project 的 EvidenceMap、screening 和 claim 引用导出。
- Evidence 与 Memory 的 FTS 索引不进入 Bundle，导入后由基础记录确定性重建。
- Project memory 只导出 `namespace=project` 且 `sourceRunId=projectId` 的明确归属记录。
- Workspace 插件在 Bundle 中转为当前 Project 的依赖锁，不在目标 Workspace 自动全局启用。
- 导入追加 `project.imported` 事件，并重新计算 read model projection。

## 限制

- 跨分支 derivation 只由 Project lineage ID 保留，尚不递归打包整个 Project 家族。
- 没有显式 Project 归属的旧 memory 不会被猜测归入当前项目。
- content-addressed 但未内嵌的 Artifact 需要目标已有相同 CAS 内容，否则报告 missing。
- T2 才会用两个真实 Scenario 验证 Bundle v2 的案例级迁移。
