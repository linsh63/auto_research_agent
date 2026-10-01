# Pi SDK 0.85.1 复用审计

审计日期：2026-10-01

锁定依赖：`@earendil-works/pi-coding-agent@0.85.1`

## 审计依据

- 已安装包的 `docs/sdk.md`、`docs/extensions.md`、`docs/session-format.md` 和 `docs/usage.md`；
- `AgentSession`、`SessionManager`、extension event 和 tool lifecycle 的 TypeScript 声明；
- 项目已有的真实 API 探针 `scripts/pi_sdk_probe.ts` 与探针结果；
- AnySearch 查询曾尝试补充在线资料，但端点无法连接。本次结论没有依赖未取得的网络结果。

## 复用结论

| 能力 | Pi 0.85.1 | Q 阶段决策 |
| --- | --- | --- |
| 会话持久化与恢复 | SessionManager 支持 create/open/continue、JSONL 树和外部 entries 恢复 | 直接复用，不建立第二套 LLM 会话格式 |
| 事件与流式输出 | AgentSession `subscribe()` 提供消息、turn、tool、retry 和 session 事件 | PiJobRunner 转换为 Job stdout/progress 流 |
| 取消 | `abort()`、`waitForIdle()` 和 extension `ctx.signal` | 直接连接 Job AbortSignal |
| 工具生命周期 | tool start/update/end、custom tools、active tool allowlist | 直接复用，Job 只记录审计流 |
| Session 切换与分支 | AgentSessionRuntime 支持 new/resume/fork/import | 作为 Pi 会话能力保留，不复制到 Job queue |
| Project trust | 未受信任的项目资源默认不加载；extension 获得信任后拥有宿主进程权限 | 复用来源 trust；科研权限仍由 Kernel 和 sandbox 强制 |
| 后台任务 | Pi 文档明确不内置 background bash | 由核心提供持久 Job/Worker |
| 持久队列与租约 | 未提供科研队列、Worker heartbeat 或资源租约 | 由核心 schema 13 提供 |
| 资源墙 | `pi.exec` 有 signal/timeout，但没有跨 Worker 的 GPU/CPU/内存/磁盘调度 | Job scheduler 和 executor 提供 |
| 插件细粒度权限 | Extension 可拦截工具调用，但 extension 本身拥有宿主权限，没有内置通用 permission popup | R 阶段 Capability manifest；confirmation 继续强制 Bubblewrap |
| 科研失败分类 | 未提供 | 核心定义 environment/data/scientific/budget/timeout/cancelled/worker_lost |
| Artifact 原子提交 | 未提供科研 Artifact transaction | 核心使用内容寻址存储和完成事务 |

## 已实现的桥接

`PiJobRunner` 接收由应用配置的 Pi `AgentSession` factory：

- 将 Pi 文本增量写入 Job stdout；
- 将 tool 和 agent 生命周期写入结构化 progress；
- 将 Job 取消转发为 `session.abort()`；
- 等待 `waitForIdle()` 后记录 session file 和消息数量；
- 始终取消订阅并 dispose session。

真实 Provider、模型和凭据继续由 Pi ModelRuntime 管理，Job 数据库不保存 API key。

## 安全结论

Pi 的 Project trust 解决“是否加载某个来源的代码”，不等价于科研数据权限或实验隔离。Q 阶段因此保留以下核心控制：

- confirmation token 只以 SHA-256 保存，并绑定一个 Job；
- confirmation 只能由 Bubblewrap executor 取得只读 mount；
- Python Worker 只执行 exploration；
- Worker 只能凭当前 attempt 的 lease token 写日志或完成 Job；
- 环境变量名含 key/token/secret/password 时拒绝进入执行环境。
