# SSH 远程 Linux Worker

W 阶段提供版本化 SSH Host profile、host-key trust gate、SFTP 安装和 stdio Worker transport；X 阶段在其上增加 portable workspace、Artifact 回传和 remote confirmation。详见 [Portable SSH workspaces](portable-ssh-workspaces.md)。

## 前置条件

- 客户端：受支持的 Linux 或 macOS，系统 OpenSSH `ssh`、`sftp`、`ssh-keygen`、`ssh-keyscan`。
- 服务端：用户控制的 Linux SSH host，Node.js 22.19+，可使用 key-based BatchMode 登录。
- Core Service 启用 `network,process,filesystem.read,filesystem.write` 权限。
- 身份、IdentityFile、ProxyJump 和证书写在用户 SSH config；Core 不接收私钥和密码。

## 生命周期

1. `ssh.profile.add` 保存 Host alias、可选 config file、remote root 和预期 arch。
2. `ssh.profile.probe` 执行 `ssh -V`、`ssh -G`、host-key scan；首次只返回 pending fingerprint，不登录。
3. 用户从可信渠道核对 SHA-256 fingerprint，再执行 `ssh.host.approve`。
4. 再次 probe 使用项目独立 known-hosts、BatchMode 和固定远端探针，要求 Linux/arch/Node 匹配。
5. `ssh.worker.install` 通过 SFTP 上传 `.partial`，远端 SHA-256 复核后原子 rename，并完成 protocol/hash handshake。
6. `ssh.worker.enable` 后用 `ssh.project.attach` 将精确 profile/worker hash 锁入 Project。
7. `ssh.profile`、`ssh.profiles`、`ssh.project` 查询当前状态。

Host alias/config 改变会清除信任并 quarantine 已安装 Worker。Host key 改变同样 quarantine，不能静默更新。Bundle v2 保存锁定历史，但导入时清除本地 config、known-hosts、远端路径与批准状态，要求重新批准和安装。

## 固定安全选项

自动连接使用：

```text
BatchMode=yes
StrictHostKeyChecking=yes
UserKnownHostsFile=<core data dir>/ssh/known-hosts/...
ForwardAgent=no
ForwardX11=no
PermitLocalCommand=no
ConnectTimeout=10
ServerAliveInterval=15
ServerAliveCountMax=3
```

远端 launcher 固定为内容哈希目录下的 `worker-stdio.mjs --stdio --content-hash <sha256>`。上传与命令路径只允许安全 POSIX 绝对路径字符，拒绝 traversal 和 shell 元字符。

## stdio protocol

远端 Worker 启动先返回 `hello`，包含 protocol、实际脚本 hash 和平台。W 支持 ping、lease open、heartbeat、log、cancel 和 shutdown frame。SSH 断开后 Core 原有 lease expiry/recover 重新排队；旧 lease token 无法写日志或完成任务。远端进程从未获得 Core bearer token。
