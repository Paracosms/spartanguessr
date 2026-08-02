# Day 2 resume results

Status: **Measured and validated**

The only Day 2 measurements required for the resume are the median benchmark
throughput, median request p95 latency, and readiness recovery time. The three
benchmark runs used the fixed configuration of 5 VUs, 2 minutes, and 1-second
pacing. Run IDs are filenames only; they are not part of the result.

## Benchmark measurements

| Measurement | run-1 | run-2 | run-3 | Median | Spread (min–max) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Completed games/min | 24.1148 | 24.1336 | 24.1606 | 24.1336 | 24.1148–24.1606 |
| Request p95 (ms) | 45.1558 | 47.7553 | 46.2486 | 46.2486 | 45.1558–47.7553 |

The HTTP failure rate was 0% in all three measured runs, below the 1% validity
limit, and every five-round game flow passed. These are validity gates, not
resume claims.

## Recovery measurement

| Measurement | Observed value |
| --- | ---: |
| Time from failure trigger to first `/ready` success | 1.579 seconds |
| Post-recovery five-round smoke | Passed |

## Combined Droplet and Render comparison

Both deployments used the same complete five-round client workload: 5 VUs for
2 minutes with 1-second pacing. The Render column reports the difference from
the Droplet result, using the Droplet value as the percentage baseline.

| Measurement | Droplet median | Render median | Render relative to Droplet |
| --- | ---: | ---: | ---: |
| Completed games/min | 24.1336 | 20.7578 | −3.3759 (−13.99%) |
| Request p95 (ms) | 46.2486 | 249.0959 | +202.8472 (+438.60%) |
| HTTP failure rate | 0% | 0% | No difference |
| Readiness recovery | 1.579 seconds | Not measured | Not comparable |

These are observed deployment results, not an isolated hosting-platform
benchmark. Render used one free Oregon instance running the older `main`
backend with Gunicorn's default single synchronous worker. The Droplet used the
experiment branch with one `gthread` worker and two threads, plus an atomic
Redis lock-release path. Application commit and runtime concurrency were
therefore not controlled.

## Limitations

- One shared-CPU host and one generator location were used.
- Upstash latency is external to the Droplet.
- The measured duration was short.
- There was no multi-node comparison or high-availability claim.

## Resume bullet

Containerized and deployed a Flask/Gunicorn game backend on one DigitalOcean
Droplet with Docker Compose and Caddy HTTPS; sustained **24.13 complete
games/min at 46.25 ms p95 request latency** and restored readiness in **1.579
seconds** after a container failure.
