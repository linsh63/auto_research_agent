import { WorkflowCoordinator } from "./workflow-coordinator.js";
import { EvidenceSynthesisStore } from "../infrastructure/db/evidence-synthesis-store.js";
import { InteractionStore } from "../infrastructure/db/interaction-store.js";
import { ProjectStore } from "../infrastructure/db/project-store.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import { ScientificDecisionStore } from "../infrastructure/db/scientific-decision-store.js";
import { StudyStore } from "../infrastructure/db/study-store.js";

/** Transitional backend hidden behind the v1.5 public facade. */
export class PublicApplicationBackend{
  readonly workflow:WorkflowCoordinator;
  private constructor(readonly research:ResearchStore,readonly projects:ProjectStore,readonly interactions:InteractionStore){this.workflow=new WorkflowCoordinator(research);}
  static async open(path:string,options:{maxDerivedRuns?:number}={}):Promise<PublicApplicationBackend>{
    // Existing stores own earlier migrations. ProjectStore applies schema 11, then InteractionStore applies schema 12.
    const researchBootstrap=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});researchBootstrap.close();
    const evidence=await EvidenceSynthesisStore.open(path);evidence.close();
    const studies=await StudyStore.open(path);studies.close();
    const decisions=await ScientificDecisionStore.open(path);decisions.close();
    const projects=await ProjectStore.open(path);let interactions:InteractionStore|undefined;
    try{interactions=await InteractionStore.open(path);const research=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});return new PublicApplicationBackend(research,projects,interactions);}catch(error){interactions?.close();projects.close();throw error;}
  }
  close():void{this.interactions.close();this.projects.close();this.research.close();}
}
