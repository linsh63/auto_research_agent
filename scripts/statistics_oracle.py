#!/usr/bin/env python3
"""Independent NumPy/SciPy oracle for the committed G fixture."""
import json
from pathlib import Path
import numpy as np
from scipy import stats

root = Path(__file__).resolve().parents[1]
fixture = json.loads((root / "benchmarks/statistics/fixture.json").read_text())
values = np.array([fixture["differences"][str(seed)] for seed in fixture["seeds"]], dtype=float)
mean = float(values.mean())
se = float(values.std(ddof=1) / np.sqrt(len(values)))
critical = float(stats.t.ppf(0.975, len(values) - 1))
p_values = [float(2 * stats.norm.sf(abs(mean / se))) for _ in fixture["groups"]]
ordered = sorted(enumerate(p_values), key=lambda item: item[1])
holm = [0.0] * len(p_values)
previous = 0.0
for rank, (index, value) in enumerate(ordered):
    adjusted = max(previous, min(1.0, value * (len(p_values) - rank)))
    holm[index] = adjusted
    previous = adjusted
print(json.dumps({
    "meanDifference": mean, "standardError": se,
    "intervalLow": mean - critical * se, "intervalHigh": mean + critical * se,
    "pairedEffectSize": mean / float(values.std(ddof=1)),
    "leaveOneSeedOut": [float(np.delete(values, index).mean()) for index in range(len(values))],
    "groupNormalPValues": p_values, "holmAdjusted": holm,
}, indent=2))
