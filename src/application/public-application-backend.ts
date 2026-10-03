import { WorkflowCoordinator } from "./workflow-coordinator.js";
import { dirname,resolve } from "node:path";
import { EvidenceSynthesisStore } from "../infrastructure/db/evidence-synthesis-store.js";
import { InteractionStore } from "../infrastructure/db/interaction-store.js";
import { JobStore } from "../infrastructure/db/job-store.js";
import { PluginStore } from "../infrastructure/db/plugin-store.js";
import { ServiceAuditStore } from "../infrastructure/db/service-audit-store.js";
import { BundleStore } from "../infrastructure/db/bundle-store.js";
import { EvidenceStore } from "../infrastructure/db/evidence-store.js";
import { MemoryStore } from "../infrastructure/db/memory-store.js";
import { SearchStore } from "../infrastructure/db/search-store.js";
import { ProjectStore } from "../infrastructure/db/project-store.js";
import { ResearchStore } from "../infrastructure/db/research-store.js";
import { ScientificDecisionStore } from "../infrastructure/db/scientific-decision-store.js";
import { StudyStore } from "../infrastructure/db/study-store.js";
import { LocalJobWorker, type LocalJobWorkerOptions } from "../runtime/local-job-worker.js";
import type { WorkerDescriptor } from "../domain/job.js";
import { PublicScientificCapabilities } from "./public-scientific-capabilities.js";
import { PublicSshManager } from "./public-ssh-manager.js";

/** Transitional backend hidden behind the v1.5 public facade. */
export class PublicApplicationBackend{
  readonly workflow:WorkflowCoordinator;
  private constructor(readonly research:ResearchStore,readonly projects:ProjectStore,readonly interactions:InteractionStore,readonly jobs:JobStore,readonly plugins:PluginStore,readonly bundles:BundleStore,readonly capabilities:PublicScientificCapabilities,readonly ssh:PublicSshManager){this.workflow=new WorkflowCoordinator(research);}
  static async open(path:string,options:{maxDerivedRuns?:number;artifactRoots?:string[];artifactRoot?:string;sshStateDir?:string}={}):Promise<PublicApplicationBackend>{
    // Existing stores own earlier migrations. Stores apply schemas 11–16 in order.
    const researchBootstrap=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});researchBootstrap.close();
    const evidence=await EvidenceSynthesisStore.open(path);evidence.close();
    const studies=await StudyStore.open(path);studies.close();
    const decisions=await ScientificDecisionStore.open(path);decisions.close();
    const projects=await ProjectStore.open(path);let interactions:InteractionStore|undefined,jobs:JobStore|undefined,plugins:PluginStore|undefined,bundles:BundleStore|undefined,capabilities:PublicScientificCapabilities|undefined,ssh:PublicSshManager|undefined;
    try{interactions=await InteractionStore.open(path);jobs=await JobStore.open(path);plugins=await PluginStore.open(path);const serviceAudit=await ServiceAuditStore.open(path);serviceAudit.close();const evidence=new EvidenceStore(path);evidence.close();const memory=new MemoryStore(path);memory.close();const search=new SearchStore(path);search.close();bundles=await BundleStore.open(path,{artifactRoots:options.artifactRoots,artifactRoot:options.artifactRoot});ssh=await PublicSshManager.open(path,options.sshStateDir??resolve(dirname(path),"ssh"));capabilities=await PublicScientificCapabilities.open(path);const research=await ResearchStore.open(path,{maxDerivedRuns:options.maxDerivedRuns});return new PublicApplicationBackend(research,projects,interactions,jobs,plugins,bundles,capabilities,ssh);}catch(error){ssh?.close();capabilities?.close();bundles?.close();plugins?.close();jobs?.close();interactions?.close();projects.close();throw error;}
  }
  createLocalWorker(descriptor:WorkerDescriptor,options:LocalJobWorkerOptions):LocalJobWorker{return new LocalJobWorker(this.jobs,descriptor,options);}
  close():void{this.ssh.close();this.capabilities.close();this.bundles.close();this.plugins.close();this.jobs.close();this.interactions.close();this.projects.close();this.research.close();}
}
