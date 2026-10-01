# ADR 012：v1.5 Core Service、客户端 SDK 与安全边界

状态：accepted

## 决策

1. Core Service 使用 Node 内置 HTTP server，默认绑定 `127.0.0.1` 随机端口；REST 承载命令、查询和 Worker 协议，SSE 承载 ResearchEvent 与 JobLog。
2. 所有端点包括 health 都要求 Bearer token。默认 token 生成到权限为 `0600` 的独立文件，discovery 文件只保存 token 文件路径。
3. 用户可以注入 SecretProvider；外部 provider 的 secret 不写入 discovery、数据库、事件或日志。
4. 默认权限为 filesystem.read、filesystem.write、process 和 confirmation；network、model、gpu、secrets、host.full 默认关闭，因此服务默认离线且无遥测。
5. 无法证明断网的 Python executor 保守要求 network；Bubblewrap executor 可以在离线策略中运行。
6. 每个服务请求写入持久 audit，保存实际权限、外部服务、脱敏 payload hash 和结果。服务产生的 ResearchEvent 也保存权限与外部服务数组。
7. TypeScript/Python SDK 只使用版本化 HTTP/SSE 契约。TypeScript 本地客户端可以通过 discovery 自动启动服务。
8. 参考 CLI 只能导入客户端 SDK和公共 contracts，不允许访问数据库、Store、Workflow 或 migration。
9. 非 loopback bind 必须显式 `allowRemote`；Core 不内置 TLS 或云账号，远程部署应使用 SSH tunnel 或可信反向代理。

## 原因

CLI、Web 和游戏需要同一套稳定服务，而不是分别链接 SQLite。REST/SSE 足以支持当前命令、状态、候选、事件和日志，并且比在 v1.5 同时维护 REST 与 WebSocket 更小。Bearer token 和 loopback 默认给个人自托管提供明确边界，未来产品可以在外层增加不同认证方式。

## 本地生命周期

- 服务启动后原子写 `core-service.json`；文件包含 base URL、PID、token file 和 capability snapshot。
- SDK 先探测已有 discovery；失败且允许 auto start 时启动 service CLI 并等待新 discovery。
- 服务停止时关闭 SSE、HTTP、Store 和 Application，并删除属于当前 PID 的 discovery。
- 数据库迁移到 schema 15，迁移前备份，失败回滚至 schema 14。

## 权限语义

- HTTP Git/plugin refresh 需要 network，file/local source 不需要。
- plugin install/update 只需要文件权限；实际 `plugin.runtime` 还需要所有 enabled 插件的有效权限。
- Pi Job 需要 model + network；Python Job需要 process + network；Bubblewrap Job需要 process，并按请求追加 gpu/confirmation。
- 被服务策略拒绝的请求不会进入 Application，但仍留下不含 secret 的拒绝 audit。

## 限制

- SSE 当前通过持久 read model 轮询，尚未使用数据库通知或消息代理。
- 聊天 token 流接口已统一为 SSE，但 P 阶段确定性规划器不会产生模型 token delta。
- 服务没有 TLS、团队账号、多租户角色或浏览器 session；这些不属于 v1.5。
- Worker audit 在不含 Workspace/Project 的底层请求上只能记录 Worker endpoint，Job 自身仍保留 lease/log 审计。
