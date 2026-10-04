# 模型 Provider 配置

项目使用 pi 的 `ModelRuntime` 解析 provider、模型和鉴权。用户可以直接提供符合 pi `models.json` 结构的文件，而不需要为每家 OpenAI 兼容服务修改代码。

## 配置入口

| 环境变量 | 作用 |
| --- | --- |
| `AUTO_RESEARCH_MODELS_PATH` | pi `models.json` 文件路径；省略时使用 pi 默认模型目录和内置 catalog |
| `AUTO_RESEARCH_MODELS_STORE_PATH` | pi 动态 catalog 缓存；默认写入忽略版本控制的 `.research-data/pi-models-store.json` |
| `AUTO_RESEARCH_PI_AUTH_PATH` | 可选的 Pi OAuth/API-key 凭据文件；默认由 Pi 使用 `~/.pi/agent/auth.json` |
| `AUTO_RESEARCH_PROVIDER` | provider ID，例如 `deepseek`、`anthropic` 或 `openai` |
| `AUTO_RESEARCH_MODEL` | provider 内的模型 ID |
| `AUTO_RESEARCH_API_KEY` | 可选的临时 runtime key；只保存在进程内，覆盖该 provider 的其他凭据 |
| `AUTO_RESEARCH_MODEL_TIMEOUT_MS` | 单次模型调用超时 |
| `AUTO_RESEARCH_BASE_URL`、`AUTO_RESEARCH_API` | 兼容旧快捷配置；给单个自定义 provider 注册 endpoint 和协议 |

pi 支持的配置协议包括 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Google Generative AI；当前锁定的 Pi 还原生包含 OpenAI Codex Responses、ChatGPT Plus/Pro OAuth、自动 token refresh 和 headless device-code 登录。其他自定义 OAuth 或 streaming 服务可通过 pi extension 接入。

凭据可采用两种方式：

1. 临时设置 `AUTO_RESEARCH_API_KEY`，项目调用 `ModelRuntime.setRuntimeApiKey()`，不落盘。
2. 在 `models.json` 的 `apiKey` 中使用 pi 的环境变量语法，例如 `"$DEEPSEEK_API_KEY"`。pi 也能读取其 `auth.json` 中已有的 provider 凭据。

## 使用 ChatGPT/Codex 计划额度

该方式使用 Pi 内置的 `openai-codex` provider，不需要 `OPENAI_API_KEY`，请求计入用户获授权的 ChatGPT 计划额度或可用 credits。它不会复用 Codex CLI 的 `~/.codex/auth.json`；用户必须单独授权 Pi：

```bash
npx pi
```

在 Pi 中输入 `/login`，选择 **ChatGPT Plus/Pro (Codex)**。浏览器不可达时选择 device-code 流程。凭据由 Pi 保存到 `~/.pi/agent/auth.json` 并自动刷新；项目只把可选的 auth path 交给 `ModelRuntime`，不读取、记录或打包 token。

先做不消耗额度的检查：

```bash
export AUTO_RESEARCH_PROVIDER=openai-codex
export AUTO_RESEARCH_MODEL=gpt-5.6-luna
unset AUTO_RESEARCH_API_KEY AUTO_RESEARCH_BASE_URL AUTO_RESEARCH_API
npm run probe:pi-codex
```

只有真实推理才能证明当前账号对模型有权限。下面的命令会消耗一次很小的计划额度：

```bash
npm run probe:pi-codex -- --live
```

探针成功后，现有 `PiResearchModel`、review、interpret 和其他模型阶段都可使用同一配置。达到 ChatGPT 使用上限时应报告 provider 错误或切换到用户显式配置的 API provider；项目不会静默回退并产生 API 费用。

Pi 官方说明其订阅登录支持 ChatGPT Plus/Pro (Codex)：[Pi Providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)。OpenAI 官方说明，符合条件的 Plus/Pro 用户可以授权本地开源或个人项目使用 ChatGPT plan allowance：[Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)。模型列表只是 catalog，真实完成一次推理才验证当前账号的模型权限：[Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)。

## DeepSeek 示例

[models.deepseek.json](../../examples/models.deepseek.json)使用 DeepSeek 官方 OpenAI 格式 endpoint，并配置当前低价模型 `deepseek-flash`。示例关闭 thinking，适合连通性检查和低成本阶段任务。

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
