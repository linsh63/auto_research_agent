import { WorkflowCoordinator } from "./workflow-coordinator.js";
import { EvidenceSynthesisStore } from "../infrastructure/db/evidence-synthesis-store.js";
import { InteractionStore } from "../infrastructure/db/interaction-store.js";
import { JobStore } from "../infrastructure/db/job-store.js";
import { ProjectStore } from "../infrastructure/db/project-store.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import { ScientificDecisionStore } from "../infrastructure/db/scientific-decision-store.js";
import { StudyStore } from "../infrastructure/db/study-store.js";
import { LocalJobWorker, type LocalJobWorkerOptions } from "../runtime/local-job-worker.js";
import type { WorkerDescriptor } from "../domain/job.js";

/** Transitional backend hidden behind the v1.5 public facade. */
export class PublicApplicationBackend{
  readonly workflow:WorkflowCoordinator;
  private constructor(readonly research:ResearchStore,readonly projects:ProjectStore,readonly interactions:InteractionStore,readonly jobs:JobStore){this.workflow=new WorkflowCoordinator(research);}
  static async open(path:string,options:{maxDerivedRuns?:number}={}):Promise<PublicApplicationBackend>{
    // Existing stores own earlier migrations. ProjectStore, InteractionStore and JobStore apply schemas 11–13 in order.
    const researchBootstrap=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});researchBootstrap.close();
    const evidence=await EvidenceSynthesisStore.open(path);evidence.close();
    const studies=await StudyStore.open(path);studies.close();
    const decisions=await ScientificDecisionStore.open(path);decisions.close();
    const projects=await ProjectStore.open(path);let interactions:InteractionStore|undefined,jobs:JobStore|undefined;
    try{interactions=await InteractionStore.open(path);jobs=await JobStore.open(path);const research=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});return new PublicApplicationBackend(research,projects,interactions,jobs);}catch(error){jobs?.close();interactions?.close();projects.close();throw error;}
  }
  createLocalWorker(descriptor:WorkerDescriptor,options:LocalJobWorkerOptions):LocalJobWorker{return new LocalJobWorker(this.jobs,descriptor,options);}
  close():void{this.jobs.close();this.interactions.close();this.projects.close();this.research.close();}
}
