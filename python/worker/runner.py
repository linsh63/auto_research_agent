#!/usr/bin/env python3
"""Local Python executor for the language-neutral v1 Job worker protocol."""

from __future__ import annotations

import json
import os
import resource
import selectors
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def emit(event: dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def fail(message: str, failure_class: str = "environment") -> None:
    emit({"type": "failed", "failureClass": failure_class, "message": message})
    raise SystemExit(2)


def child_limits(limits: dict[str, int], resources: dict[str, int]) -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (limits["cpuTimeSeconds"], limits["cpuTimeSeconds"]))
    memory = resources["memoryMiB"] * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    files = limits["maxArtifactBytes"]
    resource.setrlimit(resource.RLIMIT_FSIZE, (files, files))


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if request.get("protocolVersion") != "1":
            fail("Unsupported worker protocol version")
        execution = request["execution"]
        if execution.get("kind") != "python":
            fail("Python runner received a non-python job")
        limits = request["limits"]
        resources = request["resources"]
        workspace = Path(execution["workspace"]).resolve(strict=True)
        raw_script = Path(execution["script"])
        script = (workspace / raw_script).resolve(strict=True) if not raw_script.is_absolute() else raw_script.resolve(strict=True)
        if workspace != script and workspace not in script.parents:
            fail("Python script must stay inside the job workspace")
        if any(token in key.upper() for key in execution.get("env", {}) for token in ("KEY", "TOKEN", "SECRET", "PASSWORD")):
            fail("Secret-like environment variable was blocked")
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError) as error:
        fail(f"Invalid worker request: {error}")

    env = {key: value for key, value in os.environ.items() if key in {"PATH", "LANG", "LC_ALL", "PYTHONPATH", "PYTHONUNBUFFERED", "TMPDIR"}}
    env.update(execution.get("env", {}))
    env["PYTHONUNBUFFERED"] = "1"
    command = [sys.executable, str(script), *execution.get("args", [])]
    started = time.monotonic()
    emit({"type": "started", "command": command})
    process = subprocess.Popen(
        command, cwd=workspace, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1, preexec_fn=lambda: child_limits(limits, resources),
    )
    selector = selectors.DefaultSelector()
    assert process.stdout is not None and process.stderr is not None
    selector.register(process.stdout, selectors.EVENT_READ, "stdout")
    selector.register(process.stderr, selectors.EVENT_READ, "stderr")
    timed_out = False
    output_bytes = 0
    while selector.get_map():
        if (time.monotonic() - started) * 1000 > limits["wallTimeMs"]:
            timed_out = True
            process.kill()
        for key, _ in selector.select(timeout=0.05):
            line = key.fileobj.readline()
            if line:
                output_bytes += len(line.encode())
                if output_bytes > limits["maxOutputBytes"]:
                    process.kill()
                    emit({"type": "failed", "failureClass": "budget", "message": "Output byte limit exceeded"})
                    process.wait()
                    return
                emit({"type": "log", "stream": key.data, "message": line.rstrip("\n")})
            else:
                selector.unregister(key.fileobj)
    exit_code = process.wait()
    duration_ms = round((time.monotonic() - started) * 1000)
    if timed_out:
        emit({"type": "failed", "failureClass": "timeout", "message": "Python job exceeded wall time", "durationMs": duration_ms})
    elif exit_code != 0:
        emit({"type": "failed", "failureClass": "scientific", "message": f"Python job exited with code {exit_code}", "exitCode": exit_code, "durationMs": duration_ms})
    else:
        emit({"type": "completed", "exitCode": exit_code, "durationMs": duration_ms})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fail("Python worker was cancelled", "cancelled")
