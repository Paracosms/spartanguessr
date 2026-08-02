# Render benchmark results

Status: **Benchmark measured and validated; recovery not measured**

The Render benchmark used the same complete five-round workload and fixed
configuration as the Droplet experiment: 5 VUs, 2 minutes, 1-second pacing,
and three measured runs. The median of the three runs is the reported value.

The tested deployment was one free Render instance in Oregon running the older
`main` backend with the start command `gunicorn app:app`.

## Benchmark measurements

| Measurement | run-1 | run-2 | run-3 | Median | Spread (min–max) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Completed games/min | 20.7403 | 20.8376 | 20.7578 | 20.7578 | 20.7403–20.8376 |
| Request p95 (ms) | 249.0959 | 248.1672 | 255.7261 | 249.0959 | 248.1672–255.7261 |

The HTTP failure rate was 0% in all three measured runs, below the 1% validity
limit, and every five-round game flow passed. These are validity gates, not
maximum-capacity claims.

## Recovery measurement

| Measurement | Observed value |
| --- | ---: |
| Time from application-process failure trigger to first `/ready` success | Not measured |
| Post-recovery five-round smoke | Not measured |

The free Render service had no `/ready` endpoint and no shell access for
triggering the same abrupt application-process failure, so readiness recovery
was not measurable. A normal Render service restart is a zero-downtime
replacement and was not substituted for this test.

## Limitations

- One free Render instance in Oregon and one generator location were used.
- The deployment ran the older `main` backend, not the Droplet experiment
  commit.
- Render used Gunicorn's default single synchronous worker through
  `gunicorn app:app`; the Droplet used one `gthread` worker with two threads.
- The Droplet branch also used an atomic Redis lock release that removes one
  Upstash operation from each locked request compared with the older backend.
- Upstash latency was external to Render.
- The measured duration was short and the workload was intentionally paced.
- There was no recovery, multi-node, maximum-capacity, or high-availability
  claim.

## Resume bullet

The tested free Render deployment sustained **20.76 complete games/min at
249.10 ms p95 request latency** with a 0% HTTP failure rate under the fixed
warm workload.

## Comparison note

These values can be compared with the Droplet values as observed deployment
results under the same client workload. Differences must not be attributed to
the hosting platforms alone because the application commit and Gunicorn
concurrency configuration were not held constant.
