# Day 1 — Single Droplet

Goal: a secure, reproducible single-node deployment without changing the live Render service.

## Before buying

- [ ] Confirm DigitalOcean credit/limits, Upstash region, temporary hostname/DNS, admin IP/CIDR, SSH key, and private catalog source.
- [ ] Record the current Render plan/start command for later comparison.
- [ ] Use a clean experiment branch/worktree. Do not include `Heatmap.tsx`, coordinates, the catalog, credentials, Terraform state, or unrelated edits.

## Buy/provision

- [ ] **1× Basic Droplet:** `s-1vcpu-1gb`, Ubuntu 24.04 LTS, `sfo3` (use a nearer region only if Upstash is materially closer).
- [ ] Create a dedicated VPC, experiment tags, free Cloud Firewall, and monitoring.
- [ ] Use an existing private registry or DOCR Basic. Deploy images by commit SHA, never `latest`.
- [ ] Do **not** buy a volume or NAT gateway.
- [ ] Firewall: SSH (`22`) only from the admin CIDR; HTTP/HTTPS (`80/443`) public.

## Have Codex automate

- [ ] Backend production and proxy safety.

<details>
<summary>Prompt for Codex</summary>

```text
Prepare the Flask backend for the DigitalOcean experiment. Inspect the current backend and tests before editing; preserve the existing API and game behavior.

Implement:
- Provider-neutral environment validation for the existing Upstash URL/token, catalog path, CDN base URL, exact allowed frontend origin(s), APP_VERSION, INSTANCE_ID, REDIS_KEY_PREFIX, and configurable rate-limit values.
- ProxyFix with exactly x_for=1 and x_proto=1. Flask must trust only one X-Forwarded-For value sanitized by Caddy; do not trust forwarded host, port, or prefix.
- /health as rate-limit-exempt liveness that does not depend on Redis.
- /ready as rate-limit-exempt readiness that returns 503 when Redis is unavailable, the node is draining, or required startup state is unavailable.
- Safe structured request logs containing timestamp, request ID, method, route template, status, duration, app version, and instance ID. Never log concrete session IDs, query strings, bodies, coordinates, client IPs, tokens, or environment values.
- Exact CORS origins only, controlled JSON 503 responses for Redis failures, and rejection of NaN/infinite/out-of-map coordinates.

Add or update focused tests, run the relevant test suite, and report changed files and commands/results. Do not modify the frontend, expose the private catalog, provision infrastructure, or change the live Render deployment.
```

</details>

- [ ] Redis isolation and atomic locking.

<details>
<summary>Prompt for Codex</summary>

```text
Make Redis safe for an isolated multi-replica DigitalOcean experiment. First inventory every Redis key used for sessions, guesses, locks, leaderboard data, and rate limits.

Implement one required REDIS_KEY_PREFIX that is consistently applied to every application-owned key; use an experiment value such as spg:do-exp:<run-id>: and preserve existing TTL behavior. Replace lock release's non-atomic GET-then-DELETE with a Lua compare-and-delete operation so an expired lock reacquired by another worker cannot be deleted by the previous owner.

Add tests proving:
- No experiment operation reads or writes an unprefixed/production key.
- Only the lock owner can release a lock.
- An expired and reacquired lock survives the old owner's release attempt.
- Concurrent submissions for one round produce one valid state transition.

Assess the separate guess/session writes and global leaderboard operations for races. Do not redesign them unless a reproducible test fails; if one does, implement the smallest atomic Lua operation or lock needed and document the reason. Do not connect tests to production keys or run destructive Redis commands. Run tests and report evidence.
```

</details>

- [ ] Backend and functional test coverage.

<details>
<summary>Prompt for Codex</summary>

```text
Expand the backend test suite for the production and replica-safety changes. Reuse current fixtures and preserve existing API contracts.

Cover at minimum:
- Trusted single-hop proxy handling, spoofed forwarding headers, and separate rate-limit counters for two real clients.
- Exact CORS behavior.
- /health always serving liveness without the user rate limit; /ready returning 503 for Redis loss or drain and recovering afterward.
- REDIS_KEY_PREFIX coverage for every key family.
- Atomic lock release and two concurrent guesses for the same round.
- A complete normal game and leaderboard game, including idempotent image retrieval, score reconciliation, duplicate submission rejection, and no client-supplied leaderboard score.
- Catalog secrecy: opaque image keys before a guess and coordinates only after submission.
- Invalid/missing inputs, including strings, NaN, infinity, out-of-map coordinates, oversized names, wrong rounds, and unknown sessions.
- APP_VERSION/INSTANCE_ID behavior and controlled Redis error responses.

Correct misleading test names where appropriate. Run all backend and migration tests, plus compile/lint checks already supported by the repo. Do not weaken assertions to make failures pass. Return a concise test summary and list any remaining untested risk.
```

</details>

- [ ] Reproducible container and local runtime.

<details>
<summary>Prompt for Codex</summary>

```text
Create the minimum production container runtime for the Flask backend behind Caddy.

Add:
- A small non-root backend Dockerfile and .dockerignore. The image must contain no .env files, Terraform data, catalog, coordinates, test artifacts, or credentials.
- Pinned production and development dependencies/lock files, keeping test-only packages out of the runtime image.
- Gunicorn configuration using gthread, 2 workers, 4 threads each, bind 0.0.0.0:8000, timeout/graceful_timeout 30s, keepalive 5s, max_requests 1000 with jitter 100, stdout/stderr error logging, and no raw access log.
- Compose services for backend and Caddy with restart: unless-stopped. Do not publish backend port 8000 to the host.
- A read-only catalog mount from /opt/spartanguessr/secrets/image_catalog.json to /run/secrets/image_catalog.json.
- A Caddy configuration for HTTPS and forwarding exactly one sanitized client IP value to Flask. Do not trust arbitrary incoming forwarded headers.

Validate the Docker build, compose config with --quiet, health/readiness, non-root UID, read-only secret mount, graceful stop, and local smoke flow. Report image size/digest and verification results. Never copy or print the real catalog or secrets.
```

</details>

- [ ] Terraform and hardened single-Droplet infrastructure.

<details>
<summary>Prompt for Codex</summary>

```text
Implement Terraform and cloud-init for Stage 1 of the DigitalOcean experiment. Generate and validate the code, but do not run terraform apply or create/delete cloud resources without my explicit approval.

Defaults:
- Experiment-prefixed project/tags with an expiry date.
- Region sfo3 unless the configured Upstash region justifies another.
- One s-1vcpu-1gb Droplet running ubuntu-24-04-x64 in a dedicated non-overlapping VPC.
- Cloud Firewall: SSH only from supplied admin CIDRs; public 80/443; minimum required outbound DNS/NTP/HTTP/HTTPS.
- Free DigitalOcean monitoring and alerts.
- Existing registry, DNS zone, and SSH key treated as data sources when present; optional private DOCR and DNS/certificate resources.
- No block volume and no NAT gateway.

Cloud-init must create non-root spgadmin (SSH key + sudo) and minimally privileged spgdeploy users; disable root/password/empty-password SSH; install Docker from its official apt repository and Compose; enable unattended security updates and systemd-timesyncd; configure UFW default deny, log retention, restart behavior, secure catalog directories, and the monitoring agent. Never publish backend port 8000.

Use provider/version pins, validated variables, local encrypted-state guidance, .gitignore entries for state/plans/secrets, exact resource outputs, and safe destroy-plan instructions. Run terraform fmt -check, init without applying, validate, and any static checks available. Return validation results and the exact inputs still required from me.
```

</details>

- [ ] CI/CD, rollback, smoke tests, and cleanup inventory.

<details>
<summary>Prompt for Codex</summary>

```text
Build the minimum CI/CD and operational scripts for the DigitalOcean experiment without changing or deploying the live Render service.

Create:
- backend-ci.yml for relevant pull requests/pushes: exact checkout, Python 3.12, hashed dev dependency install, backend/migration tests with JUnit output, Docker build, and Terraform format/validation.
- deploy-digitalocean.yml as a manually approved digitalocean-experiment deployment: accept exact commit SHA/stage/hosts/catalog revision/optional rollback SHA; build, scan, tag, and push registry.digitalocean.com/<registry>/spartanguessr-backend:<full-sha>; never deploy latest.
- A deploy script that records the previous digest, pulls the exact SHA, starts it, polls local /health and /ready, and automatically restores the previous SHA if readiness fails.
- Smoke and full-game checks plus a read-only cleanup script that only inventories exact experiment tags/prefixes and never mass-deletes.

Use short-lived registry credentials and pinned third-party action SHAs. Required protected values may include DIGITALOCEAN_ACCESS_TOKEN, DO_SSH_PRIVATE_KEY, DO_KNOWN_HOSTS, DO_REGISTRY_NAME, and host IDs/IPs. The build job must not receive the Upstash token or catalog. Disable secret tracing; never print compose-expanded secrets, session IDs, query URLs, IPs, or tokens.

Validate workflow syntax and scripts locally where possible. Include a safe procedure for deliberately failed readiness and proven automatic rollback. Report files, required GitHub configuration, and verification results; do not push, deploy, rotate credentials, or provision resources without explicit approval.
```

</details>

## Configure/deploy

- [ ] Set experiment-only environment values: Upstash credentials, `REDIS_KEY_PREFIX=spg:do-exp:<run-id>:`, catalog path, CDN base URL, exact frontend origin, app version, and instance ID.
- [ ] Upload the catalog separately to `/opt/spartanguessr/secrets/image_catalog.json`; set `root:spgdeploy`, mode `0440`; mount read-only at `/run/secrets/image_catalog.json`.
- [ ] Never place secrets or the catalog in Git, Terraform/cloud-init, the image/registry, CI logs, or screenshots.
- [ ] Run Terraform `fmt`, `validate`, reviewed `plan`, then `apply`.
- [ ] Verify HTTPS, `/health`, `/ready`, correct client IP/rate limiting, full game flow, reboot recovery, and failed-deploy rollback.
- [ ] Record the deployed SHA, image digest, catalog checksum, basic latency/error results, and current spend.

## End-of-day gate

- [ ] One healthy Droplet serves the temporary hostname; Render is unchanged.
- [ ] Tests pass, Redis keys are isolated, catalog data is not exposed, rollback works, and no unexplained alerts remain.
