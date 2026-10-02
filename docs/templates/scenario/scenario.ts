import type { ResearchScenario } from "auto-research-agent/scenario";
import { ScenarioManifestSchema } from "auto-research-agent/scenario";
import manifestJson from "./manifest.json" with { type: "json" };

const manifest=ScenarioManifestSchema.parse(manifestJson);
export const scenario:ResearchScenario={
  manifest,
  data:{async describe(){throw new Error("Implement locked roles and experimental units");}},
  experiments:{async createJob(){throw new Error("Return a public bounded JobSpec");}},
  evaluator:{async evaluate(){throw new Error("Return one record per declared unit");}},
  analyzer:{async analyze(){throw new Error("Return estimand, method and sensitivity");}},
};
