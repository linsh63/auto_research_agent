#!/usr/bin/env python3
import json
import re
from pathlib import Path

root=Path(__file__).resolve().parents[1]
scenario=root/"examples/scenarios/mllm-routing"
runner=root/"scripts/run_t2a_mllm_scenario.ts"
issues=[]
for path in [*scenario.rglob("*.py"),runner]:
    text=path.read_text()
    for forbidden in ("src/infrastructure","src/application","src/domain","migrations/","better-sqlite3"):
        if forbidden in text: issues.append({"file":str(path.relative_to(root)),"forbidden":forbidden})
imports=re.findall(r'from\s+["\']([^"\']+)["\']',runner.read_text())
allowed={"node:crypto","node:child_process","node:fs","node:path","auto-research-agent/client","auto-research-agent/contracts","auto-research-agent/scenario","auto-research-agent/server"}
for value in imports:
    if value not in allowed: issues.append({"file":str(runner.relative_to(root)),"import":value})
if issues:
    print(json.dumps({"status":"fail","issues":issues},indent=2));raise SystemExit(1)
print(json.dumps({"status":"pass","runnerImports":imports,"scenarioFiles":len(list(scenario.rglob('*.*')))}))
