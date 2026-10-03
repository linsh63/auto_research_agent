# Portable SSH workspaces

X 阶段让 Linux/macOS 客户端通过 SSH 把可移植科研 Job 交给用户控制的 Linux Worker。Core bearer token 始终留在客户端；远端只得到当前 Job 的 lease、已声明输入、资源墙和一次性 confirmation mount。

## Job 声明

`JobSpec.portableWorkspace` 支持两种模式：

- `cas_sync`：输入使用 SHA-256、字节数、access 和目标相对路径声明；客户端从本地 CAS 经 SFTP 同步。
- `remote_existing`：大数据或 sealed confirmation 使用 alias、manifest hash 和 `/data/...` 只读目标声明；数据不复制到客户端。

输出必须声明名称、相对路径、media type、access 和单文件上限。总上传量受 `transferQuotaBytes` 和 Job disk 资源墙共同限制。绝对路径、`..`、空路径段、控制字符、盘符、UNC 以及忽略大小写后的路径碰撞都会在提交时拒绝。

## 远端数据 alias

`RemoteDataAliasRegistry` 保存部署环境状态，文件权限为 `0600`。alias 的 `remotePath` 必须位于 profile 的 `<remoteRoot>/data/` 下。注册信息不进入 Project Bundle；执行前 Worker 重新计算远端 SHA-256 并与声明的 manifest hash 比较。

confirmation Job 仍需用户提交一次性 token。Core 在 claim 时消费 capability，并把授权转换成 `remote_alias` mount。lease 不包含 sealed 数据的本地路径；远端以 `--ro-bind` 挂载，声明输出之外的文件不会回传。

## 传输与恢复

输入先同步到 `<remoteRoot>/cas/sha256/...`：已有相同 hash 时跳过；否则写入 `.partial`，可从已存在的部分文件恢复，校验 hash 后原子 `mv`。workspace 位于 `<remoteRoot>/jobs/<job>-<attempt>`。输出先在远端校验，再下载到本地 `.partial`，客户端复核 hash 和字节数后通过 `ContentAddressedStore` 原子写入本地 CAS。

每次输入、输出、资源使用、stdout/stderr 和最终状态进入 Job log。日志只记录 hash、字节数和远端对象路径，不记录文件内容。

## 执行边界

远端 Worker 实际探测 Python、Bubblewrap、prlimit 和 GPU device。Bubblewrap Job 使用独立 user/network namespace、清空环境、只读系统目录、可写 `/work`、声明的只读 `/data` mount，并由 wall time、CPU、address space、file size 和 output byte limit约束。GPU 只暴露 scheduler 分配的数字设备。

应用层入口：

```ts
const worker = app.createSshWorker({
  workspaceId,
  profileId,
  installationId,
  artifactRoot,
  aliases: registry.list(),
});
await worker.runOnce();
```

profile 必须 trusted，installation 必须 enabled 且属于同一 profile。掉线后沿用 lease expiry/recover；旧 attempt 无法写日志或提交结果。
