#!/usr/bin/env python3
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/"src/reference-cli.ts"
text=path.read_text()
imports=re.findall(r'from\s+["\']([^"\']+)["\']',text)
allowed={"node:crypto","node:fs","node:path","./public/client.js","./public/contracts.js"}
issues=[value for value in imports if value not in allowed]
for forbidden in ("infrastructure","application/","domain/","migrations","better-sqlite3"):
    if forbidden in text: issues.append(forbidden)
if issues: print(json.dumps({"status":"fail","issues":issues},indent=2));raise SystemExit(1)
print(json.dumps({"status":"pass","imports":imports}))
