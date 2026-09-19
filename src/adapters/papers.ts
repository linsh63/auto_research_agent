import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceSchema, type ResearchBrief, type Source } from "../core/schema.js";
import { runProcess } from "./process.js";

interface PaperResult {
  title?: string;
  url?: string;
  year?: number;
  authors?: string[];
  abstract?: string;
  doi?: string;
  source?: string;
  found_in?: string[];
}

export interface PaperSearchResult {
  sources: Source[];
  search: { query: string; startYear: number; endYear: number; sourceCounts: Record<string, number>; warnings: string[] };
}

export async function searchPapers(brief: ResearchBrief, skillRoot = process.env.AUTO_RESEARCH_SKILL_ROOT ?? join(homedir(), ".codex", "skills")): Promise<PaperSearchResult> {
  const now = new Date().toISOString();
  const year = new Date().getUTCFullYear();
  const query = brief.keywords.join(" ");
  const startYear = brief.startYear ?? year - 3;
  const endYear = brief.endYear ?? year;
  const paperSkill = join(skillRoot, "paper-search");
  const python = join(paperSkill, ".venv", "bin", "python");
  const scriptDir = join(paperSkill, "scripts");
  const bridge = fileURLToPath(new URL("../../scripts/paper_search_bridge.py", import.meta.url));
  const warnings: string[] = [];
  let papers: PaperResult[] = [];
  let sourceCounts: Record<string, number> = {};
  if (existsSync(python) && existsSync(join(scriptDir, "search_papers.py"))) {
    try {
      const result = await runProcess(python, [bridge, scriptDir], {
        stdin: JSON.stringify({ query, startYear, endYear, maxPapers: 4, maxTotal: 12 }),
        timeoutMs: 90_000,
        env: { ...process.env, AUTO_RESEARCH_API_KEY: undefined },
      });
      if (result.timedOut || result.exitCode !== 0) {
        warnings.push(`paper-search failed: ${result.stderr.trim().slice(0, 500) || `exit ${result.exitCode}`}`);
      } else {
        const payload = JSON.parse(result.stdout) as { papers?: PaperResult[]; sourceCounts?: Record<string, number> };
        papers = Array.isArray(payload.papers) ? payload.papers : [];
        sourceCounts = payload.sourceCounts ?? {};
        if (result.stderr.trim()) warnings.push(result.stderr.trim().slice(0, 500));
      }
    } catch (error) {
      warnings.push(`paper-search unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else warnings.push("paper-search runtime is not installed");

  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const seed of brief.seedSources) {
    const url = new URL(seed.url).toString();
    const key = (seed.doi || url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(SourceSchema.parse({ ...seed, id: `source-${sources.length + 1}`, url, accessedAt: now }));
  }
  for (const paper of papers) {
    if (!paper.title || !paper.url) continue;
    let url: string;
    try { url = new URL(paper.url).toString(); } catch { continue; }
    const key = (paper.doi || url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(SourceSchema.parse({
      id: `source-${sources.length + 1}`, title: paper.title, url,
      year: typeof paper.year === "number" ? paper.year : undefined,
      authors: Array.isArray(paper.authors) ? paper.authors : [],
      abstract: typeof paper.abstract === "string" ? paper.abstract : "", doi: paper.doi || undefined,
      origin: (paper.found_in ?? [paper.source ?? "paper-search"]).join(","), accessedAt: now,
    }));
  }
  for (const rawUrl of brief.sourceUrls) {
    const url = new URL(rawUrl).toString();
    if (seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    sources.push(SourceSchema.parse({ id: `source-${sources.length + 1}`, title: url, url, origin: "provided", accessedAt: now }));
  }
  return { sources, search: { query, startYear, endYear, sourceCounts, warnings } };
}
