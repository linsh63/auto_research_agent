#!/usr/bin/env python3
"""Validate the docs hierarchy and local Markdown links."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote


PROJECT = Path(__file__).resolve().parents[1]
DOCS = PROJECT / "docs"
REQUIRED_DIRECTORIES = {"architecture", "cases", "guides", "planning", "reports"}
LINK_PATTERN = re.compile(r"\[[^]]*\]\(([^)]+)\)")


def main() -> None:
    actual_directories = {path.name for path in DOCS.iterdir() if path.is_dir()}
    missing_directories = sorted(REQUIRED_DIRECTORIES - actual_directories)
    root_files = sorted(path.name for path in DOCS.iterdir() if path.is_file() and path.name != "README.md")

    broken_links: list[tuple[str, str]] = []
    markdown_files = [PROJECT / "README.md", *sorted(DOCS.rglob("*.md"))]
    for document in markdown_files:
        for raw_target in LINK_PATTERN.findall(document.read_text(encoding="utf-8")):
            target = raw_target.strip()
            if not target or target.startswith(("#", "mailto:")) or "://" in target:
                continue
            local_path = unquote(target.split("#", 1)[0])
            if not (document.parent / local_path).resolve().exists():
                broken_links.append((str(document.relative_to(PROJECT)), target))

    if missing_directories or root_files or broken_links:
        if missing_directories:
            print(f"Missing docs directories: {', '.join(missing_directories)}")
        if root_files:
            print(f"Unexpected files in docs root: {', '.join(root_files)}")
        for document, target in broken_links:
            print(f"Broken link: {document} -> {target}")
        raise SystemExit(1)

    print(f"Docs OK: {len(markdown_files)} Markdown files, 0 broken local links")


if __name__ == "__main__":
    main()
