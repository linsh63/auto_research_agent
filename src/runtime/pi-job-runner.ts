import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { JobLease } from "../domain/job.js";

export interface PiJobRunResult{sessionFile:string|null;messageCount:number}
export interface PiJobSessionFactory{(lease:JobLease):Promise<AgentSession>}

/** Reuses Pi's persisted session, event stream and abort lifecycle behind the Job executor contract. */
export class PiJobRunner{
  constructor(private readonly createSession:PiJobSessionFactory){}
  async run(lease:JobLease,signal:AbortSignal,emit:(stream:"stdout"|"stderr"|"progress",message:string,data?:unknown)=>void):Promise<PiJobRunResult>{
    if(lease.job.spec.execution.kind!=="pi")throw new Error("PiJobRunner requires a pi execution spec");
    const session=await this.createSession(lease),onAbort=()=>void session.abort(),unsubscribe=session.subscribe(event=>this.forward(event,emit));signal.addEventListener("abort",onAbort,{once:true});
    try{if(signal.aborted)await session.abort();else await session.prompt(lease.job.spec.execution.prompt);await session.waitForIdle();if(signal.aborted)throw new Error("Pi job was cancelled");return{sessionFile:session.sessionFile??null,messageCount:session.messages.length};}
    finally{signal.removeEventListener("abort",onAbort);unsubscribe();session.dispose();}
  }
  private forward(event:AgentSessionEvent,emit:(stream:"stdout"|"stderr"|"progress",message:string,data?:unknown)=>void):void{
    if(event.type==="message_update"&&event.assistantMessageEvent.type==="text_delta")emit("stdout",event.assistantMessageEvent.delta,{piEvent:event.type});
    else if(event.type==="tool_execution_start")emit("progress",`Pi tool started: ${event.toolName}`,{piEvent:event.type,toolName:event.toolName});
    else if(event.type==="tool_execution_end")emit(event.isError?"stderr":"progress",`Pi tool ${event.isError?"failed":"completed"}: ${event.toolName}`,{piEvent:event.type,toolName:event.toolName,isError:event.isError});
    else if(["agent_start","agent_end","agent_settled","auto_retry_start","auto_retry_end"].includes(event.type))emit("progress",`Pi event: ${event.type}`,{piEvent:event.type});
  }
}
