import type { CanonicalDocument, SourceRecord } from "../domain/evidence.js";

export interface RetrievalQuery { query: string; startYear?: number; endYear?: number; namespace?: string; limit?: number; }
export interface RetrievalHit { source: SourceRecord; passageId?: string; text?: string; score?: number; locator?: string; provenance: string[]; }
export interface RetrievalPort {
  health(): Promise<Record<string, unknown>>;
  searchMetadata(query: RetrievalQuery): Promise<RetrievalHit[]>;
  searchPassages(query: RetrievalQuery): Promise<RetrievalHit[]>;
  ingest(document: CanonicalDocument, idempotencyKey: string): Promise<{ versionId: string; passageCount: number }>;
}
