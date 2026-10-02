# 公共科研能力接口

v1.6 alpha 在公共 schema 1.0.0 中增加 `capability.catalog` Query 和 `capability.invoke` Command。它们通过 Core Service、TypeScript/Python client 使用，不暴露数据库或内部 Store。

## 目录

`capability.catalog` 返回七个版本化能力、操作和副作用：

| capability | 操作 | 关键门禁 |
| --- | --- | --- |
| `literature-evidence` | ingest、search、claim-check | 全文 passage、内容 hash、claim evidence |
| `novelty-boundary` | evaluate | 覆盖缺口、closest work、限定 novelty scope |
| `rival-hypotheses` | evaluate | target/null/rival、区分观察、更新规则 |
| `design-confounding` | evaluate | 实验单位、分配、对照、混杂、重复测量聚类 |
| `statistics-units` | analyze | 独立 unit 配对、缺失与重复拒绝 |
| `memory-improvement` | create、review、verify、search | candidate 不可检索，review/verify 仅用户 |
| `scientific-writing` | render | FactLedger、required facts、数值模板和 assertion audit |

## 调用

```ts
const result=await client.execute({
  schemaVersion:"1.0.0",
  commandId:crypto.randomUUID(),
  idempotencyKey:crypto.randomUUID(),
  workspaceId,
  projectId,
  actor:{id:"user:researcher",kind:"user"},
  issuedAt:new Date().toISOString(),
  type:"capability.invoke",
  payload:{
    capability:"statistics-units",
    input:{
      direction:"maximize",
      observations:[
        {unitId:"seed-1",variant:"baseline",value:0.80,missingReason:null},
        {unitId:"seed-1",variant:"candidate",value:0.90,missingReason:null},
        {unitId:"seed-2",variant:"baseline",value:0.82,missingReason:null},
        {unitId:"seed-2",variant:"candidate",value:0.91,missingReason:null}
      ]
    }
  }
});
```

先完成问题选择和 scope approval；draft Project 的 capability 调用会被拒绝。成功调用写入 `capability.invoked`，失败写入 `command.rejected`。服务端执行确定性校验，不调用模型或网络。

## 隔离与人工门禁

Evidence、claim 和 memory ID 在服务端绑定 Project；搜索只返回当前 Project 内容。Memory candidate 不进入检索，必须由用户依次 review、verify。Agent 不能代替用户完成这两步。Scientific writing 在任何写入前完成 assertion 和模板检查，避免 rejected command 留下部分 FactLedger。

## 当前边界

接口提供确定性核心门禁，不能替代研究者对文献相关性、创新价值、实验合理性或论文质量的人工判断。T3 的 baseline/执行和复现/发布仍为 partial，分别还缺少统一 baseline 对照对象和公共 release gate。
