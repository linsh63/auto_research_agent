import { z } from "zod";
import type { FactLedger, ResearchFact } from "../domain/facts.js";

export const FactBoundBlockSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("heading"),level:z.number().int().min(1).max(6),text:z.string().min(1)}),
  z.object({type:z.literal("qualitative"),text:z.string().min(1)}),
  z.object({type:z.literal("fact_text"),template:z.string().min(1)}),
  z.object({type:z.literal("fact_table"),title:z.string().min(1),factIds:z.array(z.string()).min(1)}),
]);
export const StructuredReportSchema=z.object({title:z.string().min(1),blocks:z.array(FactBoundBlockSchema).min(1)});
export type StructuredReport=z.infer<typeof StructuredReportSchema>;

function formatFact(fact:ResearchFact):string{const value=typeof fact.value==="number"?Number.isInteger(fact.value)?String(fact.value):String(Number(fact.value.toPrecision(8))):String(fact.value);return fact.unit?`${value} ${fact.unit}`:value;}
export function factIdsInTemplate(template:string):string[]{return[...new Set([...template.matchAll(/\{\{([a-z][a-z0-9_.-]*)\}\}/g)].map(match=>match[1]!))];}
export function renderFactTemplate(template:string,ledger:FactLedger):string{const facts=new Map(ledger.facts.map(fact=>[fact.id,fact])),placeholders=factIdsInTemplate(template);if(!placeholders.length)throw new Error("Fact-bound text requires at least one fact placeholder");const literal=template.replace(/\{\{[a-z][a-z0-9_.-]*\}\}/g,"");if(/\d/.test(literal))throw new Error("Numeric literals are forbidden in fact-bound templates; reference a fact instead");return template.replace(/\{\{([a-z][a-z0-9_.-]*)\}\}/g,(_,id:string)=>{const fact=facts.get(id);if(!fact)throw new Error(`Unknown report fact ${id}`);return formatFact(fact);});}
export function renderStructuredReport(document:StructuredReport,ledger:FactLedger):string{const parsed=StructuredReportSchema.parse(document),facts=new Map(ledger.facts.map(fact=>[fact.id,fact])),lines=[`# ${parsed.title}`,""];for(const block of parsed.blocks){if(block.type==="heading")lines.push(`${"#".repeat(block.level)} ${block.text}`,"");else if(block.type==="qualitative"){if(/\d/.test(block.text))throw new Error("Qualitative report blocks cannot contain numeric literals");lines.push(block.text,"");}else if(block.type==="fact_text")lines.push(renderFactTemplate(block.template,ledger),"");else{lines.push(`### ${block.title}`,"","| Fact | Value | Source |","| --- | ---: | --- |");for(const id of block.factIds){const fact=facts.get(id);if(!fact)throw new Error(`Unknown report fact ${id}`);lines.push(`| ${id} | ${formatFact(fact)} | ${fact.sourceObjectId}:${fact.sourcePath} |`);}lines.push("");}}return lines.join("\n");}
