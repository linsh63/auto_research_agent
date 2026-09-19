import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { SourceRecordSchema, DocumentVersionSchema, PassageSchema, type CanonicalDocument, type SourceRecord } from "../domain/evidence.js";
import { runProcess } from "./process.js";

export interface ParseOptions { parserOrder?: string[]; targetTokens?: number; maxTokens?: number; timeoutMs?: number; }

export async function parseTextFile(path: string, sourceInput: SourceRecord, options: ParseOptions = {}): Promise<CanonicalDocument> {
  if (!existsSync(path)) throw new Error(`Document not found: ${path}`);
  const raw = readFileSync(path);
  const source = SourceRecordSchema.parse(sourceInput);
  const contentHash = createHash("sha256").update(raw).digest("hex");
  const versionId = `doc-${source.id}-${contentHash.slice(0, 16)}`;
  const text = raw.toString("utf8").replace(/\r\n/g, "\n").trim();
  const parser = path.toLowerCase().endsWith(".pdf") ? "pdftotext-fallback" : "plain-text";
  let canonicalText = text;
  const warnings: string[] = [];
  if (parser === "pdftotext-fallback") {
    const extracted = await runProcess("pdftotext", [path, "-"], { timeoutMs: options.timeoutMs ?? 300_000, maxOutputBytes: 20_000_000 });
    if (extracted.exitCode !== 0 || extracted.timedOut) throw new Error(`pdftotext failed for ${path}: ${extracted.stderr.slice(0, 500)}`);
    canonicalText = extracted.stdout.trim();
    warnings.push("GROBID unavailable; pdftotext fallback used");
  }
  const version = DocumentVersionSchema.parse({ id: versionId, sourceId: source.id, artifactHash: contentHash,
    contentType: parser === "pdftotext-fallback" ? "pdf" : "text", parser, parserVersion: "system", parserConfigHash: "default",
    contentHash, status: canonicalText ? "parsed" : "failed", warning: warnings.join("; ") || null, createdAt: new Date().toISOString() });
  const target = options.targetTokens ?? 600;
  const max = options.maxTokens ?? 1000;
  const overlap = (options as { overlapTokens?: number }).overlapTokens ?? 80;
  const words = canonicalText.split(/\s+/).filter(Boolean);
  const passages = [];
  let cursor = 0; let ordinal = 0;
  while (cursor < words.length) {
    const chunk = words.slice(cursor, cursor + max).join(" ");
    const chunkHash = createHash("sha256").update(`${versionId}:${ordinal}:${chunk}`).digest("hex");
    passages.push(PassageSchema.parse({ id: `passage-${versionId}-${ordinal}`, documentVersionId: versionId, parentId: null,
      kind: "paragraph", sectionPath: [basename(path)], text: chunk, pageStart: null, pageEnd: null,
      charStart: null, charEnd: null, locatorHash: chunkHash, ordinal }));
    ordinal++;
    cursor += Math.max(1, target - overlap);
  }
  return { source, version, passages, references: [], quality: { warnings, parserConfidence: parser === "plain-text" ? 0.8 : 0.45 } };
}
