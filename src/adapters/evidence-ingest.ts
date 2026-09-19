import { createHash } from "node:crypto";
import type { Source } from "../core/schema.js";
import { DocumentVersionSchema, PassageSchema, SourceRecordSchema } from "../domain/evidence.js";
import { EvidenceStore } from "../infrastructure/db/evidence-store.js";

export function ingestSources(store: EvidenceStore, sources: Source[]): { sources: number; passages: number } {
  let passageCount = 0;
  for (const source of sources) {
    const sourceRecord = SourceRecordSchema.parse({
      id: source.id, title: source.title, authors: source.authors, year: source.year ?? null,
      abstract: source.abstract, identifiers: source.doi ? [{ scheme: "doi", value: source.doi, isCanonical: true, source: source.origin }] : [],
      sourceUrl: source.url, accessUrl: source.url, accessStatus: "metadata_only", origin: source.origin,
      accessedAt: source.accessedAt,
    });
    store.upsertSource(sourceRecord);
    const abstract = source.abstract.trim();
    const contentHash = createHash("sha256").update(abstract || source.title).digest("hex");
    const versionId = `doc-${source.id}-${contentHash.slice(0, 16)}`;
    store.addDocumentVersion(DocumentVersionSchema.parse({
      id: versionId, sourceId: source.id, artifactHash: null, contentType: "text",
      parser: "metadata-adapter", parserVersion: "1", parserConfigHash: "metadata-only",
      contentHash, status: abstract ? "parsed" : "metadata_only", warning: abstract ? null : "abstract unavailable",
      createdAt: source.accessedAt,
    }));
    if (abstract) {
      store.addPassage(PassageSchema.parse({
        id: `passage-${versionId}-abstract`, documentVersionId: versionId, parentId: null,
        kind: "abstract", sectionPath: ["Abstract"], text: abstract,
        pageStart: null, pageEnd: null, charStart: 0, charEnd: abstract.length,
        locatorHash: createHash("sha256").update(`${versionId}:abstract:${abstract}`).digest("hex"), ordinal: 0,
      }));
      passageCount++;
    }
  }
  return { sources: sources.length, passages: passageCount };
}
