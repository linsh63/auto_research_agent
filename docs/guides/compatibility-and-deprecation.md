# 兼容、弃用与迁移政策

## 版本面

- npm package 使用 SemVer；`1.5.0-rc.1` 是可审核候选，不是正式发布。
- Core Service、TypeScript/Python client 和 JSON Schema 使用独立的公共 schema 版本，当前为 `1.0.0`。
- Scenario SDK 版本、Plugin 的 `coreSchemaRange`/`piVersionRange` 和 Bundle 格式单独协商。
- SQLite schema 是内部持久化版本，不作为客户端 API。

同一公共 schema major 内只增加向后兼容字段或操作。未知字段仍按 strict schema 拒绝，客户端应通过 capabilities 协商，不应猜测服务功能。公共 schema major 不兼容时返回 `INCOMPATIBLE_VERSION`。

## 弃用

公共导出、命令、查询或字段的弃用必须进入 release notes 和文档，提供替代路径，并至少保留一个后续 minor release line。删除或改变语义需要新的公共 schema major。安全漏洞可能缩短周期，但必须记录原因和迁移步骤。

## 数据迁移

数据库只做前向迁移。执行迁移前创建备份和 artifact manifest；失败必须回滚事务。升级前停止写入并备份数据库、Artifact CAS 和配置。新版本写入后的数据库不能由旧版本直接打开；回滚应恢复升级前备份。

Bundle v1 保留 upcast 路径，Bundle v2 在导入前完整校验。`ready`、`degraded`、`blocked` 必须显式呈现；导入不得自动安装插件、下载 Artifact、扩大权限或恢复 secret。

## 扩展兼容

Scenario 和 Plugin 必须固定版本与内容哈希。权限扩大需要重新批准；来源漂移进入 quarantine。Pi 兼容范围必须显式声明。历史 Project 可读不代表其依赖仍可执行，缺失依赖通过 `project.dependencies` 报告。
