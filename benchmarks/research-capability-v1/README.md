# Research Capability Benchmark v1

This benchmark reports twelve research dimensions separately. Each dimension has one success fixture and one adversarial fixture. A fixture can be present while its result is `not_evaluated`: that means public schema 1.0.0 has no operation that can test the capability. It is never counted as a pass or zero.

The runner imports the core only from published package paths, uses a fresh Core Service, and records normalized machine outcomes. T2a/T2b reports are attached as separate real-case evidence and are not mixed with synthetic fixture results.

```bash
npm run build
npm run benchmark:t3 -- --output docs/reports/validation/t3-capability-baseline.json
```

Pass a prior result with `--compare` to produce a case-level comparison between two implementation hashes. Human fields remain `pending` until a named reviewer evaluates the stored evidence.
