import { z } from "zod";
import {
  PUBLIC_SCHEMA_VERSION, PublicErrorSchema, PublicSchemaVersionSchema,
  type PublicCommand, type PublicError, type PublicErrorCode, type PublicQuery,
} from "./contracts.js";

export function assertSupportedSchema(version: unknown): asserts version is typeof PUBLIC_SCHEMA_VERSION {
  const parsed = PublicSchemaVersionSchema.safeParse(version);
  if (!parsed.success) throw new PublicKernelError("INCOMPATIBLE_VERSION", `Unsupported public schema version: ${String(version)}`, false);
}

export function assertCommandContext(command: PublicCommand): void {
  assertSupportedSchema(command.schemaVersion);
  if (command.type!=="project.create"&&command.type!=="project.import"&&!command.type.startsWith("plugin.")&&!command.projectId) throw new PublicKernelError("INVALID_COMMAND", `${command.type} requires projectId`, false);
}

export function assertQueryContext(query: PublicQuery): void {
  assertSupportedSchema(query.schemaVersion);
  if (!query.type.startsWith("plugin.")&&!query.projectId) throw new PublicKernelError("INVALID_COMMAND", `${query.type} requires projectId`, false);
}

export class PublicKernelError extends Error {
  constructor(readonly code: PublicErrorCode, message: string, readonly retryable: boolean, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PublicKernelError";
  }
  toPublicError(): PublicError { return PublicErrorSchema.parse({ code: this.code, message: this.message, retryable: this.retryable, details: this.details }); }
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof PublicKernelError) return error.toPublicError();
  if (error instanceof z.ZodError) return PublicErrorSchema.parse({ code: "INVALID_COMMAND", message: "Input does not match the public contract", retryable: false, details: { issues: error.issues } });
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  let code: PublicErrorCode = "INTERNAL";
  if (/does not belong|forbidden|permission denied/.test(lower)) code = "FORBIDDEN";
  else if (/incompatible|does not satisfy/.test(lower)) code = "INCOMPATIBLE_VERSION";
  else if (/unknown|not found/.test(lower)) code = "NOT_FOUND";
  else if (/mismatch|conflict|already|latest|in doubt|stale|expired|changed|quarantined|unavailable/.test(lower)) code = "CONFLICT";
  else if (/require|cannot|closed|not allowed|only .* can|sealed|exceed/.test(lower)) code = "GATE_REJECTED";
  else if (/invalid|must|expected/.test(lower)) code = "INVALID_COMMAND";
  return PublicErrorSchema.parse({ code, message: code === "INTERNAL" ? "Internal research kernel error" : message, retryable: false, details: {} });
}
