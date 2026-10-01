from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from research_sdk import assert_job_budget, validate_manifest

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
validate_manifest(MANIFEST)


class AgNewsDataAdapter:
    def describe(self, input_data: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del context
        lock = json.loads(Path(input_data["lockPath"]).read_text())
        return {
            "datasetId": "ag-news-published-split",
            "manifestHash": lock["manifestHash"],
            "roles": [
                {"role": "train", "uri": "workspace://input/train.ft", "sealed": True, "contentHash": lock["data"]["train.ft"]["sha256"]},
                {"role": "confirmation", "uri": "workspace://input/test.ft", "sealed": True, "contentHash": lock["data"]["test.ft"]["sha256"]},
            ],
            "experimentalUnit": {"kind": "independent model training", "idField": "seed", "clusterField": "seed"},
        }


class FastTextExperimentRunner:
    def create_job(self, input_data: dict[str, Any], data: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del data, context
        job = {
            "name": "fastText AG News paired word-ngram experiment",
            "dataRole": "exploration",
            "studyId": None,
            "execution": {
                "kind": "bubblewrap",
                "workspace": input_data["workspace"],
                "command": "/usr/bin/python3",
                "args": ["/work/run_experiment.py", "--lock", "/work/source-lock.json", "--input", "/work/input", "--output", "/work/output/fasttext-agnews-result.json"],
                "env": {},
                "artifactPaths": ["output/fasttext-agnews-result.json"],
            },
            "resources": {"cpuCores": 1, "memoryMiB": 2048, "diskMiB": 1024, "gpuCount": 0},
            "limits": {"wallTimeMs": 600000, "cpuTimeSeconds": 600, "maxOutputBytes": 1000000, "maxArtifactBytes": 1000000},
            "priority": 0,
            "resumable": False,
            "maxAttempts": 1,
        }
        assert_job_budget(MANIFEST, job)
        return job


class AccuracyEvaluator:
    def evaluate(self, input_data: dict[str, Any], context: dict[str, Any]) -> list[dict[str, Any]]:
        del context
        result = json.loads(Path(input_data["resultPath"]).read_text())
        artifact_hash = result["resultHash"]
        return [
            {
                "metric": "top1_accuracy",
                "direction": "maximize",
                "value": run["accuracy"],
                "missingReason": None,
                "unitId": f"{variant}:seed-{run['seed']}",
                "group": variant,
                "artifactHashes": [artifact_hash],
            }
            for variant in ("baseline", "candidate")
            for run in result[variant]["runs"]
        ]


class PairedAnalyzer:
    def analyze(self, evaluations: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
        del context
        by_seed: dict[str, dict[str, float]] = {}
        for item in evaluations:
            seed = item["unitId"].split("seed-", 1)[1]
            by_seed.setdefault(seed, {})[item["group"]] = item["value"]
        differences = [values["candidate"] - values["baseline"] for _, values in sorted(by_seed.items())]
        estimate = sum(differences) / len(differences)
        return {
            "estimand": "candidate minus baseline top-1 accuracy over paired training seeds",
            "clusterUnit": "independent model training seed pair",
            "method": "arithmetic mean of three paired-seed accuracy differences on one fixed test split",
            "estimate": estimate,
            "interval": None,
            "sensitivity": [{"name": "all paired differences positive", "stable": all(value > 0 for value in differences), "details": "Descriptive three-seed check; no population-level uncertainty claim."}],
            "artifactHashes": sorted({value for item in evaluations for value in item["artifactHashes"]}),
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-workspace")
    parser.add_argument("--evaluate")
    args = parser.parse_args()
    context = {"workspaceId": "workspace:t2b", "projectId": "pending", "actorId": "user:t2b", "approvedPermissions": MANIFEST["permissions"] + ["confirmation"], "budget": MANIFEST["budget"]}
    if args.job_workspace:
        data = AgNewsDataAdapter().describe({"lockPath": str(ROOT / "source-lock.json")}, context)
        print(json.dumps(FastTextExperimentRunner().create_job({"workspace": str(Path(args.job_workspace).resolve())}, data, context)))
    elif args.evaluate:
        evaluations = AccuracyEvaluator().evaluate({"resultPath": args.evaluate}, context)
        print(json.dumps({"evaluations": evaluations, "analysis": PairedAnalyzer().analyze(evaluations, context)}))
