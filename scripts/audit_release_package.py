#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

root=Path(__file__).resolve().parents[1]
completed=subprocess.run(["npm","pack","--dry-run","--json","--ignore-scripts"],cwd=root,text=True,capture_output=True,check=True)
try: payload=json.loads(completed.stdout)
except json.JSONDecodeError:
    payload=json.loads(completed.stdout[completed.stdout.find("["):])
files=[item["path"] for item in payload[0]["files"]]
required={"package.json","README.md","LICENSE","NOTICE","THIRD_PARTY_NOTICES.md","dist/public/index.js","dist/public/index.d.ts","dist/public/ssh.js","dist/application/public-scientific-capabilities.js","dist/application/public-baseline-release.js","dist/application/public-ssh-manager.js","dist/runtime/ssh-remote-worker.js","dist/runtime/ssh-remote-job-worker.js","dist/runtime/remote-data-alias-registry.js","remote/worker-stdio.mjs","migrations/003_research_protocol.sql","migrations/016_ssh_remote_workers.sql","schemas/public/v1/manifest.json","python/research_sdk/__init__.py","python/worker/runner.py"}
forbidden=[]
for name in files:
    parts=Path(name).parts
    if parts and parts[0] in {"src","tests","scripts","examples","benchmarks","node_modules",".research-data"}: forbidden.append(name)
    if name.endswith((".db",".sqlite",".sqlite3",".pem",".key",".env",".pt",".pth",".safetensors",".bin")): forbidden.append(name)
missing=sorted(required-set(files))
result={"status":"pass" if not missing and not forbidden else "fail","entryCount":len(files),"unpackedSize":payload[0]["unpackedSize"],"missing":missing,"forbidden":forbidden}
print(json.dumps(result))
if result["status"]!="pass":raise SystemExit(1)
