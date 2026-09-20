import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EvidenceGapSchema, EvidenceMapEntrySchema, EvidenceMapSchema, ClosestWorkComparisonSchema, assertEvidenceEntryValid, assertNoveltyValid } from "../src/domain/evidence-synthesis.js";

interface FixtureCase { id: string; type: "entry" | "novelty"; expected: "accept" | "reject"; relation?: string; level?: string; passage?: boolean; critical?: boolean; coverage?: string; novelty?: string; gap?: boolean; comparison?: boolean; comparisonStatus?: string; }
const fixture = JSON.parse(readFileSync(resolve("benchmarks/evidence-synthesis/fixture.json"), "utf8")) as { thresholds: Record<string, number>; cases: FixtureCase[] };
let correct = 0; let noveltyOverclaims = 0; let backgroundDirectAcceptances = 0; let criticalAccepted = 0; let criticalTotal = 0;
const rows = fixture.cases.map((item, index) => {
  let accepted = true;
  try {
    if (item.type === "entry") {
      const entry = EvidenceMapEntrySchema.parse({ id: `entry-${index}`, mapId: "map", claimId: null, sourceId: "source", passageId: item.passage ? "passage" : null, relation: item.relation, topic: "result", summary: "A benchmark evidence synthesis statement.", evidenceLevel: item.level, critical: item.critical, createdAt: new Date(0).toISOString() });
      assertEvidenceEntryValid(entry);
      if (entry.critical) { criticalTotal++; criticalAccepted++; }
      if (entry.relation === "background" && entry.critical) backgroundDirectAcceptances++;
    } else {
      const map = EvidenceMapSchema.parse({ id: "map", programId: "program", questionId: "question", searchProtocolId: "search", version: 1, status: "draft", coverageStatus: item.coverage, noveltyStatus: item.novelty, noveltyScope: "A bounded benchmark scope.", contentHash: "a".repeat(64), parentId: null, createdAt: new Date(0).toISOString() });
      const gaps = item.gap ? [EvidenceGapSchema.parse({ id: "gap", mapId: "map", kind: "coverage", description: "A high-severity benchmark coverage gap.", severity: "high", sourceId: null, resolved: false, createdAt: new Date(0).toISOString() })] : [];
      const comparisons = item.comparison ? [ClosestWorkComparisonSchema.parse({ id: "comparison", mapId: "map", sourceId: "source", proposedClaim: "A scoped novelty benchmark claim.", overlap: "Shared benchmark setup.", distinction: "Different declared treatment.", evidencePassageIds: ["passage"], status: item.comparisonStatus ?? "partial_overlap", createdAt: new Date(0).toISOString() })] : [];
      assertNoveltyValid(map, comparisons, gaps);
    }
  } catch { accepted = false; }
  const expectedAccepted = item.expected === "accept";
  if (accepted === expectedAccepted) correct++;
  if (item.type === "novelty" && accepted && item.coverage === "incomplete" && item.novelty !== "unresolved") noveltyOverclaims++;
  return { id: item.id, accepted, expected: item.expected, correct: accepted === expectedAccepted };
});
const decisionAccuracy = correct / fixture.cases.length;
const criticalProvenance = criticalTotal ? criticalAccepted / criticalTotal : 1;
const result = { cases: fixture.cases.length, decisionAccuracy, criticalProvenance, noveltyOverclaims, backgroundDirectAcceptances, thresholds: fixture.thresholds, rows };
console.log(JSON.stringify(result, null, 2));
if (decisionAccuracy < fixture.thresholds.decisionAccuracy || criticalProvenance < fixture.thresholds.criticalProvenance || noveltyOverclaims > fixture.thresholds.noveltyOverclaims || backgroundDirectAcceptances > fixture.thresholds.backgroundDirectAcceptances) process.exitCode = 1;
