import { z } from "zod";

export const IdentifierSchema = z.object({
  scheme: z.enum(["doi", "arxiv", "openalex", "semantic_scholar", "pmid", "pmcid", "url", "other"]),
  value: z.string().min(1),
  isCanonical: z.boolean().default(false),
  source: z.string().min(1),
});

export const SourceRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  year: z.number().int().nullable().default(null),
  abstract: z.string().default(""),
  identifiers: z.array(IdentifierSchema).default([]),
  sourceUrl: z.url(),
  accessUrl: z.url().nullable().default(null),
  accessStatus: z.enum(["open", "user_provided", "metadata_only", "restricted", "unknown"]).default("unknown"),
  license: z.string().nullable().default(null),
  origin: z.string().min(1),
  accessedAt: z.string(),
});

export const DocumentVersionSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  contentType: z.enum(["html", "xml", "pdf", "text", "json"]).default("text"),
  parser: z.string().min(1),
  parserVersion: z.string().min(1),
  parserConfigHash: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["retrieved", "parsed", "failed", "metadata_only"]),
  warning: z.string().nullable().default(null),
  createdAt: z.string(),
});

export const PassageSchema = z.object({
  id: z.string().min(1),
  documentVersionId: z.string().min(1),
  parentId: z.string().nullable().default(null),
  kind: z.enum(["title", "abstract", "paragraph", "table", "figure_caption", "formula_note", "reference", "other"]),
  sectionPath: z.array(z.string()).default([]),
  text: z.string().min(1),
  pageStart: z.number().int().nullable().default(null),
  pageEnd: z.number().int().nullable().default(null),
  charStart: z.number().int().nullable().default(null),
  charEnd: z.number().int().nullable().default(null),
  locatorHash: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
});

export const ClaimSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1).nullable().default(null),
  kind: z.enum(["fact", "inference", "hypothesis", "background", "result"]),
  text: z.string().min(1),
  status: z.enum(["candidate", "reviewed", "verified", "retracted", "archived"]).default("candidate"),
  createdAt: z.string(),
});

export const ClaimEvidenceSchema = z.object({
  claimId: z.string().min(1),
  passageId: z.string().min(1).nullable().default(null),
  experimentRunId: z.string().nullable().default(null),
  relation: z.enum(["supports", "refutes", "background", "uncertain"]),
  note: z.string().default(""),
  createdAt: z.string(),
});

export type Identifier = z.infer<typeof IdentifierSchema>;
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type Passage = z.infer<typeof PassageSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ClaimEvidence = z.infer<typeof ClaimEvidenceSchema>;

export function claimEvidenceRequirement(kind: Claim["kind"]): { minPassages: number; allowExperiment: boolean } {
  if (kind === "hypothesis") return { minPassages: 0, allowExperiment: true };
  if (kind === "inference") return { minPassages: 2, allowExperiment: true };
  return { minPassages: 1, allowExperiment: true };
}

export interface CanonicalDocument {
  source: SourceRecord;
  version: DocumentVersion;
  passages: Passage[];
  references: Array<{ title: string; doi?: string; locator?: string }>;
  quality: { warnings: string[]; parserConfidence: number | null };
}
