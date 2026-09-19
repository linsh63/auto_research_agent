import { z } from "zod";

export const MemoryItemSchema = z.object({
  id: z.string().min(1), type: z.enum(["source", "passage", "claim", "experiment", "decision", "procedure", "hypothesis"]),
  namespace: z.string().min(1), status: z.enum(["candidate", "reviewed", "verified", "superseded", "retracted", "archived"]),
  content: z.string().min(1), sourceRunId: z.string().nullable().default(null),
  evidenceIds: z.array(z.string()).default([]), applicability: z.string().default(""),
  invalidationCondition: z.string().nullable().default(null), revalidateAfter: z.string().nullable().default(null),
  contentHash: z.string().min(1), createdAt: z.string(), updatedAt: z.string(),
});
export const MemoryRelationSchema = z.object({
  sourceId: z.string(), targetId: z.string(), relation: z.enum(["supports", "refutes", "supersedes", "possible_duplicate", "derived_from"]),
  note: z.string().default(""), createdAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemoryRelation = z.infer<typeof MemoryRelationSchema>;
