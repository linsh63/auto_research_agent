# Core Service、客户端 SDK 与参考 CLI

## 启动服务

```bash
npm run service -- --database .research-data/research.db --data-dir .research-data/service --port 0
```

默认监听 `127.0.0.1`，端口 `0` 表示由系统分配。启动后写入：

- `.research-data/service/core-service.json`：base URL、PID、能力和 token file 路径；
- `.research-data/service/core-service.token`：仅本机用户可读的 Bearer token。

服务没有遥测。network、model、gpu、secrets 和 host.full 默认关闭。启用权限示例：

```bash
npm run service -- --permissions filesystem.read,filesystem.write,process,confirmation,network,model
```

非 loopback 地址还必须提供 `--allow-remote`。远程使用应放在 SSH tunnel 或 TLS 反向代理后。

## REST 与 SSE

| Endpoint | 用途 |
| --- | --- |
| `GET /v1/health` | 生命周期探测 |
| `GET /v1/capabilities` | schema、transport、权限和离线状态协商 |
| `POST /v1/commands` | 公共 Command |
| `POST /v1/queries` | 公共 Query |
| `POST /v1/workers` | lease token Worker 协议 |
| `GET /v1/stream` | ResearchEvent、候选更新和 JobLog SSE |
| `GET /v1/audit` | 权限与外部服务审计 |

`POST /v1/commands` 中的 `capability.invoke` 调用七类公共科研能力；`POST /v1/queries` 中的 `capability.catalog` 返回版本、操作和副作用。输入与门禁见[公共科研能力接口](public-scientific-capabilities.md)。

全部端点要求 `Authorization: Bearer <token>`。请求体上限默认 1 MB。未允许的 Origin 和权限会在进入 Application 前被拒绝。

## TypeScript SDK

```ts
import { ResearchClient } from "auto-research-agent/client";

const client = await ResearchClient.connectLocal({
  dataDir: ".research-data/service",
  databasePath: ".research-data/research.db",
  autoStart: true,
});

const capabilities = await client.negotiate();
const result = await client.execute(command);
for await (const event of client.stream({ workspaceId, projectId })) {
  console.log(event.event, event.data);
}
```

远程客户端使用 `ResearchClient.connect({ baseUrl, token })`。SDK 在连接时验证 service/schema 版本。

## Python SDK

```python
from research_sdk import ResearchClient

client = ResearchClient.connect_local(
    data_dir=".research-data/service",
    database_path=".research-data/research.db",
)
status = client.query(query)
```

Python SDK 使用标准库 urllib，没有额外运行时依赖。生成类型与 17 份所需公共 JSON Schema 的 SHA-256 绑定。

## Secret Provider

TypeScript 提供 Memory、Environment、Directory 和 Chained provider。Python 提供 Environment 与 Directory provider。使用自定义 provider 时，服务不会把 secret 复制到 discovery token file。

secret 名称的哈希、provider 名称和是否找到会进入 secret access audit；secret 值不会进入数据库。

## 参考 CLI

```bash
npm run reference-cli -- capabilities
npm run reference-cli -- new workspace:default intent.json
npm run reference-cli -- chat workspace:default <project-id> "给出下一步"
npm run reference-cli -- choose workspace:default <project-id> <session-id> <candidate-set-id> <candidate-id>
npm run reference-cli -- choose workspace:default <project-id> <session-id> <candidate-set-id> --free "其他行动"
npm run reference-cli -- job-submit workspace:default <project-id> job.json
npm run reference-cli -- report workspace:default <project-id>
npm run reference-cli -- plugin-search workspace:default vision
```

CLI 还提供 plugin source add/refresh、inspect、install、enable 和 disable。它只是 SDK 的最小验收客户端，不承担正式产品交互。

## 离线策略

- Bubblewrap Job 默认可运行；
- Python executor 被视为可访问宿主网络，因此默认被拒绝；
- Pi Job 需要 network 和 model；
- HTTP/SSH Git refresh 需要 network，`file://` 和本地目录不需要；
- enabled 插件进入 runtime 前必须满足其完整权限，包括自动附加的 host.full/model。
