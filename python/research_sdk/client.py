from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator

from .secrets import SecretProvider


class CoreServiceError(RuntimeError):
    pass


class ResearchClient:
    def __init__(self, base_url: str, token: str, timeout: float = 30.0):
        if not token:
            raise ValueError("Core Service token is required")
        self.base_url = base_url.rstrip("/")
        self._token = token
        self.timeout = timeout

    @classmethod
    def connect(cls, base_url: str, token: str | None = None, secret_provider: SecretProvider | None = None, token_name: str = "AUTO_RESEARCH_SERVICE_TOKEN") -> "ResearchClient":
        resolved = token or (secret_provider.resolve(token_name, "core-service-client") if secret_provider else None)
        client = cls(base_url, resolved or "")
        client.capabilities()
        return client

    @classmethod
    def connect_local(cls, data_dir: str | Path, database_path: str | Path, auto_start: bool = True, service_entry: str | Path | None = None, secret_provider: SecretProvider | None = None, timeout: float = 10.0) -> "ResearchClient":
        data_dir, database_path = Path(data_dir).resolve(), Path(database_path).resolve()
        discovery_path = data_dir / "core-service.json"
        client = cls._from_discovery(discovery_path, secret_provider)
        if client:
            return client
        if not auto_start:
            raise CoreServiceError("Local Core Service is not running")
        entry = Path(service_entry or os.environ.get("AUTO_RESEARCH_SERVICE_ENTRY", Path(__file__).resolve().parents[2] / "dist/service/cli.js"))
        launch = ["--import", "tsx", str(entry)] if entry.suffix == ".ts" else [str(entry)]
        subprocess.Popen([os.environ.get("NODE", "node"), *launch, "--database", str(database_path), "--data-dir", str(data_dir), "--port", "0"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            time.sleep(0.05)
            client = cls._from_discovery(discovery_path, secret_provider)
            if client:
                return client
        raise CoreServiceError("Timed out waiting for local Core Service discovery")

    @classmethod
    def _from_discovery(cls, path: Path, provider: SecretProvider | None) -> "ResearchClient | None":
        try:
            discovery = json.loads(path.read_text())
            token = Path(discovery["tokenFile"]).read_text().strip() if discovery.get("tokenFile") else None
            token = token or (provider.resolve(discovery.get("tokenSecretName", "AUTO_RESEARCH_SERVICE_TOKEN"), "core-service-client") if provider else None) or os.environ.get(discovery.get("tokenSecretName", "AUTO_RESEARCH_SERVICE_TOKEN"))
            return cls.connect(discovery["baseUrl"], token=token)
        except (OSError, KeyError, ValueError, CoreServiceError, urllib.error.URLError):
            return None

    def capabilities(self) -> dict[str, Any]:
        return self._request("GET", "/v1/capabilities")

    def execute(self, command: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/commands", command)

    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/queries", query)

    def worker(self, request: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/workers", request)

    def audit(self, workspace_id: str | None = None, project_id: str | None = None, limit: int = 200) -> dict[str, Any]:
        params = urllib.parse.urlencode({key: value for key, value in {"workspaceId": workspace_id, "projectId": project_id, "limit": limit}.items() if value is not None})
        return self._request("GET", f"/v1/audit?{params}")

    def stream(self, workspace_id: str, project_id: str, actor_id: str = "user:python-sdk", from_sequence: int = 1, job_id: str | None = None, log_from: int = 1) -> Iterator[dict[str, Any]]:
        params = {"workspaceId": workspace_id, "projectId": project_id, "actorId": actor_id, "fromSequence": from_sequence, "logFrom": log_from}
        if job_id:
            params["jobId"] = job_id
        request = urllib.request.Request(f"{self.base_url}/v1/stream?{urllib.parse.urlencode(params)}", headers=self._headers("text/event-stream"))
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                event, event_id, data = "message", None, []
                for raw in response:
                    line = raw.decode().rstrip("\r\n")
                    if not line:
                        if data:
                            yield {"event": event, "id": event_id, "data": json.loads("\n".join(data))}
                        event, event_id, data = "message", None, []
                    elif line.startswith("event:"):
                        event = line[6:].strip()
                    elif line.startswith("id:"):
                        event_id = line[3:].strip()
                    elif line.startswith("data:"):
                        data.append(line[5:].lstrip())
        except urllib.error.HTTPError as error:
            raise self._http_error(error) from error

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        encoded = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base_url}{path}", data=encoded, method=method, headers=self._headers("application/json", body is not None))
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise self._http_error(error) from error
        except urllib.error.URLError as error:
            raise CoreServiceError(str(error.reason)) from error

    def _headers(self, accept: str, content: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._token}", "Accept": accept}
        if content:
            headers["Content-Type"] = "application/json"
        return headers

    @staticmethod
    def _http_error(error: urllib.error.HTTPError) -> CoreServiceError:
        try:
            message = json.loads(error.read()).get("error", {}).get("message", f"HTTP {error.code}")
        except Exception:
            message = f"HTTP {error.code}"
        return CoreServiceError(message)
