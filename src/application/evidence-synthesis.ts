import { hashPayload, type HypothesisItem, type HypothesisSet } from "../domain/research.js";
import type { CapabilityInvocation, CapabilityManifest, EvidenceMap } from "../domain/evidence-synthesis.js";
import { SkillCatalog } from "../adapters/skills.js";
import { EvidenceSynthesisStore } from "../infrastructure/db/evidence-synthesis-store.js";
import { ResearchStore, type HypothesisSetDraft } from "../infrastructure/db/research-store.js";

export class EvidenceSynthesisService {
  constructor(readonly store: EvidenceSynthesisStore, readonly research: ResearchStore, readonly skills = new SkillCatalog()) {}

  registerCapabilities(useCase: "build-evidence-map" | "generate-hypothesis-set"): CapabilityManifest[] {
    const manifests = this.skills.selectCapabilities(useCase);
    for (const manifest of manifests) this.store.registerCapability(manifest);
    return manifests;
  }

  startCapability(programId: string, capability: CapabilityManifest, useCase: string, input: unknown, selectedReason: string, rejectedAlternatives: string[] = []): CapabilityInvocation {
    this.store.registerCapability(capability);
    return this.store.startInvocation({ programId, capabilityName: capability.name, manifestHash: capability.versionHash, useCase, inputHash: hashPayload(input), selectedReason, rejectedAlternatives });
  }

  finishCapability(id: string, output: unknown): CapabilityInvocation {
    return this.store.finishInvocation(id, "succeeded", hashPayload(output));
  }

  failCapability(id: string, error: string): CapabilityInvocation {
    return this.store.finishInvocation(id, "failed", null, error);
  }

  createEvidenceBoundHypothesisSet(programId: string, evidenceMapId: string, input: HypothesisSetDraft): HypothesisSet {
    const map: EvidenceMap = this.store.getEvidenceMap(evidenceMapId);
    if (map.programId !== programId || map.status !== "frozen") throw new Error("Hypothesis generation requires this program's frozen EvidenceMap");
    const entries = this.store.entries(evidenceMapId);
    const allowed = new Set(entries.flatMap((entry) => [entry.id, entry.claimId, entry.passageId].filter((value): value is string => Boolean(value))));
    for (const item of input.hypotheses as Array<Omit<HypothesisItem, "id">>) {
      if ((item.kind === "target" || item.kind === "rival") && item.evidenceIds.length === 0) throw new Error(`${item.kind} hypothesis requires evidence-map provenance`);
      if (item.evidenceIds.some((id) => !allowed.has(id))) throw new Error(`Hypothesis evidence ${item.evidenceIds.find((id) => !allowed.has(id))} is outside the frozen EvidenceMap`);
    }
    return this.research.createHypothesisSet(programId, { ...input, evidenceMapId });
  }
}
