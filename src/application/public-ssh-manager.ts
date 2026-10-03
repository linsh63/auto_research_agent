import { SshProfilesReadModelSchema,SshProfileReadModelSchema,ProjectSshReadModelSchema } from "../public/contracts.js";
import { SshWorkerStore } from "../infrastructure/db/ssh-worker-store.js";
import { SystemSshRemoteWorker } from "../runtime/ssh-remote-worker.js";

export class PublicSshManager{
  private constructor(readonly store:SshWorkerStore,readonly runtime:SystemSshRemoteWorker){}
  static async open(databasePath:string,stateDir:string){return new PublicSshManager(await SshWorkerStore.open(databasePath),new SystemSshRemoteWorker({stateDir}));}
  close(){this.store.close();}
  add(workspaceId:string,input:any){return this.store.addProfile(workspaceId,input);}
  update(workspaceId:string,input:any){const{profileId,...patch}=input;return this.store.updateProfile(workspaceId,profileId,patch);}
  remove(workspaceId:string,profileId:string){return this.store.removeProfile(workspaceId,profileId);}
  async probe(workspaceId:string,profileId:string){const profile=this.store.profile(workspaceId,profileId),result=await this.runtime.preflight(profile),recorded=this.store.recordPreflight(workspaceId,profileId,result,{fingerprint:result.fingerprint,hostKey:result.hostKey});if(recorded.profile.status==="quarantined")this.store.quarantine(workspaceId,profileId,"system:ssh-host-key-change");return recorded.preflight;}
  approve(workspaceId:string,profileId:string,fingerprint:string,actorId:string){const profile=this.store.profile(workspaceId,profileId);if(profile.pendingFingerprint!==fingerprint)throw new Error("SSH host fingerprint mismatch");this.runtime.approveKnownHost(profile);return this.store.approve(workspaceId,profileId,fingerprint,actorId);}
  async install(workspaceId:string,profileId:string){const profile=this.store.profile(workspaceId,profileId),installed=await this.runtime.install(profile);return this.store.addInstallation(workspaceId,profileId,{contentHash:installed.contentHash,remotePath:installed.remotePath,platform:installed.platform,gpuDevices:installed.gpuDevices});}
  setInstallation(workspaceId:string,id:string,status:"enabled"|"disabled"){return this.store.setInstallation(workspaceId,id,status);}
  attach(workspaceId:string,projectId:string,profileId:string,installationId:string){return this.store.attach(workspaceId,projectId,profileId,installationId);}
  profiles(workspaceId:string){return SshProfilesReadModelSchema.parse({profiles:this.store.profiles(workspaceId),installations:this.store.installations(workspaceId)});}
  profile(workspaceId:string,id:string){return SshProfileReadModelSchema.parse({profile:this.store.profile(workspaceId,id),installations:this.store.installations(workspaceId,id),lastPreflight:this.store.lastPreflight(workspaceId,id)});}
  project(workspaceId:string,projectId:string){return ProjectSshReadModelSchema.parse({requirements:this.store.requirements(workspaceId,projectId)});}
}
