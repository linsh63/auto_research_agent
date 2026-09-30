#!/usr/bin/env python3
"""Fail closed when the v1.5 public boundary imports undeclared internals."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "src/public"
IMPORT = re.compile(r'(?:from\s+|import\s*)["\']([^"\']+)["\']')
FORBIDDEN_PREFIXES = ("../domain/", "../application/", "../infrastructure/", "../adapters/", "../core/")
APPLICATION_ALLOWLIST = {
    "../application/public-application-backend.js",
}
issues = []
for path in sorted(PUBLIC.glob("*.ts")):
    text = path.read_text()
    imports = IMPORT.findall(text)
    for value in imports:
        if not value.startswith(FORBIDDEN_PREFIXES):
            continue
        if path.name == "application.ts" and value in APPLICATION_ALLOWLIST:
            continue
        issues.append({"file": str(path.relative_to(ROOT)), "import": value, "reason": "undeclared internal dependency"})
    if path.name == "index.ts" and any("../" in value for value in imports):
        issues.append({"file": str(path.relative_to(ROOT)), "reason": "public index may export only public modules"})

DIST_PUBLIC = ROOT / "dist/public"
for path in sorted(DIST_PUBLIC.glob("*.d.ts")):
    for value in IMPORT.findall(path.read_text()):
        if value.startswith(("../../domain/", "../../application/", "../../infrastructure/", "../../adapters/", "../../core/", "../domain/", "../application/", "../infrastructure/", "../adapters/", "../core/")):
            issues.append({"file": str(path.relative_to(ROOT)), "import": value, "reason": "declaration leaks an internal module"})

package = json.loads((ROOT / "package.json").read_text())
exports = package.get("exports", {})
expected = {".", "./contracts", "./kernel", "./application"}
if set(exports) != expected:
    issues.append({"file": "package.json", "reason": f"public exports must be exactly {sorted(expected)}"})

if issues:
    print(json.dumps({"status": "fail", "issues": issues}, indent=2))
    raise SystemExit(1)
print(json.dumps({"status": "pass", "publicFiles": len(list(PUBLIC.glob('*.ts'))), "exports": sorted(expected)}))
