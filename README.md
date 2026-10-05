# Auto Research Agent

本项目用于设计并逐步实现一个适用于不同学科和研究场景的自动科研工作流与 agent。目标是让 agent 在可追溯的证据和实验结果上持续迭代研究问题、方法与验证方案。具体论文和领域由每次研究任务单独指定；项目不预设起点论文。

## 当前阶段

V1 最小科研闭环已经实现；v1.1的A证据、B长期记忆、C有界实验搜索和D第二场景均已完成本地profile验收。D 使用 scikit-learn Digits 图像分类验证同一核心流程可以接入CV任务，详情见 [v1.1.0发布报告](docs/reports/releases/v1.1.0-report.md)。证据系统使用SQLite事实图、FTS5默认检索和PaperQA2可选语义检索；长期记忆默认opt-in；实验搜索支持节点签名复用、搜索树和sealed final-test门。

v1.2 已正式发布：confirmatory workflow 包含版本化问题/protocol、冻结 EvidenceMap、竞争假设、baseline复现、探索/确认隔离、确定性统计、bubblewrap实验边界、ClaimAssessment、四维独立审查和结构化研究决策。v1.3 A 阶段现已通过强制门禁整改：新研究默认使用通用实验单位、事实账本、LLM 事实审计、fact-bound 报告、持久化数据替换门和执行前环境预检。当前开发版本为 `1.3.0-alpha.2`，详情见 [v1.3 规划](docs/planning/v1.3-plan.md)和[alpha.2 整改报告](docs/reports/releases/v1.3.0-alpha.2-report.md)。

v1.5 Headless Research Kernel 的 N–S、T1–T5 已全部完成，v1.5.0 通过正式发布验收。v1.6 的 U–Y 阶段现已实现：七类科研能力已开放为公共接口，Linux/macOS 原生 Core 矩阵通过，并支持系统 OpenSSH 信任、版本化 Linux Worker、portable workspace、远端 Bubblewrap、CAS Artifact 回传、remote confirmation、公共 baseline 门禁和只读发布评估。Windows 不进入 v1.6 支持和发布矩阵。详情见 [v1.6 规划](docs/planning/v1.6-plan.md)。正式 CLI、Web 和带插件商城界面的科研游戏仍归入 v2.0 项目集。

[文档导航](docs/README.md)按规划、架构、指南、案例和报告组织全部资料。[下一阶段备选方案](docs/planning/next-stage-options.md)保留此前的路线比较。

[v1.2 完整实施规划](docs/planning/v1.2-plan.md)已经固定问题收敛、竞争假设、protocol freeze、探索/确认隔离、统计分析、执行边界、真实案例和 E–H 阶段发布门禁，供后续执行模型按阶段实施。

[v1.1 实施规划](docs/planning/v1.1-plan.md)记录 A、B、C 三阶段及完成后增补的 D 阶段架构、资源墙和验收门禁。

[总体规划（第一版）](docs/planning/v1-plan.md)记录了已确认的目标、基于 pi SDK 的架构、skills 接入方式、实施顺序和暂缓的决策。

## 运行原型

### v1.5 Core package 快速开始

稳定版 `1.6.0` 可从 npm registry 安装到用户目录：

```bash
npm install -g --prefix "$HOME/.local" research-explorer-core
```

也可以从公开 GitHub 仓库构建，或在仓库运行 `npm pack` 后安装生成的 `research-explorer-core-1.6.0.tgz`：

```bash
npm install /absolute/path/research-explorer-core-1.6.0.tgz
```

保存以下内容为 `quickstart.mjs`，它只使用已发布的包导出，并在临时目录建立一个 Project：

```js
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResearchClient } from "research-explorer-core/client";
import { PUBLIC_SCHEMA_VERSION } from "research-explorer-core/contracts";
import { startCoreService } from "research-explorer-core/server";

const root=mkdtempSync(join(tmpdir(),"auto-research-quickstart-"));
const service=await startCoreService({databasePath:join(root,"research.db"),dataDir:join(root,"service")});
try {
  const token=readFileSync(service.address.tokenFile,"utf8").trim();
  const client=await ResearchClient.connect({baseUrl:service.address.baseUrl,token});
  const result=await client.execute({schemaVersion:PUBLIC_SCHEMA_VERSION,commandId:"quickstart-create",idempotencyKey:"quickstart-create",workspaceId:"workspace:quickstart",projectId:null,actor:{id:"user:quickstart",kind:"user"},issuedAt:new Date().toISOString(),type:"project.create",payload:{intent:{title:"Quickstart research project",direction:"Verify that the installed headless research kernel can create an auditable project.",domain:"research tooling",constraints:["public SDK only"],allowedData:["synthetic fixture"],prohibitions:["no external calls"],profile:"smoke",budget:{gpuHours:0.001,wallHours:1,diskGiB:1,modelCalls:1,knownCostUsd:0}}}});
  console.log(JSON.stringify({status:result.status,projectId:result.projectId}));
} finally {
  await service.close();
}
```

运行 `node quickstart.mjs`，应返回 `status: "accepted"`。包兼容、旧名称迁移和数据库回滚规则见[兼容政策](docs/guides/compatibility-and-deprecation.md)。

### 源码仓库原型

需要 Node.js 22.19+。模型通过 pi 原生 provider catalog 或 `models.json` 配置；[模型 Provider 配置](docs/guides/model-providers.md)说明内置 provider、自定义 API 和凭据入口。`AUTO_RESEARCH_API_KEY` 可作为不落盘的临时 runtime key；也可以使用 pi `models.json` 的环境变量凭据语法。未提供 provider 配置时，旧快捷配置仍默认使用 `https://newapi.x-era.com/v1` 的 `gpt-5.6-luna`。

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

`npm run probe:pi` 使用一次工具调用和一次立即取消的请求，验证 pi SDK 的自定义工具、事件流、持久会话恢复和取消；结果写入 [pi-sdk-probe.json](docs/reports/validation/pi-sdk-probe.json)。该命令需要模型 API，并会产生少量用量。

合成回归示例只用于检查 pipeline。首个真实验收案例使用 fastText v0.9.2 和完整 AG News 公开划分，协议见 [案例说明](docs/cases/fasttext-agnews.md)。v1.2 H 案例使用 bubblewrap、单 GPU 和 CIFAR-10/CIFAR-10-C。可信固定哈希脚本可使用受限 process；agent 生成或修改的代码使用断网 bubblewrap，不要求 Docker 权限。

`paper-search`和PaperQA2 worker均已接入；其余技能按方法或混合适配进入相关阶段。`npm run validate:skills`对全部14项能力做离线检查。模型调用次数、单次运行时长和实验超时已有硬上限。跨项目记忆已实现但默认关闭，需设置`AUTO_RESEARCH_MEMORY_ENABLED=1`；best-first搜索仍属experimental。

第二场景可用 `npm run validate:cv` 免费重放。它会运行真实 Digits baseline/candidate，并用确定性审计 adapter 驱动语言阶段和两个人工门，最终产物写入忽略提交的 `.research-data/cases/sklearn-digits/`。当前机器没有 Docker daemon 权限，因此该案例登记为 local-process profile。

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
- 扩展更多研究场景，继续检验核心接口的通用性。
- 在获得可信计费信息后加入金额预算。

当前版本已验证文本与小型CV pipeline；跨项目记忆收益、更多研究场景和探索策略随真实运行记录继续迭代。
