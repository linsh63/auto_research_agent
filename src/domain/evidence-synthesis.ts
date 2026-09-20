import { z } from "zod";

export const QueryFamilySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["problem", "method", "adjacent", "refutation", "dataset", "code"]),
  queries: z.array(z.string().min(3)).min(1),
  rationale: z.string().min(10),
});
export type QueryFamily = z.infer<typeof QueryFamilySchema>;

export const SearchProtocolSchema = z.object({
  id: z.string().min(1), programId: z.string().min(1), questionId: z.string().min(1),
  version: z.number().int().positive(), status: z.enum(["draft", "frozen", "superseded"]),
  queryFamilies: z.array(QueryFamilySchema).min(3), databases: z.array(z.string().min(2)).min(1),
  startYear: z.number().int().min(1900).nullable(), endYear: z.number().int().min(1900).nullable(),
  inclusionCriteria: z.array(z.string().min(5)).min(1), exclusionCriteria: z.array(z.string().min(5)).min(1),
  stopConditions: z.array(z.string().min(5)).min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parentId: z.string().nullable().default(null), createdAt: z.string(),
}).refine((value) => value.startYear === null || value.endYear === null || value.startYear <= value.endYear, { message: "startYear must be <= endYear" });
export type SearchProtocol = z.infer<typeof SearchProtocolSchema>;

export const ScreeningDecisionSchema = z.object({
  id: z.string().min(1), searchProtocolId: z.string().min(1), sourceId: z.string().min(1),
  documentVersionId: z.string().nullable().default(null), decision: z.enum(["include", "exclude", "review"]),
  reason: z.string().min(5), actor: z.string().min(1), sourceVersionHash: z.string().min(1), createdAt: z.string(),
});
export type ScreeningDecision = z.infer<typeof ScreeningDecisionSchema>;

export const NoveltyStatusSchema = z.enum(["unresolved", "likely_overlap", "supported_with_scope"]);
export type NoveltyStatus = z.infer<typeof NoveltyStatusSchema>;

export const EvidenceMapSchema = z.object({
  id: z.string().min(1), programId: z.string().min(1), questionId: z.string().min(1), searchProtocolId: z.string().min(1),
  version: z.number().int().positive(), status: z.enum(["draft", "frozen", "superseded"]),
  coverageStatus: z.enum(["complete", "incomplete"]), noveltyStatus: NoveltyStatusSchema,
  noveltyScope: z.string().nullable().default(null), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parentId: z.string().nullable().default(null), createdAt: z.string(),
});
export type EvidenceMap = z.infer<typeof EvidenceMapSchema>;

export const EvidenceMapEntrySchema = z.object({
  id: z.string().min(1), mapId: z.string().min(1), claimId: z.string().nullable().default(null),
  sourceId: z.string().min(1), passageId: z.string().nullable().default(null),
  relation: z.enum(["premise_support", "direct_result", "background", "refutation", "uncertain"]),
  topic: z.enum(["problem", "method", "dataset", "metric", "result", "limitation", "novelty"]),
  summary: z.string().min(10), evidenceLevel: z.enum(["full_text", "abstract", "metadata"]),
  critical: z.boolean().default(false), createdAt: z.string(),
});
export type EvidenceMapEntry = z.infer<typeof EvidenceMapEntrySchema>;

export const EvidenceGapSchema = z.object({
  id: z.string().min(1), mapId: z.string().min(1),
  kind: z.enum(["full_text_unavailable", "search_failure", "conflict", "coverage", "other"]),
  description: z.string().min(10), severity: z.enum(["low", "medium", "high"]),
  sourceId: z.string().nullable().default(null), resolved: z.boolean().default(false), createdAt: z.string(),
});
export type EvidenceGap = z.infer<typeof EvidenceGapSchema>;

export const ClosestWorkComparisonSchema = z.object({
  id: z.string().min(1), mapId: z.string().min(1), sourceId: z.string().min(1),
  proposedClaim: z.string().min(10), overlap: z.string().min(5), distinction: z.string().min(5),
  evidencePassageIds: z.array(z.string()).default([]),
  status: z.enum(["exact_overlap", "partial_overlap", "distinct", "unresolved"]), createdAt: z.string(),
});
export type ClosestWorkComparison = z.infer<typeof ClosestWorkComparisonSchema>;

export const CapabilityManifestSchema = z.object({
  name: z.string().min(1), versionHash: z.string().min(8), mode: z.enum(["method", "script", "mixed"]),
  supportedUseCases: z.array(z.string().min(2)).min(1), inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()), tools: z.array(z.string()).default([]),
  sideEffects: z.array(z.enum(["none", "network", "filesystem_read", "filesystem_write", "process"])).default(["none"]),
  requiredEvidence: z.array(z.string()).default([]),
  budget: z.object({ maxCalls: z.number().int().positive(), maxWallSeconds: z.number().positive() }),
  failureSemantics: z.enum(["fail_closed", "degrade", "skip"]),
});
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export const CapabilityInvocationSchema = z.object({
  id: z.string().min(1), programId: z.string().min(1), capabilityName: z.string().min(1), manifestHash: z.string().min(8),
  useCase: z.string().min(2), status: z.enum(["started", "succeeded", "failed", "skipped"]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/), outputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  selectedReason: z.string().min(5), rejectedAlternatives: z.array(z.string()).default([]), error: z.string().nullable().default(null),
  startedAt: z.string(), finishedAt: z.string().nullable().default(null),
});
export type CapabilityInvocation = z.infer<typeof CapabilityInvocationSchema>;

export function assertEvidenceEntryValid(entry: EvidenceMapEntry): void {
  if (entry.relation === "background" && entry.critical) throw new Error("Background evidence cannot satisfy a critical premise");
  if ((entry.relation === "premise_support" || entry.relation === "direct_result") && (!entry.passageId || entry.evidenceLevel !== "full_text")) {
    throw new Error("Direct or premise evidence requires a full-text passage");
  }
}

export function assertNoveltyValid(map: EvidenceMap, comparisons: ClosestWorkComparison[], gaps: EvidenceGap[]): void {
  const unresolvedHighGap = gaps.some((gap) => !gap.resolved && (gap.severity === "high" || gap.kind === "coverage" || gap.kind === "full_text_unavailable"));
  if (map.coverageStatus === "incomplete" || unresolvedHighGap) {
    if (map.noveltyStatus !== "unresolved") throw new Error("Incomplete coverage requires novelty=unresolved");
  }
  if (map.noveltyStatus === "likely_overlap" && comparisons.length === 0) throw new Error("Likely overlap requires a closest-work comparison");
  if (map.noveltyStatus === "supported_with_scope") {
    if (!map.noveltyScope?.trim()) throw new Error("Scoped novelty requires a non-empty scope");
    if (!comparisons.length || comparisons.some((comparison) => comparison.status === "unresolved" || comparison.status === "exact_overlap" || comparison.evidencePassageIds.length === 0)) {
      throw new Error("Scoped novelty requires resolved closest-work comparisons with passage evidence");
    }
  }
}
