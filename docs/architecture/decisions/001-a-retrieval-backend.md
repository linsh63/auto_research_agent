# ADR 001: A 阶段检索 backend

状态：accepted

日期：2026-09-19

## 决策

使用 PaperQA2 `2026.8.12` 作为 Python evidence worker 的首选实现，使用 Tantivy 做论文/全文检索；SQLite 保存项目事实、Passage、Claim 和 provenance。PaperQA2的 NumPy vector store 作为小规模默认，Qdrant只作为可替换 backend。Node 通过 JSONL stdio RPC 调用 worker。

## 原因

PaperQA2已经包含科学论文 metadata client、全文搜索、chunk embedding、证据收集和 contextual reranking，并有 LitQA2/LFRQA评测路径。项目不需要重新实现这些已验证的 RAG 组件。Feynman 的 provenance/PaperRank 和 STORM 的 BGE-M3/Qdrant 接口作为设计参考，不作为运行时依赖。

## 保留的项目边界

PaperQA2 的摘要、contextual summary 和相关性分数是候选证据。最终事实保存在项目自己的 SQLite evidence graph；Claim 必须关联 CanonicalDocument Passage 或 ExperimentRun。任何 external parser 或 vector index 都是可重建派生物。

## 降级

worker capability 不可用时使用当前 paper-search fallback和SQLite FTS5；降级写入报告，不能宣称经过完整 semantic evidence review。GROBID/Docling未安装时使用结构化 HTML或 pdftotext，并记录 parser warning。

## 许可证和版本

PaperQA2仓库为 Apache-2.0；本项目只固定发行版/commit和依赖锁，不复制其 agent 框架。上游依赖、解析器、模型 revision和镜像 digest写入 SBOM与release report。
