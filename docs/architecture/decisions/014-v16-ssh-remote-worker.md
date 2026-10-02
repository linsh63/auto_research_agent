# ADR 014：v1.6 系统 OpenSSH 与远程 Linux Worker

状态：accepted for implementation

## 决策

1. 跨系统远程执行复用系统 OpenSSH，不实现 SSH 协议，不默认依赖 Node SSH 库。
2. v1.6 首版使用本地 Core + SshWorkerBridge + 远端 Linux Worker。
3. 控制面走持久 SSH stdio frame；大文件走 SFTP + CAS hash；不开放本地 Core REST 端口。
4. 远端只启动固定、版本化、内容哈希锁定的 worker launcher，保持现有 lease 语义。
5. 用户 SSH config 和系统 agent 管理认证；核心保存 host profile、approved fingerprint 和 capability snapshot，不保存私钥或密码。
6. workspace 使用 portable spec 和 remote alias，不假设本地绝对路径在服务器存在。
7. Bubblewrap、CUDA 和 confirmation 由 Linux Worker capability 提供；缺失能力 fail closed。

## 原因

OpenSSH 已在 macOS/Linux 普遍可用，并由 Microsoft 作为 Windows 10/11 的系统组件维护。它已经解决 host key、密钥、ProxyJump、隧道和 SFTP。现有核心已经解决 Job、attempt、lease、heartbeat、日志、取消、Artifact 和 failure class；SSH 只承担传输和远端进程启动，避免重复构造调度系统。

stdio bridge 比反向 REST tunnel 少一个监听面，远端无需持有完整 Core bearer token，也适合客户端在 NAT 后的个人部署。SFTP 适合独立的大文件 channel；CAS hash 提供 SSH 之外的科研制品完整性证明。

## 约束

- 首次 host trust 必须人工确认；自动任务使用严格 known-hosts。
- 禁止 agent forwarding 和 shell 字符串拼接。
- SSH host 被视为用户信任的执行域，不承诺恶意 root 下的机密性。
- ControlMaster、rsync 和远程端口转发只能是可选优化。
- 跨平台 mock 不能替代真实 Mac/Windows→Linux 发布门禁。

## 后果

需要新增 platform capability、host profile、remote installation、portable workspace 和 file-transfer 状态；Artifact 完成协议要支持远端上传与服务端复核。现有本地 Worker 与 Scenario contract 保留，通过 transport/capability adapter 扩展。
