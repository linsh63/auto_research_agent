# Auto Research Agent

本项目用于设计并逐步实现一个适用于不同学科和研究场景的自动科研工作流与 agent。目标是让 agent 在可追溯的证据和实验结果上持续迭代研究问题、方法与验证方案。具体论文和领域由每次研究任务单独指定；项目不预设起点论文。

## 当前阶段

V1 最小科研闭环已经实现并通过公开真实案例验收：TypeScript CLI、pi SDK 模型适配、SQLite 研究账本、论文检索包装器、两个审批节点、受控命令执行、分析审查、审查响应与 Markdown 报告均已接通。技能安装在本机 `~/.codex/skills/`；[技能清单](skills-inventory.md)记录其来源、作用和运行条件。[V1 阶段总结](docs/v1-stage-summary.md)给出验收证据、真实案例结果与剩余限制。

[下一阶段备选方案](docs/next-stage-options.md)列出证据系统、长期记忆、自动实验迭代、第二场景验证和本地模型五条路线，供选择 V2 主目标。

[总体规划（第一版）](docs/v1-plan.md)记录了已确认的目标、基于 pi SDK 的架构、skills 接入方式、实施顺序和暂缓的决策。

## 运行原型

需要 Node.js 22.19+。模型通过 pi 原生 provider catalog 或 `models.json` 配置；[模型 Provider 配置](docs/model-providers.md)说明内置 provider、自定义 API 和凭据入口。`AUTO_RESEARCH_API_KEY` 可作为不落盘的临时 runtime key；也可以使用 pi `models.json` 的环境变量凭据语法。未提供 provider 配置时，旧快捷配置仍默认使用 `https://newapi.x-era.com/v1` 的 `gpt-5.6-luna`。

```bash
npm ci
npm run build
export AUTO_RESEARCH_API_KEY="<your-key>"
node dist/cli.js doctor
node dist/cli.js model-check # 最小模型 API 验证
node dist/cli.js new examples/toy-regression/brief.json
node dist/cli.js run <run-id>
node dist/cli.js status <run-id>
node dist/cli.js approve <run-id>   # 审核实验计划后运行
node dist/cli.js run <run-id>
node dist/cli.js respond-review <run-id> <response.json> # 审查要求修改时
node dist/cli.js finalize <run-id>  # 审核最终报告后运行
```

`new` 会打印 run ID。研究状态保存在 `.research-data/research.db`，实验日志和报告保存在 `.research-data/runs/<run-id>/`。`node dist/cli.js skills` 列出已登记技能及文件哈希。`npm run check` 与 `npm test` 用于类型检查和离线流程验证。

`npm run probe:pi` 使用一次工具调用和一次立即取消的请求，验证 pi SDK 的自定义工具、事件流、持久会话恢复和取消；结果写入 [pi-sdk-probe.json](docs/pi-sdk-probe.json)。该命令需要模型 API，并会产生少量用量。

合成回归示例只用于检查 pipeline。真实验收案例使用 fastText v0.9.2 和完整 AG News 公开划分，协议见 [案例说明](docs/cases/fasttext-agnews.md)。两者都显式选择 `process` 执行模式，只应运行可信脚本。其他任务默认使用 `docker`，需指定 `dockerImage`；容器关闭网络并限制进程数、CPU 和内存。

`paper-search` 已接入实际检索脚本；其余技能按方法或混合适配进入相关阶段。`npm run validate:skills` 对全部 14 项能力做离线检查，结果保存在 [skill-validation.json](docs/skill-validation.json)。模型调用次数、单次运行时长和实验超时已有硬上限；代理服务的实际计费单价尚未配置，因此目前不提供可靠的美元费用上限。跨项目记忆和多轮自动迭代也尚未实现。

## 科研链路

1. **定义问题**：明确研究范围、资源约束、成功指标和不成立的条件。
2. **建立证据**：检索并阅读原论文、相邻工作和最新结果，保存来源与检索边界。
3. **形成候选**：发散研究方向，检查已有工作是否覆盖，并提出可检验的差异。
4. **设计验证**：写出假设、预测、基线、指标、消融和计算预算。
5. **执行实验**：复现基线，运行实验，记录代码版本、环境、数据、随机种子与成本。
6. **分析和审查**：核对统计结果、异常、失败案例和可复现性，避免只保留正结果。
7. **产出与迭代**：形成可追溯的研究报告；由结果决定修正假设、换方向或继续实验。

贯穿每一步的要求：区分事实、推断和待验证想法；保留负结果；每项关键结论能回溯到论文、数据或可重跑的实验。

## V1 后续方向

- 改善论文全文、引用段落定位和检索相关性。
- 根据真实运行失败模式设计跨项目记忆与经验提炼。
- 接入第二种研究场景，检验核心接口的通用性。
- 在获得可信计费信息后加入金额预算。

首版先验证 pipeline；跨项目记忆、更多研究场景和探索策略在真实运行记录积累后迭代。
