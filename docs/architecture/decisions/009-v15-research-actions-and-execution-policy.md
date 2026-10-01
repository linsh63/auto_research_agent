# ADR 009：v1.5 ResearchAction 与执行策略

状态：accepted

## 决策

1. Project 创建后的研究推进统一表示为版本化 `ResearchAction`；首批行动为 `question.propose`、`question.select` 和 `scope.approve`。
2. 直接 API、自由聊天和候选点击共用同一个行动执行器、科研状态机、事件类型与门禁。
3. `ConversationSession`、消息、候选集合、行动审计和 `ExecutionPolicy` 在 schema 12 中持久化。
4. `manual` 返回一个建议行动，`candidate` 返回所有当前合法行动，`auto` 只在白名单、单轮数量、已知成本和权限范围内执行。
5. `scope.approve` 是强制人工门禁。自动聊天不能执行，Agent 不能直接执行，候选点击也必须由 `user` Actor 发起。
6. 每个候选集合的最后一项固定为自由输入；自由输入创建新的消息和候选集合，不被客户端枚举限制。
7. 候选集合一次性消费。旧集合、重复点击和跨 Project/Workspace 访问 fail closed。
8. P 阶段使用确定性的状态感知行动规划器，先证明入口与门禁语义。模型驱动的语义解析将在 Q 阶段通过 Pi runtime 接入，不能改变公共行动协议。

## 原因

未来 CLI、Web 和游戏会以不同形式表达同一个研究意图。若每个客户端直接调用内部 Workflow，审批、预算和事件语义会逐渐分叉。先把交互统一成 ResearchAction，客户端只负责收集意图和展示候选，Kernel 保留最终裁决权。

## 安全语义

- 直接 `action.execute` 是显式 API 行动，但强制审批仍要求用户身份。
- `manual` 和 `candidate` 中只有用户候选选择能产生状态变化。
- `auto` 只执行无人工门禁、无额外权限、在成本上限内且位于白名单的行动。
- 客户端提交的 `requiresHumanApproval=false` 不能降低 `scope.approve` 的固有门禁。
- 所有状态变化仍经过已有 Workflow；候选不是执行授权。

## 被拒绝的方案

- **让客户端把候选直接翻译成旧 Workflow 调用。** 多客户端会产生不同门禁和事件。
- **把聊天文本直接当状态变更。** 无法审计模型究竟请求了什么行动。
- **允许 auto 批准范围。** 破坏既有人工范围门禁。
- **在 P 阶段绑定特定模型 Provider。** Pi runtime、取消和持久 Job 属于 Q 阶段，提前耦合会让交互协议依赖单一实现。

## 限制

- 当前规划器覆盖范围阶段的三个行动，尚未覆盖完整科研链路。
- 自然语言语义解析目前是确定性的状态建议；尚未调用真实 LLM。
- Conversation 写入和 ProjectEvent 仍使用过渡 saga；事件失败会沿用 O 阶段的 in-doubt 语义。
