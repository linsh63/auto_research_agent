#!/usr/bin/env python3
"""Paired translation-augmentation check on scikit-learn's Digits images.

The five split seeds are repeated stratified holdouts, not five independent
datasets.  Both variants use the same split and RBF SVC configuration.  The
candidate adds four one-pixel translations of each training image.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time

import numpy as np
import sklearn
from sklearn.datasets import load_digits
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC


SPLIT_SEEDS = (11, 23, 47, 73, 101)
TEST_SIZE = 0.25
SVC_PARAMETERS = {"C": 5.0, "gamma": "scale", "kernel": "rbf"}
TRANSLATIONS = ((0, 1), (0, -1), (1, 0), (-1, 0))


def digest_arrays(images: np.ndarray, labels: np.ndarray) -> str:
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(images).tobytes())
    digest.update(np.ascontiguousarray(labels).tobytes())
    return digest.hexdigest()


def translate(image: np.ndarray, dy: int, dx: int) -> np.ndarray:
    output = np.zeros_like(image)
    target_y = slice(max(0, dy), min(8, 8 + dy))
    target_x = slice(max(0, dx), min(8, 8 + dx))
    source_y = slice(max(0, -dy), min(8, 8 - dy))
    source_x = slice(max(0, -dx), min(8, 8 - dx))
    output[target_y, target_x] = image[source_y, source_x]
    return output


def augment(images: np.ndarray, labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    translated = [
        np.stack([translate(image, dy, dx) for image in images])
        for dy, dx in TRANSLATIONS
    ]
    return np.concatenate([images, *translated]), np.tile(labels, 1 + len(TRANSLATIONS))


def run_split(images: np.ndarray, labels: np.ndarray, variant: str, seed: int) -> dict[str, object]:
    train_indices, test_indices = train_test_split(
        np.arange(len(labels)), test_size=TEST_SIZE, random_state=seed, stratify=labels
    )
    train_images, train_labels = images[train_indices], labels[train_indices]
    if variant == "candidate":
        train_images, train_labels = augment(train_images, train_labels)

    model = SVC(**SVC_PARAMETERS)
    started = time.monotonic()
    model.fit(train_images.reshape(len(train_images), -1), train_labels)
    predictions = model.predict(images[test_indices].reshape(len(test_indices), -1))
    accuracy = float(accuracy_score(labels[test_indices], predictions))
    return {
        "seed": seed,
        "accuracy": accuracy,
        "correct": int(np.sum(predictions == labels[test_indices])),
        "n_train_effective": int(len(train_labels)),
        "n_test": int(len(test_indices)),
        "elapsed_seconds": round(time.monotonic() - started, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("variant", choices=("baseline", "candidate"))
    variant = parser.parse_args().variant

    digits = load_digits()
    images = np.asarray(digits.images, dtype=np.float64) / 16.0
    labels = np.asarray(digits.target, dtype=np.int64)
    per_seed = [run_split(images, labels, variant, seed) for seed in SPLIT_SEEDS]
    result = {
        "variant": variant,
        "accuracy": float(np.mean([row["accuracy"] for row in per_seed])),
        "per_seed": per_seed,
        "split_seeds": SPLIT_SEEDS,
        "n_images": int(len(labels)),
        "image_shape": [8, 8],
        "test_size": TEST_SIZE,
        "augmentation": "none" if variant == "baseline" else "one-pixel translations in four cardinal directions",
        "svc_parameters": SVC_PARAMETERS,
        "dataset_sha256": digest_arrays(images, labels),
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit_learn": sklearn.__version__,
        },
    }
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
