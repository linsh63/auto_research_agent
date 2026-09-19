import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface StoredArtifact { hash: string; path: string; bytes: number; createdAt: string; }

export class ContentAddressedStore {
  constructor(readonly root: string) { mkdirSync(root, { recursive: true }); }

  put(content: Buffer | string): StoredArtifact {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const path = this.pathFor(hash);
    mkdirSync(dirname(path), { recursive: true });
    if (!exists(path)) {
      const tmp = `${path}.${process.pid}.${Date.now()}.part`;
      writeFileSync(tmp, buffer, { flag: "wx" });
      renameSync(tmp, path);
    }
    return { hash, path, bytes: statSync(path).size, createdAt: new Date().toISOString() };
  }

  get(hash: string): Buffer { return readFileSync(this.pathFor(hash)); }
  has(hash: string): boolean { return exists(this.pathFor(hash)); }
  pathFor(hash: string): string { return join(this.root, "sha256", hash.slice(0, 2), hash.slice(2, 4), hash); }
}

function exists(path: string): boolean {
  try { statSync(path); return true; } catch { return false; }
}
