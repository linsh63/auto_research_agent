#!/usr/bin/env python3
"""Offline validation for every skill registered by the v1 agent."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get("AUTO_RESEARCH_SKILL_ROOT", Path.home() / ".codex" / "skills"))
PROJECT = Path(__file__).resolve().parents[1]

SKILLS = {
    "anysearch": ("script", ["evidence"]),
    "paper-search": ("script", ["evidence"]),
    "grill-me": ("method", ["intake"]),
    "grilling": ("method", ["intake"]),
    "scientific-brainstorming": ("mixed", ["hypothesis"]),
    "research-ideation": ("method", ["hypothesis"]),
    "idea-spark": ("mixed", ["hypothesis"]),
    "scoop-check": ("mixed", ["hypothesis"]),
    "hypothesis-generation": ("mixed", ["hypothesis"]),
    "experimental-design": ("mixed", ["plan"]),
    "statistical-analysis": ("mixed", ["analysis"]),
    "scientific-critical-thinking": ("method", ["analysis", "review"]),
    "scientific-writing": ("mixed", ["report"]),
    "peer-review": ("mixed", ["review"]),
}


def run(command: list[str], cwd: Path, timeout: int = 60) -> dict:
    env = dict(os.environ)
    env["NO_PROXY"] = "127.0.0.1,localhost"
    env["no_proxy"] = "127.0.0.1,localhost"
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    return {"command": command, "exitCode": result.returncode,
            "stdout": result.stdout[-500:], "stderr": result.stderr[-500:]}


def validate_python(path: Path) -> None:
    compile(path.read_text(encoding="utf-8"), str(path), "exec")


def main() -> None:
    records = []
    for name, (mode, stages) in SKILLS.items():
        directory = ROOT / name
        skill_file = directory / "SKILL.md"
        checks = []
        errors = []
        if not skill_file.exists():
            errors.append("SKILL.md missing")
            content = ""
        else:
            content = skill_file.read_text(encoding="utf-8")
            checks.append("instruction-load")
            if not content.startswith("---") or "description:" not in content[:1500]:
                errors.append("frontmatter name/description missing")
        scripts = []
        for path in sorted((directory / "scripts").glob("*")) if (directory / "scripts").exists() else []:
            if path.suffix == ".py":
                try:
                    validate_python(path)
                    scripts.append({"path": str(path.relative_to(directory)), "validation": "python-syntax", "ok": True})
                except Exception as exc:
                    scripts.append({"path": str(path.relative_to(directory)), "validation": "python-syntax", "ok": False, "error": str(exc)})
                    errors.append(f"syntax: {path.name}")
            elif path.suffix == ".sh":
                result = run(["bash", "-n", str(path)], directory)
                scripts.append({"path": str(path.relative_to(directory)), "validation": "bash-syntax", "ok": result["exitCode"] == 0})
                if result["exitCode"] != 0:
                    errors.append(f"syntax: {path.name}")
        runtime = []
        if name == "anysearch":
            runtime.append(run(["sha256sum", "-c", "SHA256SUMS.txt"], directory))
            runtime.append(run(["python3", "scripts/anysearch_cli.py", "doc"], directory))
        elif name == "paper-search":
            python = directory / ".venv" / "bin" / "python"
            runtime.append(run([str(python), "scripts/selftest_runtime.py"], directory))
            runtime.append(run([str(python), "scripts/selftest_postprocess.py"], directory))
        elif name == "idea-spark":
            python = directory / ".venv" / "bin" / "python"
            for test in ("selftest_routing.py", "selftest_units.py"):
                if (directory / "scripts" / test).exists():
                    runtime.append(run([str(python), f"scripts/{test}"], directory))
        if any(item["exitCode"] != 0 for item in runtime):
            errors.append("runtime self-test failed")
        if runtime:
            checks.append("runtime-self-test")
        if scripts:
            checks.append("script-syntax")
        records.append({
            "name": name, "mode": mode, "stages": stages, "available": skill_file.exists(),
            "sha256": hashlib.sha256(content.encode()).hexdigest() if content else None,
            "checks": checks, "scriptCount": len(scripts), "runtime": runtime,
            "status": "ready" if not errors else "failed", "errors": errors,
        })

    report = {"schemaVersion": 1, "skillRoot": str(ROOT), "records": records,
              "ready": sum(r["status"] == "ready" for r in records), "total": len(records)}
    output = PROJECT / "docs" / "skill-validation.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ready": report["ready"], "total": report["total"], "report": str(output)}))
    if report["ready"] != report["total"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
