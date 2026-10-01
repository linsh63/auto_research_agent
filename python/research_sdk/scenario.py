from __future__ import annotations

import re
from typing import Any, Protocol

from .generated_models import AnalysisContract, DataContract, EvaluationContract, SCENARIO_SDK_VERSION, ScenarioManifest


class ScenarioContext(dict[str, Any]):
    """Transport-safe context. It intentionally has no database or core mutation handle."""


class DataAdapter(Protocol):
    def describe(self, input_data: Any, context: ScenarioContext) -> DataContract: ...


class ExperimentRunner(Protocol):
    def create_job(self, input_data: Any, data: DataContract, context: ScenarioContext) -> dict[str, Any]: ...


class Evaluator(Protocol):
    def evaluate(self, input_data: Any, context: ScenarioContext) -> list[EvaluationContract]: ...


class Analyzer(Protocol):
    def analyze(self, evaluations: list[EvaluationContract], context: ScenarioContext) -> AnalysisContract: ...


def validate_manifest(manifest: ScenarioManifest) -> None:
    required = {"id", "name", "version", "description", "domain", "scenarioSdkVersion", "coreSchemaRange", "languages", "executors", "permissions", "budget", "capabilities", "artifacts"}
    missing = required - manifest.keys()
    if missing:
        raise ValueError(f"Scenario manifest is missing: {sorted(missing)}")
    if manifest["scenarioSdkVersion"] != SCENARIO_SDK_VERSION:
        raise ValueError("Unsupported Scenario SDK version")
    if not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]):
        raise ValueError("Scenario version must be semver")
    kinds = {item["kind"] for item in manifest["capabilities"]}
    missing_kinds = {"data", "experiment", "evaluation", "analysis"} - kinds
    if missing_kinds:
        raise ValueError(f"Scenario capabilities are missing: {sorted(missing_kinds)}")
    declared = set(manifest["permissions"])
    for capability in manifest["capabilities"]:
        undeclared = set(capability["permissions"]) - declared
        if undeclared:
            raise ValueError(f"Capability {capability['id']} uses undeclared permissions: {sorted(undeclared)}")


def negotiate(manifest: ScenarioManifest, core_schema_version: str, approved_permissions: list[str], available_executors: list[str]) -> dict[str, Any]:
    validate_manifest(manifest)
    issues: list[str] = []
    if not _satisfies(core_schema_version, manifest["coreSchemaRange"]):
        issues.append(f"Core schema {core_schema_version} does not satisfy {manifest['coreSchemaRange']}")
    for permission in manifest["permissions"]:
        if permission not in approved_permissions:
            issues.append(f"Permission {permission} is not approved")
    for executor in manifest["executors"]:
        if executor not in available_executors:
            issues.append(f"Executor {executor} is unavailable")
    return {"compatible": not issues, "issues": issues, "grantedPermissions": [item for item in manifest["permissions"] if item in approved_permissions], "requiredExecutors": manifest["executors"]}


def assert_job_budget(manifest: ScenarioManifest, job: dict[str, Any]) -> None:
    budget, resources, limits = manifest["budget"], job["resources"], job["limits"]
    if resources["cpuCores"] > budget["maxCpuCores"] or resources["memoryMiB"] > budget["maxMemoryMiB"] or resources["diskMiB"] > budget["maxDiskMiB"] or resources["gpuCount"] > budget["maxGpuCount"] or limits["wallTimeMs"] > budget["maxWallTimeMs"]:
        raise ValueError("Scenario Job exceeds the manifest budget")
    if job["dataRole"] == "confirmation" and "confirmation" not in manifest["permissions"]:
        raise ValueError("Scenario lacks confirmation permission")


def _version(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", value.strip())
    return tuple(map(int, match.groups())) if match else None  # type: ignore[return-value]


def _satisfies(value: str, range_value: str) -> bool:
    parsed = _version(value)
    if not parsed:
        return False
    if range_value.startswith("^"):
        base = _version(range_value[1:])
        return bool(base and parsed >= base and ((base[0] > 0 and parsed[0] == base[0]) or (base[0] == 0 and base[1] > 0 and parsed[:2] == base[:2]) or (base[:2] == (0, 0) and parsed == base)))
    exact = _version(range_value)
    if exact:
        return parsed == exact
    match = re.fullmatch(r">=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)", range_value)
    return bool(match and _version(match.group(1)) <= parsed < _version(match.group(2)))  # type: ignore[operator]
