# A–C 重新验收报告

日期：2026-09-19

本报告源于对 `v1.0.1`、`v1.0.2`、`v1.0.3` 的独立复验。第一次验收发现三个阶段只有基础骨架，随后重新打开阶段并补齐主流程接线、检索、记忆、搜索树和安全门。本文件记录修正后的结果；早期 release report 保留，作为过程审计记录。

## A：证据与引用

完成项：

- PaperQA2 `2026.8.12` worker 真实执行 sparse embedding ingestion 和 passage retrieval。
- JSONL schema 与实现同步；ingestion 使用 idempotency key；请求超时会终止 worker，下一请求自动重启。
- 七个 evidence 工具已注册到 pi：metadata、passage、identifier、citation expansion、document access、passage读取和retrieval解释。
- CanonicalDocument ingestion 同时写 SQLite evidence graph、内容寻址 artifact store和PaperQA2 worker。
- Hypothesis/Analysis 生成 Claim；最终报告生成前执行 Claim evidence gate。
- migration 在修改数据库前使用 SQLite backup API 创建备份。
- V1 fastText run 已迁移；另用系统公开 PDF 实际验证 pdftotext → 11 passages → artifact hash → PaperQA2 ingestion。
- SQLite关键词检索与PaperQA2 sparse检索使用相同40条fixture复验。

结果：

| Backend | HitRate@20 | MRR | nDCG@10 | P95 |
| --- | ---: | ---: | ---: | ---: |
| SQLite FTS5 | 1.000 | 0.766 | 0.868 | 约1.6 ms |
| PaperQA2 sparse | 0.850 | 0.458 | 0.532 | 约3.7 ms |

按照预注册规则，SQLite FTS5保持默认；PaperQA2 semantic/sparse模式标为 experimental，不能因为组件更复杂而默认启用。PaperQA2仍用于结构化 evidence worker和可选语义候选。

外部环境限制：当前用户无Docker socket权限，因此GROBID容器不能实跑；Docling standard会引入大型Torch/CUDA依赖，并导致本机worker冷启动不可接受，最终保留独立可选extra和pdftotext安全降级。LitQA2/LFRQA完整模型评测未运行，不能声称达到PaperQA2论文结果。

## B：长期研究记忆

完成项：

- run最终审批自动生成candidate，经过reviewed后晋升verified；普通模型阶段只能检索reviewed/verified。
- verified MemoryCard已接入ResearchEngine，并记录每次召回的run和reason。
- 默认关闭跨run召回；只有 `AUTO_RESEARCH_MEMORY_ENABLED=1` 才启用，符合“收益未证明时opt-in”。
- namespace表与默认层级、promotion、relation、trace、correct、retract、archive、purge、export/import均已实现。
- purge删除正文、FTS、access和relations，同时保存只含hash和影响计数的删除证明。
- 自动测试覆盖candidate不注入、namespace隔离、verified注入后续run、purge后不召回和非法状态跳转。

控制 benchmark 使用三个连续查询任务：无记忆需要3次外部查找，verified memory下为0次，重复查找减少100%，fixture事实错误为0。该结果只证明接口和门禁行为；还没有真实长研究任务的token、成本和研究者审阅时间对照，因此memory继续保持opt-in。

## C：自动实验迭代

完成项：

- search node包含稳定signature、parent-child lineage、artifact hash、metric、cost、duration和failure class。
- 相同signature跨run复用，不重新执行candidate。
- best-first可根据priority队列扩展children；linear保留为基线。
- parameter/patch模式有allowlist与forbidden-path门；Docker参数强制无网络、PID/CPU/RAM限制、只读mount、GPU设备锁参数和secret环境变量拦截。
- train/validation/test/audit role和sealed test门已实现；final test必须在search完成后显式approve，只能进入final_test_completed状态。
- fastText搜索使用112,000 train与8,000 validation；搜索期不读取published test。

相同2-candidate预算结果：

- linear最佳validation P@1：0.911；
- priority-guided best-first最佳validation P@1：0.922；
- 人工批准后单次published test P@1：0.918；
- 模型artifact保存SHA-256，节点签名复用测试通过。

限制：best-first的priority由fixture预先提供，尚未证明通用planner启发式优于linear；当前主机Docker daemon无权限，Docker/GPU路径只完成参数与边界测试，没有实际容器训练；因此GPU backend仍标记unverified，process backend仅允许固定hash的可信脚本。

## 总门禁

- TypeScript check/build：通过；
- 自动测试：17项通过；
- PaperQA2 ingestion/retrieval integration：通过；
- V1数据库backup/migration/readback：通过；
- npm生产依赖审计：0 vulnerabilities（`yaml`已从2.8.1升级到2.9.1）；
- Git secret扫描：应在release commit前再次执行；
- 工作区：release commit前要求clean。

## 最终判断

A、B、C在当前本地运行profile下已形成可用闭环。默认选择均遵循评测结果：关键词检索默认、语义检索experimental、长期记忆opt-in、linear稳定可用、best-first experimental。GROBID/Docker GPU/LitQA2等需要外部权限或大型数据的profile不能登记为已验证，后续必须单独验收。
