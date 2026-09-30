# ADR 007：v1.5 公共契约与兼容 Facade

状态：accepted

## 决策

1. 用 `src/public` 建立唯一公共入口，当前导出 Contracts、Kernel guard 和 ResearchApplication。
2. 公共命令、查询、结果、错误、read model 与事件 envelope 使用版本 `1.0.0`。
3. Zod 是 TypeScript 真源，同时确定性生成并提交 JSON Schema 2020-12 与哈希 manifest。
4. `ResearchApplication` 是迁移期唯一允许依赖现有 WorkflowCoordinator 和 ResearchStore 的公共兼容 facade。
5. Contracts、Kernel 和公共 index 禁止导入 domain、application、infrastructure、adapters 或旧 core 内部路径。
6. 新 Project 在当前进程内绑定 Workspace；旧 Project 必须由调用者显式提供 compatibility binding，未绑定时 fail closed。
7. 幂等键以 Workspace、Project 和 key 组成作用域；同一键承载不同命令时返回稳定 `CONFLICT`。
8. N 阶段的 `eventIds` 保持空数组；持久化事件在 O 阶段实现，不伪造事件完成状态。

## 原因

现有 CLI 和真实研究脚本直接打开数据库并调用内部 Store，无法同时支持独立 CLI、Web、游戏和社区项目。一次性搬迁全部代码风险过高，因此先冻结外部契约，并用窄 facade 包住已验证的科研状态机。这样可以先建立客户端不能跨越的依赖边界，再逐阶段迁移实现。

## 被拒绝的方案

- **立即拆成多个 npm 包。** 当前内部依赖尚未理清，会制造循环依赖并扩大回归面。
- **直接把 Store 当公共 SDK。** 这会泄露数据库结构，使事件、远程服务和 Python SDK 无法演进。
- **等待 Core Service 完成后再定义契约。** 服务实现会反过来决定领域协议，导致 CLI、Web 和游戏各自形成不同接口。

## 兼容性

- 旧 CLI 和内部模块保持原路径，N 阶段不迁移调用方。
- 根包新增显式 exports，并在构建时生成声明文件。
- 旧 Project 通过显式 `workspaceBindings` 接入；O 阶段持久化 Workspace 后淘汰该过渡参数。
- schema 版本不兼容返回 `INCOMPATIBLE_VERSION`，不尝试静默降级。

## 限制

- 幂等结果和 Workspace binding 当前只在 ResearchApplication 进程内保存。
- 尚无持久化 ResearchEvent、Project fork、Bundle 或 Core Service。
- 公共 facade 目前只覆盖创建 Project、提出/选择问题、批准范围和查询状态的最小闭环。
- 这些限制属于后续 O–S 阶段，不能把 N 阶段 facade 描述为完整 SDK。
