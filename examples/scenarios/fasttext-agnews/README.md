# fastText / AG News Scenario

This Scenario runs six real, single-threaded fastText trainings on the locked AG News split: unigram and bigram variants paired over seeds 11, 23, and 47. It declares its data, experiment, evaluator, analyzer, failure classes, budget, and artifact through the public Scenario SDK.

The T2b runner stages hash-verified inputs, submits the Job through the public Core Service, executes its Worker lease in an offline Bubblewrap sandbox, registers the result in CAS, and checks a Bundle v2 import into a second instance.

```bash
npm run build
npm run run:t2b
```

Raw data, the fastText binary, and transient models remain under ignored `.research-data/`. The committed source lock and validation report contain the provenance and hashes needed to audit the run.
