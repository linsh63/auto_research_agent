# ADR 011：v1.5 Scenario SDK 与插件目录

状态：accepted

## 决策

1. TypeScript Scenario SDK 作为 `auto-research-agent/scenario` 公共子路径发布，不导出任何 Store、Workflow 或 migration。
2. Python Scenario/Worker SDK 由同一组公共 JSON Schema 生成 TypedDict，并嵌入 schema 哈希；科研状态机只存在于 Kernel。
3. Scenario 必须声明 data、experiment、evaluation、analysis 四类 Capability，以及权限、预算、执行器和 Artifact。
4. 兼容协商在 Scenario 执行前检查 core schema、权限和 Worker executor；Job 还必须落在 Scenario budget 内。
5. PiPluginBridge 只静态读取 package bytes、`package.json`、Pi manifest 和可选 `autoResearch` 元数据，不 import extension。
6. Pi 原生 contributions 映射 extensions、skills、prompts 和 themes；tools、apps、MCP、Scenario、权限和副作用由 `autoResearch` 元数据补充。
7. Pi extension 始终增加 `host.full` 有效权限，skill 始终增加 `model` 权限，插件不能用较低的自报权限掩盖真实能力。
8. 插件安装把内容复制到哈希目录并固定 descriptor、版本和 SHA-256。启用前重新验证来源内容。
9. Project 是默认安装范围；Workspace 范围必须显式选择。只有 `enabled` installation 会进入 `plugin.runtime`。
10. 更新后必须重新启用；权限集合扩大时必须精确批准新权限。禁止静默更新。
11. Git 来源使用 bare mirror 和 blob 提取，不 checkout 工作树、不运行 hook/npm/plugin。Pi settings 只解析本地条目；远程 npm 需要先静态 staging。

## 原因

Scenario 需要在不接触核心数据库的前提下描述领域数据和实验。Pi package 则是可执行代码来源，搜索和展示阶段不能获得执行机会。把静态目录、安装锁和运行时选择分开，可以让未来 CLI、Web 和游戏共享同一后端，又不让“查看插件”变成“执行插件”。

## 生命周期

- Source refresh 产生 discovered descriptor；inspect query 返回完整 inspected view。
- install 创建固定版本和内容哈希，状态为 `installed`。
- enable 重新核验来源后进入 `enabled`。
- disable/remove 停止后续 runtime selection，同时保留 lifecycle 与历史锁。
- 内容漂移进入 `quarantined`；版本不兼容在安装前拒绝。
- update 记录版本、哈希和 permission diff，并回到 `installed` 等待显式启用。

## 限制

- R 阶段提供目录和运行时选择，Pi session factory 在部署时消费选择结果；Core 不自动加载第三方代码。
- npm registry 的安全 metadata 下载与 staging 尚未实现；已安装绝对路径可以作为 npm 来源检查。
- Project Bundle 尚未写入插件锁，留给 T 阶段的跨实例迁移门禁。
- 网络服务、认证和正式插件搜索 CLI 属于 S 阶段。
