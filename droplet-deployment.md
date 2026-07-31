# SpartanGuessr — Minimum DigitalOcean Resume Experiment

## Objective

Create the smallest defensible infrastructure project that can improve the
resume: deploy the existing Flask backend to one DigitalOcean Droplet, measure
a complete game workload, measure one recovery event, document the result,
and tear everything down.

This is a temporary experiment. It does not replace, migrate, or load-test the
existing Render deployment.

## Consolidation decision

The DeepSeek plan contributes the strongest minimum boundary: one Droplet,
manual deployment, Caddy HTTPS, focused backend safeguards, one full-game
workload, and immediate cleanup.

The Codex plan contributes the strongest evidence practices: immutable commit
identification, a run manifest, repeated measurements summarized by medians,
a bounded recovery timeline, actual cost, limitations, and a resume bullet
that claims only what was observed.

The combined plan intentionally excludes the expensive parts of both larger
proposals:

- No second replica or load balancer
- No Terraform, registry, or CI/CD
- No rolling deployment or automatic rollback
- No dedicated VPC, volumes, snapshots, or monitoring stack
- No multi-size capacity study, soak/spike suite, or broad failure injection
- No production migration and no claim of high availability

Those features can become a follow-up project only if this experiment produces
useful evidence.

## Success statement

The experiment is successful when all of the following are true:

1. A commit-identified, non-root Flask/Gunicorn image serves a complete game
   over HTTPS on one Droplet.
2. Experiment Redis keys are isolated and the catalog/secrets are not present
   in Git or image layers.
3. Three comparable full-game benchmark summaries and one container-recovery
   timeline have been captured.
4. A short result document contains measured performance, recovery, cost, and
   limitations.
5. Render remained unchanged and all DigitalOcean resources were destroyed.

## Minimum architecture

```text
Browser or k6
      |
      v
Temporary DNS
      |
      v
DigitalOcean Cloud Firewall
      |
      v
One Basic Droplet
  Caddy (HTTPS and sanitized proxy headers)
      |
      v
  Gunicorn + Flask in a non-root container
      |                         |
      v                         v
Upstash Redis             Read-only catalog mount
(experiment prefix)             |
                                v
                         Existing image CDN
```

Use the account's existing/default VPC. Target the smallest Basic Ubuntu
Droplet that passes the local runtime check, normally 1 vCPU / 1 GiB.

## Minimum repository changes

| Area | Required change | Why it is required |
|---|---|---|
| Redis keys | Require `REDIS_KEY_PREFIX=spg:do-exp:<run-id>:` for every key | Prevent experiment data from polluting existing keys |
| Health | Rate-limit-exempt `/health`; Redis-aware `/ready` | Separate process liveness from ability to serve a game |
| Proxy boundary | Caddy replaces forwarding headers; Flask trusts exactly one proxy | Preserve per-client behavior without trusting spoofed headers |
| Session lock | Atomic compare-and-delete release | Prevent an old owner from deleting a newly acquired lock |
| Container | Slim image, Gunicorn, non-root user, tight `.dockerignore` | Provide a reproducible deployable artifact without secrets |
| Compose | Only backend and Caddy; catalog mounted read-only | Keep deployment understandable and repeatable |
| Workload | One k6 complete-game script | Measure the real application flow instead of a health endpoint |

Do not add general observability, dependency-management, API, or frontend work
unless the deployment cannot proceed without it.

## Focused test gate

Before provisioning, verify only the risks introduced or exposed by this
deployment:

1. `/health` returns `200` without Redis; `/ready` returns `503`.
2. Every Redis key is under the experiment prefix.
3. A forged forwarded-IP header cannot evade rate limiting.
4. A stale lock owner cannot release a newly acquired lock.
5. One five-round game completes with consistent results.
6. Two concurrent guesses for one round create one state transition.
7. The catalog and credentials are absent from the image.

The existing backend suite must continue to pass.

## Deployment procedure

1. Record a clean commit SHA.
2. Build and smoke-test the image locally.
3. Create one Basic Ubuntu Droplet and one Cloud Firewall. Restrict SSH to the
   administrator CIDR; expose only HTTP/HTTPS publicly.
4. Install Docker Engine and Compose from the official repository.
5. Copy the exact committed deployment source to `/opt/spartanguessr`.
6. Upload the catalog separately, lock down its permissions, and mount it
   read-only.
7. Create a non-committed environment file with Upstash credentials, catalog
   path, CDN base URL, allowed origin, commit SHA, and unique Redis prefix.
8. Point a temporary hostname to the Droplet and start Compose.
9. Verify HTTPS, `/health`, `/ready`, a full game, proxy-header behavior, and
   prefixed Redis keys.

Building on the host is acceptable for this experiment because the exact
source SHA and resulting image ID are recorded. A registry is unnecessary.

## Measurement procedure

Use one k6 script: create a session, play five valid rounds, and fetch results.
Do not write leaderboard entries.

Run:

- One unmeasured 1-VU smoke check
- One short paced 5-VU scenario, repeated three times without changing the
  image, catalog, generator, or settings
- One container kill while an external 1 Hz readiness probe is running

Capture:

- Completed games/minute and requests/second
- p50/p95 request duration
- HTTP error and `429` rates
- Droplet CPU/memory snapshots
- Container time-to-health and time-to-ready
- Commit SHA, image ID, catalog checksum, configuration, generator location,
  timestamps, and actual cost

Stop the load test at more than `1%` server errors, generator saturation, or
unusable game behavior. Report the median and spread of the three runs, not
the best run.

## Evidence to keep

Keep the Docker/Compose/Caddy files, focused tests, k6 source, a sanitized run
manifest, three summaries, one recovery timeline, a one-page result, actual
cost, and teardown confirmation.

Do not keep secrets, `.env` files, raw catalog data, coordinates, session IDs,
raw response bodies, or large metric streams.

Suggested resume bullet:

> Containerized and deployed a Flask/Gunicorn game backend on a DigitalOcean
> Droplet with Docker Compose, Caddy HTTPS, and shared Redis; sustained
> **[X] complete games/min at [Y] ms p95 request latency** and restored
> readiness in **[Z] seconds** after a container failure.

This wording must be filled with observed values and paired with the
one-Droplet and short-duration limitations.

## Two-day schedule

### Day 1

- Isolate the experiment branch and add the focused safeguards/tests.
- Add the container, Compose, and Caddy configuration.
- Run the local gate.
- Provision one Droplet, deploy manually, and pass the public full-game test.

### Day 2

- Freeze the run configuration and execute three benchmark repetitions.
- Measure one container restart.
- Write the result, resume bullet, cost, and limitations.
- Export sanitized evidence and destroy all experiment resources.

See `day1.md` and `day2.md` for the executable checklists.

## Cleanup

1. Export and inspect the sanitized evidence.
2. Destroy the Droplet rather than powering it off.
3. Delete the Cloud Firewall and temporary DNS record.
4. Revoke temporary credentials.
5. Confirm in the DigitalOcean dashboard that no experiment resource remains
   billable.
6. Confirm the Render service and its frontend endpoint were never changed.

## Definition of done

- [ ] One public, HTTPS, full-game deployment was demonstrated.
- [ ] Redis isolation, proxy behavior, atomic locking, and catalog secrecy were
      verified.
- [ ] Three benchmark summaries and one recovery timeline were captured.
- [ ] A measured resume bullet, one-page result, cost, and limitations exist.
- [ ] Render was unchanged.
- [ ] All experiment resources were destroyed.

## Optional follow-up

If the result is useful and another project is warranted, the next coherent
step is two identical Droplets behind a managed load balancer, with Terraform
and a single-versus-dual-replica comparison. It is not a requirement for this
resume experiment.
