from research_sdk import validate_manifest

MANIFEST = {
    "id": "example.public-python", "name": "Public Python fixture", "version": "1.0.0",
    "description": "A public-only Python Scenario SDK fixture.", "domain": "testing",
    "scenarioSdkVersion": "1.0.0", "coreSchemaRange": "^1.0.0",
    "languages": ["python"], "executors": ["python"], "permissions": ["filesystem.read", "process"],
    "budget": {"maxWallTimeMs": 1000, "maxCpuCores": 1, "maxMemoryMiB": 256, "maxDiskMiB": 256, "maxGpuCount": 0, "maxKnownCostUsd": 0},
    "capabilities": [
        {"id": "data", "kind": "data", "description": "Describe data", "permissions": ["filesystem.read"], "inputSchema": {}, "outputSchema": {}, "failureClasses": ["data"]},
        {"id": "experiment", "kind": "experiment", "description": "Create Job", "permissions": ["process"], "inputSchema": {}, "outputSchema": {}, "failureClasses": ["scientific"]},
        {"id": "evaluation", "kind": "evaluation", "description": "Score output", "permissions": [], "inputSchema": {}, "outputSchema": {}, "failureClasses": ["data"]},
        {"id": "analysis", "kind": "analysis", "description": "Analyze scores", "permissions": [], "inputSchema": {}, "outputSchema": {}, "failureClasses": ["scientific"]},
    ],
    "artifacts": [{"name": "result.json", "mediaType": "application/json", "required": True, "maxBytes": 10000, "access": "project"}],
}

validate_manifest(MANIFEST)
