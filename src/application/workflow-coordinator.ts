import type { ResearchProfile, ResearchProtocol, ResearchQuestion, ResearchProgram, ProtocolDeviation, ProtocolFreeze, Approval, Assumption, AssumptionRegister, HypothesisSet, RunDerivation, VisibilityEvent } from "../domain/research.js";
import { ResearchStore, type DeviationRequest, type HypothesisSetDraft, type ProtocolDraft, type QuestionDraft, type ResearchStatus } from "../infrastructure/db/research-store.js";
import type { DatasetSubstitutionRecord,DatasetSubstitutionRequest } from "../domain/data-substitution.js";

export class WorkflowCoordinator {
  constructor(readonly store: ResearchStore) {}

  createIntent(input: unknown): ResearchProgram { return this.store.createProgram(input); }
  proposeQuestion(programId: string, input: QuestionDraft): ResearchQuestion { return this.store.addQuestion(programId, input); }
  selectQuestion(programId: string, questionId: string): ResearchQuestion { return this.store.selectQuestion(programId, questionId); }
  approveScope(programId: string, actor = "researcher", note = ""): Approval { return this.store.approveScope(programId, actor, note); }
  recordDatasetSubstitution(programId:string,protocolId:string|null,input:DatasetSubstitutionRequest):DatasetSubstitutionRecord{return this.store.recordDatasetSubstitution(programId,protocolId,input);}
  draftProtocol(programId: string, input: ProtocolDraft): ResearchProtocol { return this.store.addProtocol(programId, input); }
  reviseDraftProtocol(programId: string, protocolId: string, input: ProtocolDraft): ResearchProtocol { return this.store.reviseDraftProtocol(programId, protocolId, input); }
  approveProtocol(programId: string, protocolId: string, actor = "researcher", note = ""): Approval { return this.store.approveProtocol(programId, protocolId, actor, note); }
  freezeProtocol(programId: string, protocolId: string, actor = "researcher"): ProtocolFreeze { return this.store.freezeProtocol(programId, protocolId, actor); }
  addAssumption(questionId: string, input: Omit<Assumption, "id" | "questionId" | "createdAt">): Assumption { return this.store.addAssumption(questionId, input); }
  createAssumptionRegister(questionId: string, assumptionIds: string[], parentId: string | null = null): AssumptionRegister { return this.store.createAssumptionRegister(questionId, assumptionIds, parentId); }
  freezeAssumptionRegister(questionId: string, registerId: string): AssumptionRegister { return this.store.freezeAssumptionRegister(questionId, registerId); }
  createHypothesisSet(programId: string, input: HypothesisSetDraft): HypothesisSet { return this.store.createHypothesisSet(programId, input); }
  freezeHypothesisSet(programId: string, setId: string): HypothesisSet { return this.store.freezeHypothesisSet(programId, setId); }
  recordDeviation(programId: string, input: DeviationRequest): ProtocolDeviation { return this.store.recordDeviation(programId, input); }
  approveDeviation(programId: string, deviationId: string, revisedProtocol: ProtocolDraft, actor = "researcher"): { deviation: ProtocolDeviation; protocol: ResearchProtocol } { return this.store.approveDeviation(programId, deviationId, revisedProtocol, actor); }
  rejectDeviation(programId: string, deviationId: string, actor = "researcher"): ProtocolDeviation { return this.store.rejectDeviation(programId, deviationId, actor); }
  recordVisibility(input: Omit<VisibilityEvent, "id" | "observedAt">): VisibilityEvent { return this.store.recordVisibility(input); }
  assertExplorationAllowed(programId: string): void { this.store.assertExplorationAllowed(programId); }
  derive(programId: string, reason: string, actor = "researcher", observedData: string[] = []): { program: ResearchProgram; derivation: RunDerivation } { return this.store.deriveProgram(programId, reason, actor, observedData); }
  status(programId: string): ResearchStatus { return this.store.status(programId); }
  listProfiles(): ResearchProfile[] { return ["smoke", "exploratory", "confirmatory"]; }
}
