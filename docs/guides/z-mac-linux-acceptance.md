# Z：Mac → Linux 最终验收

该门禁必须从真实 Mac 发起，并连接用户控制的 Linux 主机。Linux 需有 Node.js 22、OpenSSH、Bubblewrap、prlimit，并允许当前 SSH 用户使用 user namespace。

## Mac 操作

1. 拉取最新仓库并安装依赖：

```bash
git pull --ff-only
npm ci
```

2. 确认 SSH Host alias 可无交互登录，例如：

```bash
ssh my-research-linux 'uname -s && node --version && bwrap --version'
```

3. 执行验收；`--remote-root` 必须是该 SSH 用户可写的 Linux 绝对路径：

```bash
npx tsx scripts/validate_z_mac_linux.ts \
  --host my-research-linux \
  --remote-root /data0/linsihan/ara-z-worker \
  --output .research-data/z-mac-linux.json
```

脚本会人工显示首次 host fingerprint gate，安装精确 hash Worker，运行一个 `cas_sync` exploration 和一个一次性 `remote_existing` confirmation，校验 Artifact 回传，并确认 sealed confirmation 未进入 Mac CAS、日志或 Bundle。成功时输出 `status: pass`。

4. 将 `.research-data/z-mac-linux.json` 安全复制到这台开发服务器仓库的同一路径，然后再次执行：

```bash
npm run audit:v1.6
```

最终 audit 只有在该文件显示真实 Darwin 客户端、两个 Job 均成功时才从 `blocked` 变为 `pass`。脚本不会创建 Git tag、GitHub Release 或执行 npm publish。
