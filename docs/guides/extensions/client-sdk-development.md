# 客户端 SDK 扩展教程

客户端启动时先调用 capabilities，检查 Core Service 与公共 schema 版本。所有状态变更使用版本化 Command；读取使用 Query；长任务进度通过 SSE 和 Job logs。命令必须使用唯一 idempotency key，并保留 `in_doubt` 等不确定结果，不能盲目重放。

上层 CLI、Web 和游戏共享同一 ResearchAction。UI 可以改变呈现方式，但不能自行批准 scope、confirmation、插件权限或发布门禁。候选模式必须保留自由输入。

Secret 由 SecretProvider 或部署环境提供，不放入配置、Bundle、URL、日志或前端存储。远程连接需要 TLS 或可信隧道。客户端应展示 `ready`、`degraded`、`blocked`、`not_evaluated` 和失败类型，不把它们压成一个成功布尔值。
