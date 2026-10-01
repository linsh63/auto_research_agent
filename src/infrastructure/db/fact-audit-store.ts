import Database from "better-sqlite3";
import { mkdirSync,readFileSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { FactAuditSchema,FactLedgerSchema,type FactAudit,type FactLedger } from "../../domain/facts.js";
import { hashPayload } from "../../domain/research.js";
import { applyMigrationTransaction } from "./research-store.js";

interface PayloadRow{payload_json:string}
export class FactAuditStore{
  private constructor(private readonly db:Database.Database){}
  static async open(path:string):Promise<FactAuditStore>{mkdirSync(dirname(path),{recursive:true});const db=new Database(path);db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");const version=db.pragma("user_version",{simple:true}) as number;if(version<7){db.close();throw new Error("Fact audit store requires H schema version 7");}if(version>14){db.close();throw new Error(`Fact audit database ${version} is newer than supported version 14`);}if(version<9){const backupDir=resolve(dirname(path),"backups");mkdirSync(backupDir,{recursive:true});await db.backup(resolve(backupDir,`research-before-008-${new Date().toISOString().replaceAll(":","-")}.db`));if(version<8)applyMigrationTransaction(db,readFileSync(resolve("migrations/007_reliability_foundations.sql"),"utf8"));applyMigrationTransaction(db,readFileSync(resolve("migrations/008_enforced_reliability_gates.sql"),"utf8"));}return new FactAuditStore(db);}
  close():void{this.db.close();}
  addLedger(ledger:FactLedger):FactLedger{const value=FactLedgerSchema.parse(ledger),expected=hashPayload({programId:value.programId,studyId:value.studyId,facts:value.facts,requiredFactIds:value.requiredFactIds});if(value.contentHash!==expected)throw new Error("Fact ledger content hash does not match its canonical facts");this.db.prepare("INSERT INTO fact_ledgers(id,program_id,study_id,payload_json,content_hash,created_at) VALUES(?,?,?,?,?,?)").run(value.id,value.programId,value.studyId,JSON.stringify(value),value.contentHash,value.createdAt);return value;}
  getLedger(id:string):FactLedger{const row=this.db.prepare("SELECT payload_json FROM fact_ledgers WHERE id=?").get(id) as PayloadRow|undefined;if(!row)throw new Error(`Unknown fact ledger ${id}`);return FactLedgerSchema.parse(JSON.parse(row.payload_json));}
  addAudit(audit:FactAudit):FactAudit{const value=FactAuditSchema.parse(audit);if(!this.db.prepare("SELECT 1 ok FROM fact_ledgers WHERE id=?").get(value.ledgerId))throw new Error("Fact audit requires a stored ledger");this.db.prepare("INSERT INTO fact_audits(id,ledger_id,stage,status,payload_json,created_at) VALUES(?,?,?,?,?,?)").run(value.id,value.ledgerId,value.stage,value.status,JSON.stringify(value),value.createdAt);return value;}
  audits(ledgerId:string):FactAudit[]{return(this.db.prepare("SELECT payload_json FROM fact_audits WHERE ledger_id=? ORDER BY created_at").all(ledgerId) as PayloadRow[]).map(row=>FactAuditSchema.parse(JSON.parse(row.payload_json)));}
}
