"""Deterministic smoke fixture, not a scientific benchmark."""
import json
import math
import os
import random
import sys

variant = sys.argv[1]
rng = random.Random(int(os.environ.get("RESEARCH_SEED", "42")))
train = [(x / 10, 0.5 + 1.4 * (x / 10) + 0.8 * (x / 10) ** 2 + rng.gauss(0, 0.08)) for x in range(-30, 31)]
test = [(x / 10, 0.5 + 1.4 * (x / 10) + 0.8 * (x / 10) ** 2) for x in range(-35, 36, 7)]

def fit(features):
    # Small normal equation solver, using only the Python standard library.
    rows = [[sum(features(x)[i] * features(x)[j] for x, _ in train) for j in range(len(features(0)))]
            + [sum(features(x)[i] * y for x, y in train)] for i in range(len(features(0)))]
    n = len(rows)
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(rows[r][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        factor = rows[col][col]
        rows[col] = [v / factor for v in rows[col]]
        for row in range(n):
            if row != col:
                factor = rows[row][col]
                rows[row] = [a - factor * b for a, b in zip(rows[row], rows[col])]
    return [row[-1] for row in rows]

features = (lambda x: [1, x]) if variant == "baseline" else (lambda x: [1, x, x * x])
weights = fit(features)
rmse = math.sqrt(sum((sum(w * f for w, f in zip(weights, features(x))) - y) ** 2 for x, y in test) / len(test))
print(json.dumps({"rmse": rmse, "variant": variant, "n_train": len(train), "n_test": len(test)}))
