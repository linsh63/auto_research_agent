#!/usr/bin/env python3
"""Paired unigram/bigram fastText test on the published AG News split."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
CASE = PROJECT / ".research-data" / "cases" / "fasttext-agnews"
PARAMS = {"dim": 10, "lr": 0.25, "epoch": 5, "minCount": 1, "bucket": 1000000, "thread": 1}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def run_one(binary: Path, variant: str, seed: int, data: Path) -> dict:
    work = CASE / "model-artifacts" / variant / f"seed-{seed}"
    work.mkdir(parents=True, exist_ok=True)
    model = work / "model"
    ngrams = 1 if variant == "baseline" else 2
    command = [
        str(binary), "supervised", "-input", str(data / "train.ft"), "-output", str(model),
        "-dim", str(PARAMS["dim"]), "-lr", str(PARAMS["lr"]),
        "-epoch", str(PARAMS["epoch"]), "-minCount", str(PARAMS["minCount"]),
        "-bucket", str(PARAMS["bucket"]), "-thread", str(PARAMS["thread"]),
        "-wordNgrams", str(ngrams), "-seed", str(seed),
    ]
    started = time.monotonic()
    trained = subprocess.run(command, capture_output=True, text=True, timeout=360, check=False)
    (work / "train.stdout.log").write_text(trained.stdout, encoding="utf-8")
    (work / "train.stderr.log").write_text(trained.stderr, encoding="utf-8")
    if trained.returncode != 0:
        raise RuntimeError(f"fastText training failed for {variant} seed {seed}: {trained.stderr[-500:]}")

    predicted = subprocess.run(
        [str(binary), "predict", str(model) + ".bin", str(data / "test.text")],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if predicted.returncode != 0:
        raise RuntimeError(f"fastText prediction failed for {variant} seed {seed}: {predicted.stderr[-500:]}")
    labels = predicted.stdout.splitlines()
    gold = [line.split(" ", 1)[0] for line in (data / "test.ft").read_text(encoding="utf-8").splitlines()]
    if len(labels) != len(gold):
        raise RuntimeError(f"Expected {len(gold)} predictions, got {len(labels)}")
    correct = sum(a == b for a, b in zip(labels, gold))
    (work / "predictions.txt").write_text(predicted.stdout, encoding="utf-8")
    return {
        "seed": seed, "correct": correct, "total": len(gold), "accuracy": correct / len(gold),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "model_sha256": digest(Path(str(model) + ".bin")),
        "prediction_sha256": digest(work / "predictions.txt"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("variant", choices=("baseline", "candidate"))
    args = parser.parse_args()
    manifest_path = CASE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    binary = CASE / "upstream" / "fastText-0.9.2" / "fasttext"
    data = CASE / "data"
    for name, expected in (("train.ft", manifest["train_sha256"]), ("test.ft", manifest["test_sha256"]),
                           ("test.text", manifest["test_text_sha256"])):
        if digest(data / name) != expected:
            raise RuntimeError(f"Prepared data changed: {name}")
    if digest(binary) != manifest["binary_sha256"]:
        raise RuntimeError("fastText binary changed")
    base_seed = int(os.environ.get("RESEARCH_SEED", "11"))
    seeds = (base_seed, base_seed + 12, base_seed + 36)
    per_seed = [run_one(binary, args.variant, seed, data) for seed in seeds]
    result = {
        "variant": args.variant,
        "accuracy": sum(item["accuracy"] for item in per_seed) / len(per_seed),
        "per_seed": per_seed,
        "n_train": manifest["train_count"], "n_test": manifest["test_count"],
        "word_ngrams": 1 if args.variant == "baseline" else 2,
        "seeds": seeds,
        "parameters": PARAMS, "data_sha256": manifest["train_sha256"],
        "fasttext_binary_sha256": manifest["binary_sha256"],
    }
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
