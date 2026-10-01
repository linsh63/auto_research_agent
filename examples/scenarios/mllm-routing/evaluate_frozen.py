#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    lock, root = json.loads(Path(args.lock).read_text()), Path(args.input)
    verified = []
    for item in lock["files"]:
        path = root / item["path"]
        if not path.is_file() or path.stat().st_size != item["bytes"] or sha256(path) != item["sha256"]:
            raise RuntimeError(f"locked artifact mismatch: {item['path']}")
        verified.append({"path": item["path"], "bytes": item["bytes"], "sha256": item["sha256"]})
    for item in lock["images"]:
        path = root / item["path"]
        data = path.read_bytes()
        if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"] or not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            raise RuntimeError(f"locked JPEG mismatch: {item['path']}")
        verified.append({"path": item["path"], "bytes": item["bytes"], "sha256": item["sha256"]})
    analysis = json.loads((root / "results/final-analysis.json").read_text())
    units = lock["sampleUnitIds"]
    rows = [row for row in analysis["router"]["rows"] if row["unitId"] in units]
    expected_rows = len(units) * 3 * 3
    if len(rows) != expected_rows:
        raise RuntimeError(f"expected {expected_rows} sample rows, found {len(rows)}")
    accuracy = sum(row["prediction"] == row["target"] for row in rows) / len(rows)
    if accuracy != 1.0 or analysis["router"]["accuracy"] != 1.0:
        raise RuntimeError("frozen router accuracy changed")
    for model, expected in lock["modelSourceHashes"].items():
        if analysis["summaries"][model]["sourceHashes"] != expected:
            raise RuntimeError(f"model source hash mismatch: {model}")
    estimate = analysis["analysis"]["estimates"][0]
    if estimate["nUnits"] != 80 or abs(estimate["estimate"] - 0.04074074074074074) > 1e-15:
        raise RuntimeError("frozen aggregate estimate changed")
    result = {
        "schemaVersion": 1,
        "scenarioId": "mllm.rio-routing-transport",
        "sourceCommit": lock["sourceCommit"],
        "executionKind": "artifact_reanalysis_no_model_inference",
        "verifiedFiles": verified,
        "sampleEvaluation": {"unitIds": units, "imageCount": len(lock["images"]), "rowCount": len(rows), "routerAccuracy": accuracy},
        "frozenResult": {"nUnits": estimate["nUnits"], "estimate": estimate["estimate"], "interval95": [estimate["intervalLow"], estimate["intervalHigh"]]},
        "claimBoundary": analysis["router"]["claimBoundary"],
    }
    canonical = json.dumps(result, sort_keys=True, separators=(",", ":")).encode()
    result["resultHash"] = hashlib.sha256(canonical).hexdigest()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": "pass", "resultHash": result["resultHash"], "rows": len(rows), "images": len(lock["images"])}))


if __name__ == "__main__":
    main()
