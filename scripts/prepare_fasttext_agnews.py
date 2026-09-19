#!/usr/bin/env python3
"""Fetch pinned public case inputs and prepare AG News for fastText.

The AG News archive is for research use; keep it in the ignored data directory.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import subprocess
import tarfile
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
CASE = PROJECT / ".research-data" / "cases" / "fasttext-agnews"
DOWNLOADS = CASE / "downloads"
UPSTREAM = CASE / "upstream"
DATA = CASE / "data"

ARCHIVES = {
    "fastText-v0.9.2.tar.gz": (
        "https://github.com/facebookresearch/fastText/archive/refs/tags/v0.9.2.tar.gz",
        "7ea4edcdb64bfc6faaaec193ef181bdc108ee62bb6a04e48b2e80b639a99e27e",
    ),
    "ag_news_csv.tar.gz": (
        "https://drive.google.com/uc?export=download&id=0Bz8a_Dbh9QhbUDNpeUdjb0wxRms",
        "4e2fc37d369e6e317a8b62d0d2f11d379f8c3dde60c07c35a46b069a246498ad",
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(name: str, url: str, expected: str) -> Path:
    target = DOWNLOADS / name
    if not target.exists():
        print(f"Downloading {name} from {url}", flush=True)
        partial = target.with_suffix(target.suffix + ".part")
        try:
            with urllib.request.urlopen(url, timeout=90) as source, partial.open("wb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            partial.replace(target)
        finally:
            if partial.exists():
                partial.unlink()
    actual = sha256(target)
    if actual != expected:
        raise RuntimeError(f"Unexpected checksum for {target}: {actual}; expected {expected}")
    return target


def extract(archive: Path, expected_dir: str) -> Path:
    target = UPSTREAM / expected_dir
    if target.exists():
        return target
    with tarfile.open(archive, "r:gz") as handle:
        root = UPSTREAM.resolve()
        for member in handle.getmembers():
            dest = (UPSTREAM / member.name).resolve()
            if not dest.is_relative_to(root) or not (member.isfile() or member.isdir()):
                raise RuntimeError(f"Unsafe archive member: {member.name}")
        try:
            handle.extractall(UPSTREAM, filter="data")
        except TypeError:  # Python 3.10 / 3.11
            handle.extractall(UPSTREAM)
    if not target.exists():
        raise RuntimeError(f"Archive did not contain {expected_dir}")
    return target


PUNCTUATION = re.compile(r"([.,!?;:()])")


def normalize(label: str, title: str, description: str) -> str:
    # Mirrors the official classification-results.sh's lowercase and punctuation
    # spacing, while using csv.reader to handle quoted commas safely.
    text = f"{title} , {description}".lower().replace("\\n", " ").replace("\\b", " ")
    text = PUNCTUATION.sub(r" \1 ", text)
    return f"__label__{label} " + " ".join(text.split())


def convert(csv_path: Path, labeled: Path, plain: Path | None) -> int:
    count = 0
    with csv_path.open("r", newline="", encoding="utf-8") as input_file, labeled.open("w", encoding="utf-8") as out:
        plain_file = plain.open("w", encoding="utf-8") if plain else None
        try:
            for row in csv.reader(input_file):
                if len(row) != 3 or row[0] not in {"1", "2", "3", "4"}:
                    raise RuntimeError(f"Invalid AG News row {count + 1}")
                line = normalize(*row)
                out.write(line + "\n")
                if plain_file:
                    plain_file.write(line.split(" ", 1)[1] + "\n")
                count += 1
        finally:
            if plain_file:
                plain_file.close()
    return count


def main() -> None:
    for path in (DOWNLOADS, UPSTREAM, DATA):
        path.mkdir(parents=True, exist_ok=True)
    for name, (url, expected) in ARCHIVES.items():
        archive = download(name, url, expected)
        extract(archive, "fastText-0.9.2" if name.startswith("fastText") else "ag_news_csv")

    fasttext_dir = UPSTREAM / "fastText-0.9.2"
    binary = fasttext_dir / "fasttext"
    if not binary.exists():
        subprocess.run(["make", "-j2"], cwd=fasttext_dir, check=True)
    source = UPSTREAM / "ag_news_csv"
    train_count = convert(source / "train.csv", DATA / "train.ft", None)
    test_count = convert(source / "test.csv", DATA / "test.ft", DATA / "test.text")
    if (train_count, test_count) != (120000, 7600):
        raise RuntimeError(f"Unexpected row counts: {train_count}, {test_count}")
    manifest = {
        "paper": "https://arxiv.org/abs/1607.01759",
        "upstream_code": "https://github.com/facebookresearch/fastText/tree/v0.9.2",
        "dataset_description": "AG News CSV archive linked by classification-results.sh",
        "archives": {name: digest for name, (_, digest) in ARCHIVES.items()},
        "binary_sha256": sha256(binary),
        "train_count": train_count,
        "test_count": test_count,
        "train_sha256": sha256(DATA / "train.ft"),
        "test_sha256": sha256(DATA / "test.ft"),
        "test_text_sha256": sha256(DATA / "test.text"),
        "preprocessing": "lowercase, replace escaped newline/backspace, separate basic punctuation, keep title and description",
    }
    (CASE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"prepared": True, "train": train_count, "test": test_count, "case": str(CASE)}))


if __name__ == "__main__":
    main()
