# Contributing

Thank you for improving Auto Research Agent. This is a personal, community-oriented project maintained on a best-effort basis.

## Before opening a change

1. Search existing issues and discussions.
2. For a bug, include the core version, public schema version, operating system, Node version, minimal reproduction and redacted logs.
3. For a public contract, migration, security boundary or research-semantics change, open an RFC before implementation.
4. Do not include API keys, private papers, restricted datasets, model weights, databases or generated research artifacts.

## Development workflow

```bash
npm ci
npm run build
npm run check
npm test
npm run check:contracts
npm run check:python-sdk
npm run check:docs
```

Use a focused branch and one concern per pull request. Add tests for contract behavior, migrations, scientific gates and irreversible failure modes. Documentation-only and low-risk reversible changes do not need mirrored implementation tests.

## Public boundaries

- Client code imports only documented package exports.
- Scenario and plugin examples must not import stores, migrations or internal workflow modules.
- Public schema changes require generated schema updates, Python SDK consistency and compatibility notes.
- Database changes require forward migration, backup and rollback-failure tests.
- New network, model, GPU, secret, host or confirmation access must be declared and audited.
- Scientific failures remain distinct from environment and budget failures.

## Research evidence

State whether a result is synthetic, replayed, reanalyzed or newly executed. Preserve experimental units, negative results, frozen protocols, source and artifact hashes, and claim boundaries. A successful pipeline run is not evidence that a scientific claim is true.

## Pull requests

Describe the problem, the public behavior changed, validation performed, migration or compatibility impact, and remaining limits. By submitting a contribution, you agree that it is licensed under Apache-2.0 as described in `LICENSE`.

Please follow `CODE_OF_CONDUCT.md`. Report vulnerabilities through `SECURITY.md`, outside public issues when details could enable exploitation.
