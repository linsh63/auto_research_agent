# Job、Worker 与本地执行

## 提交和查询

长任务通过 `job.submit` 提交。Job spec 固定执行器、数据角色、资源和硬限制：

```ts
const submitted = await app.execute({
  schemaVersion: PUBLIC_SCHEMA_VERSION,
  commandId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
  workspaceId,
  projectId,
  actor,
  issuedAt: new Date().toISOString(),
  type: "job.submit",
  payload: {
    confirmationToken: null,
    spec: {
      name: "analysis fixture",
      dataRole: "exploration",
      studyId: null,
      execution: {
        kind: "python",
        workspace: "/absolute/project/workspace",
        script: "analysis.py",
        args: [], env: {}, artifactPaths: ["result.json"],
      },
      resources: { cpuCores: 1, memoryMiB: 2048, diskMiB: 1024, gpuCount: 0 },
      limits: { wallTimeMs: 60000, cpuTimeSeconds: 60, maxOutputBytes: 1000000, maxArtifactBytes: 10000000 },
      priority: 0, resumable: true, maxAttempts: 3,
    },
  },
});
```

- `job.get` 返回 Job 和已提交 Artifact；
- `job.logs` 按 sequence 分页返回 stdout、stderr、progress 和 system；
- `job.cancel` 取消排队或运行任务；
- `job.retry` 为失败或取消任务创建新 attempt。

## 本地 Worker

```ts
const worker = app.createLocalWorker({
  descriptor: {
    workerId: "worker:local",
    protocolVersion: "1",
    executors: ["python", "bubblewrap"],
    capacity: { cpuCores: 8, memoryMiB: 32768, diskMiB: 100000, gpuCount: 1 },
    gpuDevices: ["0"],
    leaseDurationMs: 30000,
  },
  artifactRoot: ".research-data/artifacts",
});

await worker.runOnce();
```

`runOnce()` 取得一个符合容量的 lease 并执行。生产循环应在没有 lease 时退避，进程退出时不需要猜测任务状态；lease 到期后核心会恢复 resumable Job。

## Worker 协议

`ResearchApplication.worker()` 接受以下版本化请求：

- `worker.claim`
- `worker.heartbeat`
- `worker.log`
- `worker.complete`
- `worker.fail`
- `worker.recover`

除 claim/recover 外，请求必须携带 job、attempt、worker 和 lease token。旧 attempt 或错误 token 不能追加日志、提交 Artifact 或覆盖新运行结果。该入口当前用于进程内集成；S 阶段为相同 schema 增加认证网络 transport。

## 执行器

### Python

Python runner 位于 `python/worker/runner.py`，通过 JSONL stdio 返回流式日志和结果。脚本必须位于 Job workspace 内，使用独立进程组并应用 CPU、内存、文件、输出和墙钟限制。它只允许 exploration。

### Bubblewrap

Bubblewrap 延续已有的断网、空环境、只读数据 mount 和 GPU device 选择。Job 提交者不能指定外部 mount；confirmation 数据只在核心消费 capability 后加入 Worker lease。

### Pi

`PiJobRunner` 包装应用提供的 Pi AgentSession factory，复用 Pi 的 session file、resume、事件、工具和 abort。模型凭据仍由 Pi ModelRuntime 解析，不写入 Job 数据库。

## confirmation 规则

- confirmation Job 必须提供 study ID、有效的一次性 token 和 Bubblewrap executor；
- token 原文不会写入 Job、命令结果、事件或日志；
- token 在提交时预留，在 Worker 取得首次 lease 时消费；
- lease 只获得 `/data/confirmation` 只读 mount；
- Agent 不能提交 confirmation Job，必须由用户显式触发。

## 失败分类

`environment`、`data`、`scientific`、`budget`、`timeout`、`cancelled` 和 `worker_lost` 是稳定失败类型。失败不会自动伪装成科研负结果；是否 retry 由用户或后续策略明确决定。
