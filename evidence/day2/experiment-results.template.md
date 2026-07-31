# Day 2 experiment results

Status: **[NOT MEASURED — operator evidence and teardown proof required]**

## Scope and architecture

This was a one-Droplet experiment: Caddy terminated HTTPS and proxied to a
non-root Gunicorn/Flask backend in Docker Compose. The backend used the
experiment's isolated Redis prefix and a read-only catalog mount.

This section is architecture context, not a high-availability or
multi-node-performance claim.

## Frozen manifest

Source: 'run-manifest.json'

| Field | Recorded value |
| --- | --- |
| Run-set ID | [NOT MEASURED] |
| Target label | [NOT MEASURED — sanitized label required] |
| Commit SHA | [NOT MEASURED] |
| Image ID | [NOT MEASURED] |
| Catalog revision | [NOT MEASURED] |
| Droplet size / region | [NOT MEASURED] |
| Generator location | [NOT MEASURED] |
| Rate-limit mode | [NOT MEASURED] |
| Measured configuration | [NOT MEASURED] |

## Benchmark measurements

Source: the three files in 'benchmarks/'. The smoke run is intentionally
excluded from this table.

| Run | Completed games/min | Requests/sec | Request p50 (ms) | Request p95 (ms) | HTTP failure rate | HTTP 429 count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| run-1 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| run-2 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| run-3 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| Median | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| Spread (min–max) | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |

## Host snapshots

Source: sanitized operator notes captured before, during, or immediately after
the runs.

| Snapshot | CPU | Memory | Notes |
| --- | ---: | ---: | --- |
| Baseline | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| run-1 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| run-2 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |
| run-3 | [NOT MEASURED] | [NOT MEASURED] | [NOT MEASURED] |

## Recovery measurement

Source: 'recovery/recovery-probe.csv' and
'recovery/recovery-metadata.json'.

| Measure | Observed value |
| --- | --- |
| Public probe error count | [NOT MEASURED] |
| Time from failure trigger to first '/health' success | [NOT MEASURED] |
| Time from failure trigger to first '/ready' success | [NOT MEASURED] |
| Container restart count | [NOT MEASURED] |
| Post-recovery five-round smoke | [NOT MEASURED] |

## Cost and teardown proof

Source: 'teardown-proof.json'.

| Measure | Observed value |
| --- | --- |
| Droplet creation time | [NOT MEASURED] |
| Experiment start / end | [NOT MEASURED] |
| Experiment duration | [NOT MEASURED] |
| Actual DigitalOcean cost | [NOT MEASURED] |
| Resource types before teardown | [NOT MEASURED] |
| Droplet destroyed | [NOT MEASURED] |
| Firewall deleted | [NOT MEASURED] |
| Temporary DNS record deleted | [NOT MEASURED] |
| Temporary API token | [NOT MEASURED] |
| No remaining experiment resources | [NOT MEASURED] |
| Render baseline unchanged | [NOT MEASURED] |

## Limitations

- One shared-CPU host and one generator location were used.
- Upstash latency is external to the Droplet.
- The measured duration is short.
- There is no multi-node comparison or high-availability claim.
- This document must report the median and spread of all three measured runs,
  never the best run alone.

## Render versus Droplet operations note

Render remained the baseline service. The temporary Droplet experiment used a
separate Docker Compose and Caddy operational path. This is an operations
comparison only; it makes no unsupported performance comparison with Render.

## Resume bullet

**[NOT ELIGIBLE UNTIL MEASURED VALUES EXIST]** Containerized and deployed a
Flask/Gunicorn game backend on one DigitalOcean Droplet with Docker Compose,
Caddy HTTPS, and shared Redis; sustained **[NOT MEASURED] complete games/min
at [NOT MEASURED] ms p95 request latency** and restored readiness in
**[NOT MEASURED] seconds** after a container failure.

Use the median of the three measured runs for throughput and request latency,
not the best run.

## Two-minute walkthrough outline

1. State the narrow one-Droplet objective and the safety boundaries.
2. Show the Docker Compose/Caddy/Gunicorn path and Redis-key isolation.
3. Explain the normal five-round workload and the three matching measured runs.
4. Show the bounded recovery timeline and post-recovery smoke result.
5. Close with actual cost, teardown proof, and the limitations above.
