# Sanitized Day 2 evidence

This directory is the only repository location for Day 2 evidence. Do not add
raw URLs, credentials, headers, request or response bodies, catalog records,
coordinates, client IPs, or session identifiers.

The committed files ending in '.template' are scaffolds, not evidence. After
the operator completes a step, copy and fill the corresponding non-template
filename:

- 'run-manifest.json'
- 'benchmarks/smoke-summary.json'
- 'benchmarks/run-1-summary.json'
- 'benchmarks/run-2-summary.json'
- 'benchmarks/run-3-summary.json'
- 'host/baseline.md'
- 'host/run-1.md'
- 'host/run-2.md'
- 'host/run-3.md'
- 'recovery/recovery-probe.csv'
- 'recovery/recovery-metadata.json'
- 'teardown-proof.json'
- 'experiment-results.md'

After the benchmark, host, and recovery files exist, validate them before
teardown:

~~~powershell
py -3 .\scripts\validate-day2-evidence.py --pre-teardown --evidence-dir .\evidence\day2
~~~

After Codex fills 'experiment-results.md' and the operator completes
'teardown-proof.json', run the same command without '--pre-teardown' for the
final gate.

Both modes emit only sanitized aggregate calculations. They stop on missing
files, an unexpected run count, a run-set or measured-configuration mismatch,
failed k6 thresholds, an insufficient recovery timeline, incomplete teardown
proof, unfilled result placeholders, or obvious prohibited data.
