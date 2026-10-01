from __future__ import annotations

import json
import argparse
from pathlib import Path
from typing import Any

from research_sdk import assert_job_budget, validate_manifest

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
validate_manifest(MANIFEST)


class FrozenDataAdapter:
    def describe(self, input_data: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del context
        lock = json.loads(Path(input_data["lockPath"]).read_text())
        return {
            "datasetId": "rio-confirmation-frozen-sample",
            "manifestHash": lock["manifestHash"],
            "roles": [{"role": "confirmation", "uri": "bundle://frozen-rio-sample", "sealed": True, "contentHash": lock["manifestHash"]}],
            "experimentalUnit": {"kind": "RIO image", "idField": "unitId", "clusterField": None},
        }


class FrozenExperimentRunner:
    def create_job(self, input_data: dict[str, Any], data: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del data, context
        job = {
            "name": "RIO frozen multimodal reanalysis",
            "dataRole": "exploration",
            "studyId": None,
            "execution": {
                "kind": "bubblewrap",
                "workspace": input_data["workspace"],
                "command": "/usr/bin/python3",
                "args": ["/work/evaluate_frozen.py", "--lock", "/work/source-lock.json", "--input", "/work/input", "--output", "/work/output/mllm-evaluation.json"],
                "env": {},
                "artifactPaths": ["output/mllm-evaluation.json"],
            },
            "resources": {"cpuCores": 1, "memoryMiB": 1024, "diskMiB": 512, "gpuCount": 0},
            "limits": {"wallTimeMs": 120000, "cpuTimeSeconds": 120, "maxOutputBytes": 1000000, "maxArtifactBytes": 1000000},
            "priority": 0,
            "resumable": True,
            "maxAttempts": 1,
        }
        assert_job_budget(MANIFEST, job)
        return job


class FrozenEvaluator:
    def evaluate(self, input_data: dict[str, Any], context: dict[str, Any]) -> list[dict[str, Any]]:
        del context
        result = json.loads(Path(input_data["resultPath"]).read_text())
        return [{
            "metric": "router_accuracy",
            "direction": "maximize",
            "value": result["sampleEvaluation"]["routerAccuracy"],
            "missingReason": None,
            "unitId": unit_id,
            "group": "frozen_confirmation_sample",
            "artifactHashes": [result["resultHash"]],
        } for unit_id in result["sampleEvaluation"]["unitIds"]]


class FrozenAnalyzer:
    def analyze(self, evaluations: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
        del context
        mean = sum(item["value"] for item in evaluations) / len(evaluations)
        return {
            "estimand": "frozen candidate minus direct by RIO image",
            "clusterUnit": "RIO image",
            "method": "artifact reanalysis with locked source hashes",
            "estimate": mean,
            "interval": None,
            "sensitivity": [{"name": "five-unit artifact check", "stable": mean == 1.0, "details": "This checks migration integrity, not a new model estimate."}],
            "artifactHashes": sorted({value for item in evaluations for value in item["artifactHashes"]}),
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-workspace")
    args = parser.parse_args()
    if args.job_workspace:
        context = {"workspaceId": "workspace:t2a", "projectId": "pending", "actorId": "user:t2a", "approvedPermissions": MANIFEST["permissions"], "budget": MANIFEST["budget"]}
        data = FrozenDataAdapter().describe({"lockPath": str(ROOT / "source-lock.json")}, context)
        print(json.dumps(FrozenExperimentRunner().create_job({"workspace": str(Path(args.job_workspace).resolve())}, data, context)))
