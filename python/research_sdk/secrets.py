from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol


class SecretProvider(Protocol):
    def resolve(self, name: str, purpose: str) -> str | None: ...


class EnvironmentSecretProvider:
    def resolve(self, name: str, purpose: str) -> str | None:
        del purpose
        return os.environ.get(name)


class DirectorySecretProvider:
    def __init__(self, directory: str | Path):
        self.directory = Path(directory)

    def resolve(self, name: str, purpose: str) -> str | None:
        del purpose
        if not name.replace("_", "").isalnum() or name.upper() != name:
            raise ValueError("Invalid secret name")
        try:
            value = (self.directory / name).read_text().strip()
            return value or None
        except OSError:
            return None
