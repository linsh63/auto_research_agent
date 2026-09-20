import type { ResearchProfile, ResearchProtocol, ResearchQuestion, ResearchProgram, ProtocolDeviation, ProtocolFreeze, Approval, Assumption, RunDerivation, VisibilityEvent } from "../domain/research.js";
import { ResearchStore, type ProtocolDraft, type QuestionDraft, type ResearchStatus } from "../infrastructure/db/research-store.js";

export class WorkflowCoordinator {
  constructor(readonly store: ResearchStore) {}

  createIntent(input: unknown): ResearchProgram { return this.store.createProgram(input); }
  proposeQuestion(programId: string, input: QuestionDraft): ResearchQuestion { return this.store.addQuestion(programId, input); }
  selectQuestion(programId: string, questionId: string): ResearchQuestion { return this.store.selectQuestion(programId, questionId); }
  approveScope(programId: string, actor = "researcher", note = ""): Approval { return this.store.approveScope(programId, actor, note); }
  draftProtocol(programId: string, input: ProtocolDraft): ResearchProtocol { return this.store.addProtocol(programId, input); }
  approveProtocol(programId: string, protocolId: string, actor = "researcher", note = ""): Approval { return this.store.approveProtocol(programId, protocolId, actor, note); }
  freezeProtocol(programId: string, protocolId: string, actor = "researcher"): ProtocolFreeze { return this.store.freezeProtocol(programId, protocolId, actor); }
  addAssumption(questionId: string, input: Omit<Assumption, "id" | "questionId" | "createdAt">): Assumption { return this.store.addAssumption(questionId, input); }
  recordDeviation(programId: string, input: Omit<ProtocolDeviation, "id" | "protocolId" | "createdAt">): ProtocolDeviation { return this.store.recordDeviation(programId, input); }
  recordVisibility(input: Omit<VisibilityEvent, "id" | "observedAt">): VisibilityEvent { return this.store.recordVisibility(input); }
  assertExplorationAllowed(programId: string): void { this.store.assertExplorationAllowed(programId); }
  derive(programId: string, reason: string, actor = "researcher", observedData: string[] = []): { program: ResearchProgram; derivation: RunDerivation } { return this.store.deriveProgram(programId, reason, actor, observedData); }
  status(programId: string): ResearchStatus { return this.store.status(programId); }
  listProfiles(): ResearchProfile[] { return ["smoke", "exploratory", "confirmatory"]; }
}
