import { createHash } from "node:crypto";
import { existsSync,mkdirSync,readFileSync,renameSync,writeFileSync } from "node:fs";
import { dirname,resolve,relative,isAbsolute } from "node:path";
import { z } from "zod";
import type { RemoteDataAlias } from "./ssh-remote-worker.js";

const AliasSchema=z.object({alias:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),manifestHash:z.string().regex(/^[a-f0-9]{64}$/),remotePath:z.string().regex(/^\/[A-Za-z0-9._/-]+$/),access:z.enum(["project","private"])}).strict();
const RegistrySchema=z.object({version:z.literal(1),aliases:z.array(AliasSchema)}).strict();

/** External deployment state. Paths and sealed-data locations are intentionally absent from Project Bundles. */
export class RemoteDataAliasRegistry{
  constructor(private readonly path:string,private readonly remoteDataRoot:string){if(!isSafeAbsolute(remoteDataRoot))throw new Error("Remote data root must be a safe absolute POSIX path");mkdirSync(dirname(path),{recursive:true});if(!existsSync(path))this.write([]);}
  list():RemoteDataAlias[]{return RegistrySchema.parse(JSON.parse(readFileSync(this.path,"utf8"))).aliases;}
  get(alias:string):RemoteDataAlias{const found=this.list().find(item=>item.alias===alias);if(!found)throw new Error(`Unknown remote data alias ${alias}`);return found;}
  register(input:RemoteDataAlias):RemoteDataAlias{const value=AliasSchema.parse(input);assertInside(this.remoteDataRoot,value.remotePath);const aliases=this.list().filter(item=>item.alias!==value.alias);aliases.push(value);this.write(aliases.sort((a,b)=>a.alias.localeCompare(b.alias)));return value;}
  remove(alias:string){this.get(alias);this.write(this.list().filter(item=>item.alias!==alias));return{alias,removed:true};}
  manifestHash(){return createHash("sha256").update(JSON.stringify(this.list())).digest("hex");}
  private write(aliases:RemoteDataAlias[]){const temporary=`${this.path}.${process.pid}.partial`;writeFileSync(temporary,JSON.stringify({version:1,aliases},null,2),{mode:0o600});renameSync(temporary,this.path);}
}
function isSafeAbsolute(value:string){return /^\/[A-Za-z0-9._/-]+$/.test(value)&&!value.split("/").includes("..");}
function assertInside(root:string,path:string){if(!isSafeAbsolute(path))throw new Error("Remote alias path is unsafe");const rel=relative(resolve(root),resolve(path));if(rel.startsWith("..")||isAbsolute(rel))throw new Error("Remote alias path escapes the configured data root");}
