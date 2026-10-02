# Security policy

## Supported versions

Security fixes are developed for the current `main` branch and the most recent tagged release, once a release exists. Pre-release builds receive best-effort fixes and may require upgrading rather than backporting.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for `linsh63/auto_research_agent`. If that feature is unavailable, contact the maintainer privately through the GitHub profile and ask for a secure reporting channel. Do not open a public issue with exploit details, credentials, private data or an unredacted database.

Include affected version or commit, environment, impact, reproduction steps, and a minimal proof of concept. Remove real API keys and research data. You should receive an acknowledgement when the maintainer next reviews project notifications; this personal project has no response-time SLA.

## Security boundary

Reports are especially useful for authentication bypass, workspace isolation failures, secret persistence, confirmation-data exposure, sandbox escape, path traversal, plugin permission bypass, Bundle tampering, unsafe migration, or artifact access violations. Scientific disagreement and model-quality limitations belong in normal issues unless they cross one of these security boundaries.

No package, tag or release should be treated as published until it appears in an official repository release record.
