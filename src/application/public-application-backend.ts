import { WorkflowCoordinator } from "./workflow-coordinator.js";
import { EvidenceSynthesisStore } from "../infrastructure/db/evidence-synthesis-store.js";
import { ProjectStore } from "../infrastructure/db/project-store.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import { ScientificDecisionStore } from "../infrastructure/db/scientific-decision-store.js";
import { StudyStore } from "../infrastructure/db/study-store.js";

/** Transitional backend hidden behind the v1.5 public facade. */
export class PublicApplicationBackend{
  readonly workflow:WorkflowCoordinator;
  private constructor(readonly research:ResearchStore,readonly projects:ProjectStore){this.workflow=new WorkflowCoordinator(research);}
  static async open(path:string,options:{maxDerivedRuns?:number}={}):Promise<PublicApplicationBackend>{
    // Existing stores own earlier migrations. Open them in order once, then let ProjectStore apply schema 11.
    const researchBootstrap=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});researchBootstrap.close();
    const evidence=await EvidenceSynthesisStore.open(path);evidence.close();
    const studies=await StudyStore.open(path);studies.close();
    const decisions=await ScientificDecisionStore.open(path);decisions.close();
    const projects=await ProjectStore.open(path);try{const research=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});return new PublicApplicationBackend(research,projects);}catch(error){projects.close();throw error;}
  }
  close():void{this.projects.close();this.research.close();}
}
