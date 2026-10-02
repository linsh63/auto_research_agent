import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Read a bundled migration relative to this package, independent of process.cwd(). */
export function readMigration(name:string):string{
  if(!/^\d{3}[a-z]?_[a-z0-9_]+\.sql$/.test(name))throw new Error(`Invalid migration name: ${name}`);
  return readFileSync(fileURLToPath(new URL(`../../../migrations/${name}`,import.meta.url)),"utf8");
}
