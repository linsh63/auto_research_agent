#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path

PARAMETERS = {"dim": 10, "lr": 0.25, "epoch": 5, "minCount": 1, "bucket": 1000000, "thread": 1}
SEEDS = (11, 23, 47)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def require_file(path: Path, expected_hash: str, expected_bytes: int) -> None:
    if not path.is_file() or path.stat().st_size != expected_bytes or digest(path) != expected_hash:
        raise RuntimeError(f"Locked input mismatch: {path.name}")


def train_one(binary: Path, data: Path, models: Path, variant: str, seed: int, gold: list[str]) -> dict:
    prefix = models / f"{variant}-seed-{seed}"
    ngrams = 1 if variant == "baseline" else 2
    command = [str(binary), "supervised", "-input", str(data / "train.ft"), "-output", str(prefix)]
    for name, value in PARAMETERS.items():
        command += [f"-{name}", str(value)]
    command += ["-wordNgrams", str(ngrams), "-seed", str(seed)]
    started = time.monotonic()
    trained = subprocess.run(command, capture_output=True, text=True, timeout=360, check=False)
    if trained.returncode:
        raise RuntimeError(f"fastText training failed for {variant} seed {seed}: {trained.stderr[-500:]}")
    model = Path(str(prefix) + ".bin")
    model_hash = digest(model)
    predicted = subprocess.run([str(binary), "predict", str(model), str(data / "test.text")], capture_output=True, text=True, timeout=120, check=False)
    if predicted.returncode:
        raise RuntimeError(f"fastText prediction failed for {variant} seed {seed}: {predicted.stderr[-500:]}")
    labels = predicted.stdout.splitlines()
    if len(labels) != len(gold):
        raise RuntimeError(f"Expected {len(gold)} predictions, got {len(labels)}")
    prediction_hash = hashlib.sha256(predicted.stdout.encode()).hexdigest()
    correct = sum(actual == expected for actual, expected in zip(labels, gold))
    for suffix in (".bin", ".vec"):
        Path(str(prefix) + suffix).unlink(missing_ok=True)
    return {"seed": seed, "correct": correct, "total": len(gold), "accuracy": correct / len(gold), "elapsedSeconds": round(time.monotonic() - started, 3), "modelSha256": model_hash, "predictionSha256": prediction_hash}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    lock_path, input_root, output_path = Path(args.lock), Path(args.input), Path(args.output)
    lock = json.loads(lock_path.read_text())
    binary, data = input_root / "fasttext", input_root
    require_file(binary, lock["fastText"]["binarySha256"], lock["fastText"]["binaryBytes"])
    for name, expected in lock["data"].items():
        require_file(data / name, expected["sha256"], expected["bytes"])
    gold = [line.split(" ", 1)[0] for line in (data / "test.ft").read_text().splitlines()]
    if len(gold) != lock["data"]["test.ft"]["rows"]:
        raise RuntimeError("Locked test row count mismatch")
    models = output_path.parent / "models"
    models.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    groups = {variant: [train_one(binary, data, models, variant, seed, gold) for seed in SEEDS] for variant in ("baseline", "candidate")}
    differences = [groups["candidate"][index]["accuracy"] - groups["baseline"][index]["accuracy"] for index in range(len(SEEDS))]
    result = {
        "schemaVersion": 1,
        "executionKind": "new_offline_training_experiment",
        "data": {"dataset": "AG News", "trainRows": lock["data"]["train.ft"]["rows"], "testRows": len(gold), "fixedTestSplit": True, "manifestHash": lock["manifestHash"]},
        "experimentalUnit": "independent model training; paired by random seed",
        "parameters": PARAMETERS,
        "seeds": list(SEEDS),
        "baseline": {"wordNgrams": 1, "runs": groups["baseline"], "meanAccuracy": sum(item["accuracy"] for item in groups["baseline"]) / len(SEEDS)},
        "candidate": {"wordNgrams": 2, "runs": groups["candidate"], "meanAccuracy": sum(item["accuracy"] for item in groups["candidate"]) / len(SEEDS)},
        "analysis": {"pairedDifferences": differences, "meanDifference": sum(differences) / len(differences), "allDifferencesPositive": all(value > 0 for value in differences), "inference": "descriptive_only"},
        "claimBoundary": "The result applies to this locked fastText configuration and one fixed AG News split; three seeds do not establish a general effect or reproduce the paper's absolute scores.",
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    result["resultHash"] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": "pass", "meanDifference": result["analysis"]["meanDifference"], "resultHash": result["resultHash"]}))


if __name__ == "__main__":
    main()
