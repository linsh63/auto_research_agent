import { z } from "zod";
import { FactAssertionSchema } from "./facts.js";

export const ReviewDimensionSchema=z.enum(["evidence","methods","statistics","reproducibility"]);
export type ReviewDimension=z.infer<typeof ReviewDimensionSchema>;

export const ValidityThreatSchema=z.object({id:z.string().min(1),claimAssessmentId:z.string().min(1),kind:z.enum(["internal","construct","external","statistical"]),severity:z.enum(["low","medium","high"]),description:z.string().min(10),mitigation:z.string().min(5).nullable(),createdAt:z.string()});
export type ValidityThreat=z.infer<typeof ValidityThreatSchema>;

export const ClaimAssessmentSchema=z.object({
  id:z.string().min(1),programId:z.string().min(1),studyId:z.string().min(1),claimId:z.string().min(1),claimText:z.string().min(10),
  scope:z.string().min(10),protocolId:z.string().min(1),evidenceMapId:z.string().min(1),analysisRunId:z.string().min(1),estimateIds:z.array(z.string()).min(1),
  supportingEvidenceIds:z.array(z.string()).min(1),opposingEvidenceIds:z.array(z.string()).default([]),alternativeExplanations:z.array(z.string()).min(1),
  invalidationConditions:z.array(z.string()).min(1),grade:z.enum(["observed","suggestive","supported","replicated","unresolved","refuted"]),
  factLedgerId:z.string().min(1).nullable().default(null),claimFactIds:z.array(z.string()).default([]),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),
}).superRefine((value,ctx)=>{if((value.factLedgerId===null)!==(value.claimFactIds.length===0))ctx.addIssue({code:"custom",message:"factLedgerId and claimFactIds must be supplied together"});});
export type ClaimAssessment=z.infer<typeof ClaimAssessmentSchema>;

export const ReviewFindingSchema=z.object({id:z.string().min(1),reviewId:z.string().min(1),severity:z.enum(["major","minor","note"]),location:z.string().min(3),observation:z.string().min(10),criterion:z.string().min(5),whyItMatters:z.string().min(10),requestedAction:z.string().min(5),status:z.enum(["open","addressed","accepted_limitation"]),createdAt:z.string()});
export type ReviewFinding=z.infer<typeof ReviewFindingSchema>;

export const StructuredReviewSchema=z.object({id:z.string().min(1),programId:z.string().min(1),studyId:z.string().min(1),dimension:ReviewDimensionSchema,roleSessionId:z.string().min(1),verdict:z.enum(["sound","needs_work","invalid"]).default("needs_work"),confidence:z.enum(["low","medium","high"]).default("medium"),summary:z.string().min(20),inputHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string()});
export type StructuredReview=z.infer<typeof StructuredReviewSchema>;

export const ReviewResponseSchema=z.object({id:z.string().min(1),reviewId:z.string().min(1),findingId:z.string().min(1),disposition:z.enum(["addressed","accepted_limitation"]),response:z.string().min(10),evidenceIds:z.array(z.string()).min(1),actor:z.string().min(1),createdAt:z.string()});
export type ReviewResponse=z.infer<typeof ReviewResponseSchema>;

export const ModelRoleSessionSchema=z.object({id:z.string().min(1),programId:z.string().min(1),role:z.enum(["researcher","methodologist","statistician","reviewer","writer"]),providerModel:z.string().min(3),sessionKind:z.enum(["independent","continued"]),toolAccess:z.array(z.string()).default([]),inputHash:z.string().regex(/^[a-f0-9]{64}$/),independence:z.enum(["none","session","model","provider","human"]),createdAt:z.string()});
export type ModelRoleSession=z.infer<typeof ModelRoleSessionSchema>;

export const ModelInvocationSchema=z.object({
  id:z.string().min(1),programId:z.string().min(1),roleSessionId:z.string().min(1).nullable(),stage:z.string().min(1),providerModel:z.string().min(3),
  status:z.enum(["completed","failed","timed_out"]),inputHash:z.string().regex(/^[a-f0-9]{64}$/),outputHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  outputText:z.string().nullable().default(null),usage:z.unknown(),knownCostUsd:z.number().nonnegative(),error:z.string().nullable(),createdAt:z.string(),finishedAt:z.string(),
});
export type ModelInvocation=z.infer<typeof ModelInvocationSchema>;

export const ResearchDecisionSchema=z.object({id:z.string().min(1),programId:z.string().min(1),studyId:z.string().min(1),action:z.enum(["collect_evidence","redesign","debug_reproduction","explore","confirm","replicate","publish_bounded_result","stop_low_value","stop_inconclusive"]),rationale:z.string().min(20),claimAssessmentIds:z.array(z.string()).min(1),reviewIds:z.array(z.string()).length(4),approvedBy:z.string().min(1),approvedAt:z.string(),createdAt:z.string()});
export type ResearchDecision=z.infer<typeof ResearchDecisionSchema>;

export const ReproductionManifestSchema=z.object({id:z.string().min(1),programId:z.string().min(1),studyId:z.string().min(1),codeHashes:z.array(z.string()).min(1),dataManifestHashes:z.array(z.string()).min(1),protocolHash:z.string().regex(/^[a-f0-9]{64}$/),analysisPlanHash:z.string().regex(/^[a-f0-9]{64}$/),environment:z.record(z.string(),z.string()),commands:z.array(z.array(z.string())).min(1),artifactHashes:z.array(z.string()).default([]),contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string()});
export type ReproductionManifest=z.infer<typeof ReproductionManifestSchema>;

const ReviewSeverityInputSchema=z.preprocess(value=>value==="high"?"major":value==="medium"?"minor":value==="low"?"note":value,z.enum(["major","minor","note"]));
export const ReviewModelOutputSchema=z.object({verdict:z.enum(["sound","needs_work","invalid"]).default("needs_work"),confidence:z.enum(["low","medium","high"]).default("medium"),summary:z.string().min(20),factAssertions:z.array(FactAssertionSchema).default([]),findings:z.array(z.object({severity:ReviewSeverityInputSchema,location:z.string().min(3),observation:z.string().min(10),criterion:z.string().min(5),whyItMatters:z.string().min(10),requestedAction:z.string().min(5)}))});
export type ReviewModelOutput=z.infer<typeof ReviewModelOutputSchema>;
