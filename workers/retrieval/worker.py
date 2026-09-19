#!/usr/bin/env python3
"""JSONL retrieval worker.

PaperQA2 is the preferred backend when installed in the pinned worker environment.
The installed paper-search runtime remains a deterministic metadata fallback so the
control plane stays usable while the optional heavy document stack is unavailable.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT = Path(os.environ.get("AUTO_RESEARCH_PROJECT_ROOT", Path.cwd()))
SKILL_ROOT = Path(os.environ.get("AUTO_RESEARCH_SKILL_ROOT", Path.home() / ".codex" / "skills"))
BRIDGE = PROJECT / "scripts" / "paper_search_bridge.py"
PAPER_SKILL = SKILL_ROOT / "paper-search"
PROJECT_PYTHON = PROJECT / "workers" / "retrieval" / ".venv" / "bin" / "python"
PAPER_PYTHON = Path(os.environ.get("AUTO_RESEARCH_PAPERQA_PYTHON", str(PROJECT_PYTHON if PROJECT_PYTHON.exists() else PAPER_SKILL / ".venv" / "bin" / "python")))
PAPER_SCRIPTS = PAPER_SKILL / "scripts"
PAPERQA_DOCS = None


def paperqa_docs():
    global PAPERQA_DOCS
    if PAPERQA_DOCS is None:
        from paperqa import Docs
        PAPERQA_DOCS = Docs()
    return PAPERQA_DOCS


def respond(request_id: str, ok: bool, result=None, error=None, metrics=None):
    payload = {"schemaVersion": 1, "requestId": request_id, "ok": ok}
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    if metrics is not None:
        payload["metrics"] = metrics
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def search(params: dict):
    request = {
        "query": params["query"],
        "startYear": params.get("startYear", 1900),
        "endYear": params.get("endYear", 2100),
        "maxPapers": params.get("maxPapers", 10),
        "maxTotal": params.get("maxTotal", 30),
        "sources": params.get("sources", ["open_alex", "arxiv", "crossref"]),
    }
    if not PAPER_PYTHON.exists() or not (PAPER_SCRIPTS / "search_papers.py").exists():
        return {"backend": "paper-search-unavailable", "papers": [], "warnings": ["paper-search runtime missing"]}
    result = subprocess.run(
        [str(PAPER_PYTHON), str(BRIDGE), str(PAPER_SCRIPTS)],
        input=json.dumps(request), text=True, capture_output=True, timeout=params.get("timeoutSeconds", 90), check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-1000:] or f"paper-search exit {result.returncode}")
    parsed = json.loads(result.stdout)
    parsed["backend"] = "paper-search-fallback"
    parsed["sourceResponseHash"] = hashlib.sha256(result.stdout.encode()).hexdigest()
    if result.stderr.strip():
        parsed["warnings"] = [result.stderr[-1000:]]
    return parsed


def main():
    for raw in sys.stdin:
        try:
            request = json.loads(raw)
            request_id = request.get("requestId", "missing")
            method = request.get("method")
            if method == "handshake":
                paperqa_available = False
                try:
                    import paperqa  # type: ignore
                    paperqa_available = True
                except Exception:
                    pass
                respond(request_id, True, {"workerVersion": "0.1.0", "backend": "paperqa" if paperqa_available else "paper-search-fallback", "paperqaAvailable": paperqa_available, "python": sys.version.split()[0]})
            elif method == "health":
                respond(request_id, True, {"ready": True})
            elif method == "search_metadata":
                respond(request_id, True, search(request.get("params", {})))
            elif method == "paperqa_ingest_text":
                from paperqa import Settings
                from paperqa.types import Doc, Text
                params = request.get("params", {})
                doc = Doc(docname=params["docname"], dockey=params["dockey"], citation=params.get("citation", params["docname"]))
                texts = [Text(text=text, name=f"{params['dockey']}-chunk-{index}", doc=doc) for index, text in enumerate(params.get("texts", []))]
                import asyncio
                added = asyncio.run(paperqa_docs().aadd_texts(texts, doc, settings=Settings(parsing={"defer_embedding": True}), embedding_model=None))
                respond(request_id, True, {"added": bool(added), "documentCount": len(paperqa_docs().docs), "backend": "paperqa"})
            elif method == "cancel":
                respond(request_id, True, {"cancelled": True})
            else:
                respond(request_id, False, error={"code": "unsupported_method", "message": str(method)})
        except Exception as exc:
            respond(request_id if "request_id" in locals() else "unknown", False, error={"code": type(exc).__name__, "message": str(exc)})


if __name__ == "__main__":
    main()
