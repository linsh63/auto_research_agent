import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hashPayload } from "./research.js";

export const FactValueSchema=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const ResearchFactSchema=z.object({
  id:z.string().regex(/^[a-z][a-z0-9_.-]*$/),kind:z.enum(["result","design","scope","runtime","threshold","identifier"]),
  value:FactValueSchema,unit:z.string().min(1).nullable().default(null),sourceObjectId:z.string().min(1),sourcePath:z.string().min(1),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
});
export type ResearchFact=z.infer<typeof ResearchFactSchema>;

export const FactLedgerSchema=z.object({
  id:z.string().min(1),programId:z.string().min(1),studyId:z.string().min(1).nullable(),facts:z.array(ResearchFactSchema).min(1),
  requiredFactIds:z.array(z.string()).default([]),contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),
}).superRefine((ledger,ctx)=>{const ids=ledger.facts.map(fact=>fact.id),known=new Set(ids);if(known.size!==ids.length)ctx.addIssue({code:"custom",message:"Fact IDs must be unique"});for(const id of ledger.requiredFactIds)if(!known.has(id))ctx.addIssue({code:"custom",message:`Required fact ${id} is not defined`});});
export type FactLedger=z.infer<typeof FactLedgerSchema>;

export const FactAssertionSchema=z.object({factId:z.string().min(1),assertedValue:FactValueSchema,context:z.string().min(3)});
export type FactAssertion=z.infer<typeof FactAssertionSchema>;
export const FactAuditIssueSchema=z.object({kind:z.enum(["unknown_fact","value_mismatch","missing_required","duplicate_assertion"]),factId:z.string(),expected:FactValueSchema.optional(),actual:FactValueSchema.optional(),context:z.string()});
export const FactAuditSchema=z.object({id:z.string().min(1),ledgerId:z.string().min(1),stage:z.string().min(1),status:z.enum(["pass","fail"]),assertions:z.array(FactAssertionSchema),issues:z.array(FactAuditIssueSchema),inputHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string()});
export type FactAudit=z.infer<typeof FactAuditSchema>;

export function createFactLedger(input:{id:string;programId:string;studyId?:string|null;facts:ResearchFact[];requiredFactIds?:string[];createdAt?:string}):FactLedger{const body={programId:input.programId,studyId:input.studyId??null,facts:input.facts,requiredFactIds:input.requiredFactIds??[]};return FactLedgerSchema.parse({...input,...body,contentHash:hashPayload(body),createdAt:input.createdAt??new Date().toISOString()});}
function equalValue(expected:z.infer<typeof FactValueSchema>,actual:z.infer<typeof FactValueSchema>):boolean{return typeof expected==="number"&&typeof actual==="number"?Math.abs(expected-actual)<=1e-12:Object.is(expected,actual);}
export function auditFactAssertions(ledger:FactLedger,stage:string,assertions:FactAssertion[],options:{requireAll?:boolean}={}):FactAudit{const parsed=assertions.map(item=>FactAssertionSchema.parse(item)),facts=new Map(ledger.facts.map(fact=>[fact.id,fact])),issues:z.infer<typeof FactAuditIssueSchema>[]=[],seen=new Set<string>();for(const assertion of parsed){if(seen.has(assertion.factId))issues.push({kind:"duplicate_assertion",factId:assertion.factId,context:assertion.context});seen.add(assertion.factId);const fact=facts.get(assertion.factId);if(!fact)issues.push({kind:"unknown_fact",factId:assertion.factId,actual:assertion.assertedValue,context:assertion.context});else if(!equalValue(fact.value,assertion.assertedValue))issues.push({kind:"value_mismatch",factId:assertion.factId,expected:fact.value,actual:assertion.assertedValue,context:assertion.context});}if(options.requireAll)for(const factId of ledger.requiredFactIds)if(!seen.has(factId))issues.push({kind:"missing_required",factId,expected:facts.get(factId)?.value,context:`${stage} must assert this required fact`});return FactAuditSchema.parse({id:`fact-audit-${randomUUID()}`,ledgerId:ledger.id,stage,status:issues.length?"fail":"pass",assertions:parsed,issues,inputHash:hashPayload(parsed),createdAt:new Date().toISOString()});}
export function assertFactAudit(audit:FactAudit):void{if(audit.status==="fail")throw new Error(`Fact audit failed: ${audit.issues.map(issue=>`${issue.kind}:${issue.factId}`).join(", ")}`);}
export function formatFactValue(fact:ResearchFact):string{const value=typeof fact.value==="number"?Number.isInteger(fact.value)?String(fact.value):String(Number(fact.value.toPrecision(8))):String(fact.value);return fact.unit?`${value} ${fact.unit}`:value;}
export function factIdsInTemplate(template:string):string[]{return[...new Set([...template.matchAll(/\{\{([a-z][a-z0-9_.-]*)\}\}/g)].map(match=>match[1]!))];}
export function renderFactTemplate(template:string,ledger:FactLedger):string{const facts=new Map(ledger.facts.map(fact=>[fact.id,fact])),placeholders=factIdsInTemplate(template);if(!placeholders.length)throw new Error("Fact-bound text requires at least one fact placeholder");const literal=template.replace(/\{\{[a-z][a-z0-9_.-]*\}\}/g,"");if(/\d/.test(literal))throw new Error("Numeric literals are forbidden in fact-bound templates; reference a fact instead");return template.replace(/\{\{([a-z][a-z0-9_.-]*)\}\}/g,(_,id:string)=>{const fact=facts.get(id);if(!fact)throw new Error(`Unknown report fact ${id}`);return formatFactValue(fact);});}
