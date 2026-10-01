# ADR 010：v1.5 Job/Worker 与 Pi 复用边界

状态：accepted

## 决策

1. 复用 Pi 的 SessionManager、事件流、工具生命周期和 abort，不复制 LLM session runtime。
2. 核心 schema 13 补充 Pi 不提供的持久 Job queue、attempt、lease、heartbeat、日志、Artifact 和资源调度。
3. Worker 使用版本化、语言无关的 lease token 协议；协议不依赖共享进程或 TypeScript 实现。
4. 首个本地 Worker host 支持 Python、Bubblewrap 和可注入的 PiJobRunner。
5. Python runner 使用 JSONL stdio 协议、独立进程组和 OS resource limits；confirmation 禁止使用 Python executor。
6. Bubblewrap executor 只使用 Job lease 下发的只读授权 mount。用户提交的 Job 不能自行指定外部 mount。
7. confirmation token 在提交时校验并只保存哈希，在首次 lease 时原子消费；只有该 Job 能恢复使用同一授权。
8. Artifact 内容先写内容寻址存储，Job 状态和 Artifact 索引再在一个数据库事务中提交。
9. 过期 lease 对 resumable Job 自动重新排队；不可恢复或耗尽 attempt 的 Job归类为 `worker_lost`。

## 原因

Pi 已经解决 LLM 会话问题，但明确不提供后台 bash。科研实验还需要跨进程恢复、资源排他、数据角色隔离和可审计失败。把这些语义塞入 Pi extension 会让科研状态依赖 UI runtime，也无法形成远程 Worker 协议。

## 一致性与失败语义

- Job submit 继续使用公共命令收据保证幂等。
- Worker mutation 由 `jobId + attempt + workerId + leaseToken` 授权；旧 attempt fail closed。
- cancel 对 queued Job 立即生效，对 running Job 设置标志，由 heartbeat 触发进程组终止。
- timeout、cancel、完成和失败都删除 lease，因此资源不会永久占用。
- malformed Artifact 会在完成事务前被拒绝，Job 保持 running，可由当前 lease 修正。
- Core 重启后运行中 Job 由过期 lease 恢复，不假设原进程仍存在。

## 限制

- S 阶段之前 Worker 协议仅通过进程内 Application facade 暴露，尚无网络认证 transport。
- 本地 CAS 已验证内容；远程 Worker 的 Artifact 上传和服务端内容复核留给 S 阶段。
- Job、日志和 Artifact 尚未纳入 Project Bundle，T 阶段统一迁移。
- Q 阶段不改变 Pi extension 的宿主权限；插件 Capability 隔离属于 R 阶段。
