#!/usr/bin/env python3
import json
import re
from pathlib import Path

root=Path(__file__).resolve().parents[1]
runner=root/"scripts/run_t3_capability_benchmark.ts"
text=runner.read_text()
issues=[]
for forbidden in ("src/infrastructure","src/application","src/domain","migrations/","better-sqlite3"):
    if forbidden in text: issues.append({"file":str(runner.relative_to(root)),"forbidden":forbidden})
imports=re.findall(r'from\s+["\']([^"\']+)["\']',text)
allowed={"node:crypto","node:child_process","node:fs","node:path","node:os","auto-research-agent/client","auto-research-agent/contracts","auto-research-agent/server"}
for value in imports:
    if value not in allowed: issues.append({"file":str(runner.relative_to(root)),"import":value})
fixtures=sorted((root/"benchmarks/research-capability-v1/fixtures").glob("*.json"))
if len(fixtures)!=24: issues.append({"fixtureCount":len(fixtures),"expected":24})
if issues:
    print(json.dumps({"status":"fail","issues":issues},indent=2));raise SystemExit(1)
print(json.dumps({"status":"pass","runnerImports":imports,"fixtures":len(fixtures)}))
