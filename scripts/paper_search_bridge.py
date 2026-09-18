#!/usr/bin/env python3
"""Stable JSON wrapper around the installed paper-search Python API."""
import json
import sys
from pathlib import Path

search_dir = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(search_dir))

from search_papers import search_papers  # noqa: E402
from postprocess import dedup, rank  # noqa: E402

request = json.load(sys.stdin)
results = search_papers(
    query=request["query"],
    start_year=request["startYear"],
    end_year=request["endYear"],
    max_results=request.get("maxPapers", 4),
    sources=request.get("sources", ["open_alex", "arxiv", "crossref"]),
)
merged = dedup(results)
ranked, _ = rank(merged, [request["query"]])
json.dump({"papers": ranked[: request.get("maxTotal", 12)],
           "sourceCounts": {k: len(v) for k, v in results.items()}}, sys.stdout)
