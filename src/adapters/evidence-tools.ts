import { Type } from "typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { EvidenceStore } from "../infrastructure/db/evidence-store.js";
import { RetrievalWorkerClient } from "./retrieval-worker.js";

const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value });

export function createEvidenceTools(store: EvidenceStore, worker: RetrievalWorkerClient): ToolDefinition[] {
  return [
    defineTool({ name: "search_metadata", label: "Search Metadata", description: "Search indexed scholarly source metadata.", parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) }), execute: async (_id, p) => result(store.searchSources(p.query, p.limit ?? 20)) }),
    defineTool({ name: "search_passages", label: "Search Passages", description: "Search evidence passages. Keyword mode is the validated default; semantic mode uses PaperQA2.", parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()), mode: Type.Optional(Type.Union([Type.Literal("keyword"),Type.Literal("semantic")])) }), execute: async (_id, p) => {
      if ((p.mode ?? "keyword") === "keyword") return result({ backend: "sqlite-fts5", hits: store.searchPassages(p.query, p.limit ?? 20) });
      try { const response = await worker.request({ method: "search_passages", params: { query: p.query, limit: p.limit ?? 20 }, deadlineMs: 60_000 }); if (response.ok) return result(response.result); } catch { /* fallback below */ }
      return result({ backend: "sqlite-fts5-fallback", hits: store.searchPassages(p.query, p.limit ?? 20) });
    } }),
    defineTool({ name: "lookup_identifier", label: "Lookup Identifier", description: "Resolve a DOI, arXiv, OpenAlex, PMID or URL identifier.", parameters: Type.Object({ scheme: Type.String(), value: Type.String() }), execute: async (_id, p) => result(store.lookupIdentifier(p.scheme, p.value) ?? null) }),
    defineTool({ name: "expand_citations", label: "Expand Citations", description: "Return stored incoming and outgoing citation edges.", parameters: Type.Object({ sourceId: Type.String(), limit: Type.Optional(Type.Number()) }), execute: async (_id, p) => result({ sourceId: p.sourceId, citations: store.expandCitations(p.sourceId,p.limit ?? 20) }) }),
    defineTool({ name: "fetch_document", label: "Fetch Document", description: "Return recorded access information for a source; downloading is performed by an approved ingestion step.", parameters: Type.Object({ query: Type.String() }), execute: async (_id, p) => result(store.searchSources(p.query, 1)[0] ?? null) }),
    defineTool({ name: "get_passage", label: "Get Passage", description: "Read a passage by its stable evidence identifier.", parameters: Type.Object({ passageId: Type.String() }), execute: async (_id, p) => result(store.getPassage(p.passageId) ?? null) }),
    defineTool({ name: "explain_retrieval", label: "Explain Retrieval", description: "Explain the active retrieval stack and provenance requirements.", parameters: Type.Object({ query: Type.String() }), execute: async (_id, p) => result({ query: p.query, lexical: "SQLite FTS5", semantic: "PaperQA2 sparse embeddings", factSource: "SQLite evidence graph", summariesAreEvidence: false }) }),
  ];
}
