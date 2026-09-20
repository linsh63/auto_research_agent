import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CapabilityManifestSchema, type CapabilityManifest } from "../domain/evidence-synthesis.js";

export type SkillMode = "method" | "script" | "mixed";
export interface SkillSpec {
  name: string;
  mode: SkillMode;
  stages: string[];
}

export const SKILLS: SkillSpec[] = [
  { name: "anysearch", mode: "script", stages: ["evidence"] },
  { name: "paper-search", mode: "script", stages: ["evidence"] },
  { name: "grill-me", mode: "method", stages: ["intake"] },
  { name: "grilling", mode: "method", stages: ["intake"] },
  { name: "scientific-brainstorming", mode: "mixed", stages: ["hypothesis"] },
  { name: "research-ideation", mode: "method", stages: ["hypothesis"] },
  { name: "idea-spark", mode: "mixed", stages: ["hypothesis"] },
  { name: "scoop-check", mode: "mixed", stages: ["hypothesis"] },
  { name: "hypothesis-generation", mode: "mixed", stages: ["hypothesis"] },
  { name: "experimental-design", mode: "mixed", stages: ["plan"] },
  { name: "statistical-analysis", mode: "mixed", stages: ["analysis"] },
  { name: "scientific-critical-thinking", mode: "method", stages: ["analysis", "review"] },
  { name: "scientific-writing", mode: "mixed", stages: ["report"] },
  { name: "peer-review", mode: "mixed", stages: ["review"] },
];

export class SkillCatalog {
  constructor(readonly root = process.env.AUTO_RESEARCH_SKILL_ROOT ?? join(homedir(), ".codex", "skills")) {}

  list(): Array<SkillSpec & { available: boolean; sha256?: string; path: string }> {
    return SKILLS.map((skill) => {
      const path = join(this.root, skill.name, "SKILL.md");
      if (!existsSync(path)) return { ...skill, available: false, path };
      const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      return { ...skill, available: true, sha256, path };
    });
  }

  instructions(stage: string, maxChars = 18000): { text: string; used: Array<{ name: string; sha256: string }> } {
    const candidates = this.list().filter((s) => s.available && s.stages.includes(stage) && s.mode !== "script");
    const used: Array<{ name: string; sha256: string }> = [];
    let text = "";
    for (const skill of candidates) {
      const original = readFileSync(skill.path, "utf8");
      const budget = Math.min(3500, maxChars - text.length);
      if (budget < 400) break;
      text += `\n\n## Skill: ${skill.name} (excerpt)\n${original.slice(0, budget)}`;
      used.push({ name: skill.name, sha256: skill.sha256! });
    }
    return { text, used };
  }

  capabilityManifests(): CapabilityManifest[] {
    const useCaseForStage: Record<string, string> = { intake: "scope-question", evidence: "build-evidence-map", hypothesis: "generate-hypothesis-set", plan: "draft-protocol", analysis: "analyze-results", review: "review-claims", report: "write-report" };
    return this.list().filter((skill) => skill.available).map((skill) => CapabilityManifestSchema.parse({
      name: skill.name,
      versionHash: skill.sha256!,
      mode: skill.mode,
      supportedUseCases: [...new Set(skill.stages.map((stage) => useCaseForStage[stage] ?? stage))],
      inputSchema: { type: "object", additionalProperties: true },
      outputSchema: { type: "object", additionalProperties: true },
      tools: skill.mode === "method" ? [] : [skill.name],
      sideEffects: skill.mode === "method" ? ["none"] : ["process", "filesystem_read", ...(skill.name === "anysearch" || skill.name === "paper-search" ? ["network" as const] : [])],
      requiredEvidence: skill.stages.includes("hypothesis") ? ["frozen EvidenceMap"] : [],
      budget: { maxCalls: 1, maxWallSeconds: skill.mode === "method" ? 120 : 300 },
      failureSemantics: skill.name === "paper-search" ? "fail_closed" : "degrade",
    }));
  }

  selectCapabilities(useCase: string): CapabilityManifest[] {
    return this.capabilityManifests().filter((manifest) => manifest.supportedUseCases.includes(useCase));
  }
}
