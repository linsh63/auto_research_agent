from __future__ import annotations

from typing import Any, Protocol

from .generated_models import WorkerRequest, WorkerResult


class WorkerTransport(Protocol):
    def call(self, request: WorkerRequest) -> WorkerResult: ...


class WorkerClient:
    """Transport-independent client; HTTP transport is supplied in v1.5 S."""

    def __init__(self, transport: WorkerTransport):
        self.transport = transport

    def call(self, request: WorkerRequest) -> Any:
        result = self.transport.call(request)
        if result["status"] != "ok":
            error = result.get("error") or {"message": "Worker request failed"}
            raise RuntimeError(str(error.get("message")))
        return result.get("data")
