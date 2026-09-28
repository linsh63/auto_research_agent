import { z } from "zod";

const DatasetRoleSchema=z.object({id:z.string().min(1),experimentalUnit:z.string().min(2),primaryOutcome:z.string().min(2),targetConstruct:z.string().min(3)});
export const DatasetSubstitutionRequestSchema=z.object({
  original:DatasetRoleSchema,replacement:DatasetRoleSchema,unavailabilityEvidence:z.array(z.string().min(5)).min(1),
  protocolFrozen:z.boolean(),approvedDeviationId:z.string().min(1).nullable().default(null),scopeRevision:z.string().min(20),
});
export type DatasetSubstitutionRequest=z.infer<typeof DatasetSubstitutionRequestSchema>;
export const DatasetSubstitutionAssessmentSchema=z.object({decision:z.enum(["accepted_pre_freeze","accepted_with_deviation","deviation_required","rejected"]),preserved:z.array(z.string()),changed:z.array(z.string()),reasons:z.array(z.string()).min(1)});
export type DatasetSubstitutionAssessment=z.infer<typeof DatasetSubstitutionAssessmentSchema>;

export function assessDatasetSubstitution(raw:DatasetSubstitutionRequest):DatasetSubstitutionAssessment{const input=DatasetSubstitutionRequestSchema.parse(raw),preserved:string[]=[],changed:string[]=[];for(const field of ["experimentalUnit","primaryOutcome","targetConstruct"] as const)(input.original[field]===input.replacement[field]?preserved:changed).push(field);if(changed.length)return{decision:"rejected",preserved,changed,reasons:[`Replacement changes the scientific contract: ${changed.join(", ")}. Derive a new question or protocol instead of silently substituting data.`]};if(input.protocolFrozen&&!input.approvedDeviationId)return{decision:"deviation_required",preserved,changed,reasons:["The protocol is frozen; an approved protocol deviation and refreeze are required before replacement data can be used."]};if(!input.scopeRevision.includes(input.replacement.id))return{decision:"rejected",preserved,changed:["scopeRevision"],reasons:["The revised scope must name the replacement dataset explicitly."]};return{decision:input.protocolFrozen?"accepted_with_deviation":"accepted_pre_freeze",preserved,changed,reasons:[input.protocolFrozen?"The approved deviation preserves the declared unit, outcome, and construct.":"The substitution occurred before protocol freeze and preserves the declared unit, outcome, and construct."]};}
