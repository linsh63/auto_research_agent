# 平台能力与跨系统调度

Core Service 的 `/v1/capabilities` 现在包含 `PlatformCapabilitySnapshot`：OS、arch、Node/Python、executor、sandbox、resource limit、process tree、storage、filesystem 和 OpenSSH/SFTP 状态。状态只能是 `available`、`unavailable`、`degraded` 或 `not_checked`，并附原因。

Worker descriptor 可携带自己的 snapshot。Job 的可选 `platformConstraints` 声明 OS、arch、sandbox 和 storage 要求。调度器同时检查：

1. executor 名称和该 executor 的实际状态；
2. CPU、内存、磁盘和 GPU 容量；
3. OS 和 architecture；
4. sandbox；
5. storage modes。

任何条件不满足都不会发 lease，也不会把 Bubblewrap Job 改成 Python Job。旧 Worker 不带 snapshot 时保留兼容行为，但不能领取带平台约束的 Job。

```ts
const spec={
  // standard Job fields...
  platformConstraints:{
    os:["linux"],
    arch:[],
    requiresSandbox:true,
    storageModes:["local"]
  }
};
```

macOS 和 Windows 本地 Core 可以继续创建 Project、调用科研能力和操作 Bundle。其本机 snapshot 会把 Bubblewrap 标记为 `unavailable`；后续 W/X 阶段的 Linux SSH Worker 注册后才能领取此类 Job。

Artifact 和 Python script 使用 portable relative path：允许目录中的空格，同时拒绝绝对路径、Windows drive/UNC、`..`、空 path segment、NUL 和换行。workspace 本身仍可使用当前平台的绝对路径。Windows 超时与取消使用参数数组调用 `taskkill /t`；POSIX 使用进程组 signal。
