# RIO Multimodal Routing Scenario

This Scenario migrates the completed v1.4 MLLM routing study to the public v1.5 interfaces.

It does not rerun Qwen inference. The T2a Job verifies a locked source commit, ten frozen research artifacts, fifteen real JPEG inputs, 45 sampled routing rows, all three model source hashes, and the frozen 80-image aggregate estimate inside an offline Bubblewrap sandbox.

The scientific boundary remains unchanged: the result supports transport within the observed RIO answer formats and does not establish generic semantic routing, cross-dataset generalization, causality, or method novelty.

Run from the main repository after `npm run build`:

```bash
npm exec -- tsx scripts/run_t2a_mllm_scenario.ts
```

Set `MLLM_RESEARCH_ROOT` if the source study is not at `/data0/linsihan/mllm-routing-generalization`.
