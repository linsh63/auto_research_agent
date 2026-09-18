# 技能清单

安装位置：`~/.codex/skills/`。本清单是项目的能力目录；这些 skill 是工作流说明或辅助脚本，尚未组成自动运行的科研 agent。当前下载使用各仓库的 `main` 分支（AnySearch 为 v3.1.1），后续构建可复现系统时应固定版本与内容哈希。

| 环节 | Skill | 来源 | 当前用途 |
| --- | --- | --- | --- |
| 网络检索 | `anysearch` | [AnySearch](https://github.com/anysearch-ai/anysearch-skill) | 网页搜索与页面提取；匿名额度较低 |
| 论文检索 | `paper-search` | [ResearchStudio](https://github.com/microsoft/ResearchStudio/tree/main/ResearchStudio-Idea/skills/paper_search) | 跨学术数据库搜论文、去重与排序 |
| 问题追问 | `grill-me`、`grilling` | [Matt Pocock](https://github.com/mattpocock/skills/tree/main/skills/productivity) | 澄清目标、约束和研究决策；`grill-me` 依赖 `grilling` |
| 方向发散 | `scientific-brainstorming` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-brainstorming) | 产生候选方向并记录假设、反例和评估标准 |
| 多轮选题 | `research-ideation` | [wushangruide](https://github.com/wushangruide/skills/tree/main/skills/research-ideation) | 多轮生成、批评和比较想法 |
| 单个提案 | `idea-spark` | [ResearchStudio](https://github.com/microsoft/ResearchStudio/tree/main/ResearchStudio-Idea/skills/idea_spark) | 把一个方向收敛为具体、可证伪的提案 |
| 新颖性核查 | `scoop-check` | [ResearchStudio](https://github.com/microsoft/ResearchStudio/tree/main/ResearchStudio-Idea/skills/scoop_check) | 用检索结果核对具体贡献与已有工作的重叠 |
| 假设形成 | `hypothesis-generation` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/hypothesis-generation) | 把观察转成假设、对立解释与判别性预测 |
| 实验设计 | `experimental-design` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/experimental-design) | 规划变量、对照、重复与偏差控制 |
| 结果分析 | `statistical-analysis` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/statistical-analysis) | 统计检验、效应量、假设检查与结果报告 |
| 证据质疑 | `scientific-critical-thinking` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-critical-thinking) | 检查证据强度、混杂因素和结论边界 |
| 研究写作 | `scientific-writing` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-writing) | 将已验证证据写成可追溯的稿件 |
| 形式化评审 | `peer-review` | [K-Dense AI](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/peer-review) | 对提案或稿件做结构化批评；使用未公开稿件时须遵守授权和期刊政策 |

## 本机运行状态

- `paper-search`：依赖已安装在自身的 `.venv` 中；本地自检 16 项通过。其原始 Claude 路径已在本机 `SKILL.md` 中注明 Codex 替代路径。
- `scoop-check`：依赖 `paper-search`。其原始 Claude 路径和 `TaskCreate` 用法已在本机 `SKILL.md` 中注明 Codex 替代方式。
- `idea-spark`：依赖已安装在自身的 `.venv` 中。arXiv、OpenAlex、Semantic Scholar 连接器检查通过；OpenReview 缺少账号凭据，会被跳过。
- `experimental-design` 和 `statistical-analysis`：技能文件已安装；可选脚本所需的科学计算包尚未单独配置，等确定实验执行方式后再固定版本安装。
- 其他本轮安装的 K-Dense 技能以方法指导和离线辅助脚本为主。它们不代替真实文献核对、实验复现或研究者判断。

## 待补的系统能力

这份清单还缺少完整论文全文解析与证据库、LLM 实验执行和资源调度、实验追踪、复现验证、长期记忆、预算控制，以及跨阶段的编排逻辑。这些应在项目设计阶段决定由现有工具、现有 skill 还是自建组件承担。
