#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FORBIDDEN=("src/infrastructure","src/application","src/domain","migrations/","infrastructure.db","application.","domain.")
issues=[]
for base in (ROOT/"examples/scenarios",ROOT/"python/research_sdk"):
    for path in sorted(base.rglob("*")):
        if path.suffix not in {".ts",".py"}: continue
        text=path.read_text()
        for value in FORBIDDEN:
            if value in text: issues.append({"file":str(path.relative_to(ROOT)),"forbidden":value})
for path in sorted((ROOT/"examples/scenarios").rglob("*.ts")):
    for specifier in re.findall(r'from\s+["\']([^"\']+)["\']',path.read_text()):
        if specifier!="auto-research-agent/scenario": issues.append({"file":str(path.relative_to(ROOT)),"import":specifier})
if issues:
    print(json.dumps({"status":"fail","issues":issues},indent=2));raise SystemExit(1)
print(json.dumps({"status":"pass","scenarioFiles":len(list((ROOT/'examples/scenarios').rglob('scenario.*')))}))
