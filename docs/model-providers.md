# 模型 Provider 配置

项目使用 pi 的 `ModelRuntime` 解析 provider、模型和鉴权。用户可以直接提供符合 pi `models.json` 结构的文件，而不需要为每家 OpenAI 兼容服务修改代码。

## 配置入口

| 环境变量 | 作用 |
| --- | --- |
| `AUTO_RESEARCH_MODELS_PATH` | pi `models.json` 文件路径；省略时使用 pi 默认模型目录和内置 catalog |
| `AUTO_RESEARCH_MODELS_STORE_PATH` | pi 动态 catalog 缓存；默认写入忽略版本控制的 `.research-data/pi-models-store.json` |
| `AUTO_RESEARCH_PROVIDER` | provider ID，例如 `deepseek`、`anthropic` 或 `openai` |
| `AUTO_RESEARCH_MODEL` | provider 内的模型 ID |
| `AUTO_RESEARCH_API_KEY` | 可选的临时 runtime key；只保存在进程内，覆盖该 provider 的其他凭据 |
| `AUTO_RESEARCH_MODEL_TIMEOUT_MS` | 单次模型调用超时 |
| `AUTO_RESEARCH_BASE_URL`、`AUTO_RESEARCH_API` | 兼容旧快捷配置；给单个自定义 provider 注册 endpoint 和协议 |

pi 支持的配置协议包括 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Google Generative AI；新版 pi 还包含 Azure/OpenAI Codex Responses、Mistral Conversations、Google Vertex 与 Bedrock 等 API 类型。需要专用 OAuth 或自定义 streaming 实现的服务仍应通过 pi extension 接入，当前 CLI 尚未提供安装和登录流程。

凭据可采用两种方式：

1. 临时设置 `AUTO_RESEARCH_API_KEY`，项目调用 `ModelRuntime.setRuntimeApiKey()`，不落盘。
2. 在 `models.json` 的 `apiKey` 中使用 pi 的环境变量语法，例如 `"$DEEPSEEK_API_KEY"`。pi 也能读取其 `auth.json` 中已有的 provider 凭据。

## DeepSeek 示例

[models.deepseek.json](../examples/models.deepseek.json)使用 DeepSeek 官方 OpenAI 格式 endpoint，并配置当前低价模型 `deepseek-flash`。示例关闭 thinking，适合连通性检查和低成本阶段任务。

```bash
export AUTO_RESEARCH_MODELS_PATH=examples/models.deepseek.json
export AUTO_RESEARCH_PROVIDER=deepseek
export AUTO_RESEARCH_MODEL=deepseek-flash
export DEEPSEEK_API_KEY="<your-key>"

node dist/cli.js model-check
```

也可以把密钥临时放在 `AUTO_RESEARCH_API_KEY` 中。密钥文件和 `.env` 已被 Git 忽略。

模型的 context、最大输出、输入模态、thinking、兼容开关和 token 单价均由 `models.json` 声明。价格会变化，运行费用只是基于配置版本的估算，更新价格后应同步更新模型条目。

## 最小验证记录

2026-09-19 使用项目的 `model-check` 命令验证了 `deepseek/deepseek-flash`：

- 结构化结果：`{"ok":true,"note":"Connectivity check for deepseek/deepseek-flash."}`
- 输入 203 tokens，输出 20 tokens，reasoning 0 tokens
- 按示例中的峰值价格估算：`$0.0000849`
- 没有运行论文检索、科研状态机或实验，仅验证 provider 加载、鉴权、请求、流式响应聚合和 schema 校验
- API key 只通过终端输入到环境变量，未写入项目或验证记录

DeepSeek 官方当前列出的低价模型和 OpenAI 格式 base URL 分别为 `deepseek-flash` 和 `https://api.deepseek.com`：[Quick Start](https://api-docs.deepseek.com/)、[Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)。pi 配置字段见 [Custom Models](https://pi.dev/docs/latest/models) 和 [Custom Providers](https://pi.dev/docs/latest/custom-provider)。
