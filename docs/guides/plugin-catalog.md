# Pi 插件目录与权限管理

## 来源

支持四种来源记录：

- `local`：一个 package 或包含多个 package 的本地目录；
- `git`：本地 checkout，或 `https://`、`file://` 等 Git URL，可用 `#ref` 固定 ref；
- `pi_config`：Pi settings 文件，其中本地 package 条目会被聚合；
- `npm`：已经安全 staging 的绝对 package 路径。

远程 Git refresh 使用 bare mirror、`ls-tree` 和 `git show` 读取 blob。它不 checkout、不执行 hook、不运行 npm install。远程 npm registry staging 尚未开放。

## 搜索和查看

1. `plugin.source.add` 添加来源；
2. `plugin.source.refresh` 静态生成 descriptor；
3. `plugin.search` 按文本、领域、权限、来源、兼容状态和 contribution 搜索；
4. `plugin.inspect` 返回说明、版本、哈希、许可证、维护者、依赖、权限、副作用和全部 contributions。

Pi 0.85.1 原生 package manifest 提供 extensions、skills、prompts 和 themes。可选 `autoResearch` 字段声明：

```json
{
  "autoResearch": {
    "domain": ["vision"],
    "permissions": ["filesystem.read", "network"],
    "sideEffects": ["writes project artifacts"],
    "tools": ["dataset_search"],
    "apps": ["example_app"],
    "mcp": ["example_mcp"],
    "scenarios": ["vision.robustness"],
    "coreSchemaRange": "^1.0.0",
    "piVersionRange": "^0.85.0"
  }
}
```

extension 无论自报什么权限都会附加 `host.full`，skill 会附加 `model`。这反映 Pi 实际执行边界。

## 安装与生命周期

- `plugin.install`：要求用户精确批准全部有效权限，复制到内容哈希目录；默认 Project scope；
- `plugin.enable`：重新验证来源 hash 后启用；
- `plugin.disable`：停止未来调用并保留历史；
- `plugin.update`：显式选择目标 descriptor，返回权限差异并回到 installed；
- `plugin.remove`：标记 removed，保留历史版本和生命周期事件。

来源内容发生变化时，旧 installation 会进入 `quarantined`。不兼容插件不能安装。权限扩大但批准集合没有同步更新时，update 被拒绝。

`plugin.runtime` 只返回当前 Project 可见且状态为 enabled 的 Project/Workspace 插件、缓存路径、版本、哈希、权限和 contribution allowlist。Pi session factory 应只消费该结果。

如果 refresh 已确认来源不可用，`plugin.runtime` 会明确返回 capability unavailable，而历史 descriptor、安装锁和事件仍可读取。

Bundle v2 保存 Project/Workspace 插件锁、来源范围、权限和 descriptor。导入不会自动安装插件；目标缺少或版本不兼容时会明确报告 `degraded` 或 `blocked`，历史仍可读取。

## 安全边界

- 搜索、refresh 和 inspect 不执行插件代码；
- Agent 不能安装、启用、更新或移除插件；
- 插件不能直接写 ResearchEvent；Project 生命周期命令由 Application 产生事件；
- 插件无法通过目录获得 confirmation mount；confirmation 仍由 Job capability 和 Bubblewrap 控制；
- 查看 descriptor 不代表核心对第三方质量背书。
