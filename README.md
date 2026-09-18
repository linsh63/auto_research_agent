# Auto Research Agent

本项目用于设计并逐步实现一个适用于不同学科和研究场景的自动科研工作流与 agent。目标是让 agent 在可追溯的证据和实验结果上持续迭代研究问题、方法与验证方案。具体论文和领域由每次研究任务单独指定；项目不预设起点论文。

## 当前阶段

目前已有一个可运行的技术原型：TypeScript CLI、pi SDK 模型适配、SQLite 研究账本、论文检索包装器、两个审批节点、受控命令执行、分析审查与 Markdown 报告。技能安装在本机 `~/.codex/skills/`；[技能清单](skills-inventory.md)记录其来源、作用和运行条件。

[总体规划（第一版）](docs/v1-plan.md)记录了已确认的目标、基于 pi SDK 的架构、skills 接入方式、实施顺序和暂缓的决策。

## 运行原型

需要 Node.js 22.19+。模型密钥仅从 `AUTO_RESEARCH_API_KEY` 环境变量读取，程序不会把它写入项目。默认使用 `https://newapi.x-era.com/v1` 的 `gpt-5.6-luna`；可通过 `AUTO_RESEARCH_BASE_URL` 和 `AUTO_RESEARCH_MODEL` 修改。

```bash
npm ci
npm run build
export AUTO_RESEARCH_API_KEY="<your-key>"
node dist/cli.js doctor
node dist/cli.js new examples/toy-regression/brief.json
node dist/cli.js run <run-id>
node dist/cli.js status <run-id>
node dist/cli.js approve <run-id>   # 审核实验计划后运行
node dist/cli.js run <run-id>
node dist/cli.js finalize <run-id>  # 审核最终报告后运行
```

`new` 会打印 run ID。研究状态保存在 `.research-data/research.db`，实验日志和报告保存在 `.research-data/runs/<run-id>/`。`node dist/cli.js skills` 列出已登记技能及文件哈希。`npm run check` 与 `npm test` 用于类型检查和离线流程验证。

示例是**合成回归任务**，只用于检查 pipeline。它在简报中显式选择 `process` 执行模式，只应运行可信脚本。其他任务默认使用 `docker`，需指定 `dockerImage`；容器关闭网络并限制进程数、CPU 和内存。真实 AI 学术研究案例仍待选定。

当前只有 `paper-search` 接入实际检索脚本；其他技能已登记，并在相关模型阶段按需提供方法指引，尚未逐项接通其辅助脚本或完成能力验证。模型调用次数、单次运行时长和实验超时已有硬上限；代理服务的实际计费单价尚未配置，因此目前不提供可靠的美元费用上限。跨项目记忆和多轮自动迭代也尚未实现。

## 科研链路

1. **定义问题**：明确研究范围、资源约束、成功指标和不成立的条件。
2. **建立证据**：检索并阅读原论文、相邻工作和最新结果，保存来源与检索边界。
3. **形成候选**：发散研究方向，检查已有工作是否覆盖，并提出可检验的差异。
4. **设计验证**：写出假设、预测、基线、指标、消融和计算预算。
5. **执行实验**：复现基线，运行实验，记录代码版本、环境、数据、随机种子与成本。
6. **分析和审查**：核对统计结果、异常、失败案例和可复现性，避免只保留正结果。
7. **产出与迭代**：形成可追溯的研究报告；由结果决定修正假设、换方向或继续实验。

贯穿每一步的要求：区分事实、推断和待验证想法；保留负结果；每项关键结论能回溯到论文、数据或可重跑的实验。

## 下一步

- 验证并固定 pi SDK 版本，完成会话、工具、事件、取消和恢复的技术探针。
- 定义研究账本与阶段契约，用模拟适配器跑通可恢复的 CLI 流程。
- 将技能清单中的能力按方法流程或受控脚本接入，逐项验证可用性。
- 稍后选择公开 AI 研究案例，再确定具体算力、时间和费用上限，完成真实闭环。

首版先验证 pipeline；跨项目记忆、更多研究场景和探索策略在真实运行记录积累后迭代。
