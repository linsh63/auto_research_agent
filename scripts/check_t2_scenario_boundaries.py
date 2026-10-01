#!/usr/bin/env python3
import json
import re
from pathlib import Path

root=Path(__file__).resolve().parents[1]
scenarios=[root/"examples/scenarios/mllm-routing",root/"examples/scenarios/fasttext-agnews"]
runners=[root/"scripts/run_t2a_mllm_scenario.ts",root/"scripts/run_t2b_fasttext_scenario.ts"]
issues=[]
for path in [*(path for scenario in scenarios for path in scenario.rglob("*.py")),*runners]:
    text=path.read_text()
    for forbidden in ("src/infrastructure","src/application","src/domain","migrations/","better-sqlite3"):
        if forbidden in text: issues.append({"file":str(path.relative_to(root)),"forbidden":forbidden})
allowed={"node:crypto","node:child_process","node:fs","node:path","auto-research-agent/client","auto-research-agent/contracts","auto-research-agent/scenario","auto-research-agent/server"}
all_imports={}
for runner in runners:
    imports=re.findall(r'from\s+["\']([^"\']+)["\']',runner.read_text())
    all_imports[str(runner.relative_to(root))]=imports
    for value in imports:
        if value not in allowed: issues.append({"file":str(runner.relative_to(root)),"import":value})
if issues:
    print(json.dumps({"status":"fail","issues":issues},indent=2));raise SystemExit(1)
print(json.dumps({"status":"pass","runnerImports":all_imports,"scenarioFiles":sum(len(list(scenario.rglob('*.*'))) for scenario in scenarios)}))
