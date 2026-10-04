# Pi 使用 ChatGPT/Codex 计划额度调查

日期：2026-10-04  
结论：**支持，已接入配置与探针；当前 Linux 账号尚未为 Pi 登录 OpenAI Codex，因此未执行额度推理。**

## 证据

1. 项目锁定的 `@earendil-works/pi-coding-agent@0.85.1` 文档列出 ChatGPT Plus/Pro (Codex) subscription login、`openai-codex` provider、`~/.pi/agent/auth.json`、自动刷新和 device-code 登录。
2. OpenAI 官方文档允许符合条件的 Plus/Pro 用户授权本地个人项目和开源工具使用 ChatGPT plan allowance；catalog 不等同于 entitlement，完成推理才是最终验证。
3. 本地 pinned package 的 catalog 探针解析出 8 个 `openai-codex` 模型，包括 `gpt-5.6-luna/sol/terra` 和 `gpt-6-astra`。
4. `PiResearchModel.create()` 已在无 API key、无网络刷新条件下成功解析 `openai-codex/gpt-5.6-luna`。
5. 当前 `~/.pi/agent/auth.json` 权限为 `0600`，但 `ModelRuntime.getAvailable()` 未返回 `openai-codex`，所以状态正确显示为 `login_required`，没有尝试真实调用。

## 实现

- 新增 `AUTO_RESEARCH_PI_AUTH_PATH`，传入 Pi `ModelRuntime`。
- 新增 `npm run probe:pi-codex`：只检查 catalog、认证可用性和凭据文件权限，不输出 token。
- 新增可选 `--live`：在认证后发送一次最小结构化调用，真实验证 entitlement。
- 保留 API key、自定义 OpenAI-compatible provider 和 DeepSeek 等既有路径。

## 安全决定

- 不读取或复制 Codex CLI 的 `~/.codex/auth.json`。
- 不把 Pi OAuth token 写入数据库、事件、日志、Bundle 或仓库。
- 不将 catalog 存在误报为账号已获授权。
- 不在计划额度耗尽时静默切换到可能计费的 API key。

## 来源

- [Pi Providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)
- [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [OpenAI：Integrating Sign in with ChatGPT in your Opensource App](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [OpenAI：Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
