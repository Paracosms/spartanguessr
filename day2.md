# Day 2 — Two Replicas, Tests, and Teardown

Goal: prove multi-node operation, rolling deployment, failure recovery, and measured performance.

## Buy/provision

- [ ] Add **1× matching Basic Droplet:** `s-1vcpu-1gb`, Ubuntu 24.04 LTS, same region/VPC/config/catalog revision as Day 1.
- [ ] Add a **DigitalOcean Regional HTTP Load Balancer** with TLS termination and `/ready` health checks.
- [ ] Change the Cloud Firewall: SSH only from the admin CIDR; application HTTP only from the load balancer/VPC; no direct public app traffic.
- [ ] Point the temporary hostname to the load balancer.

## Have Codex automate

- [ ] Add the second replica and load balancer.

<details>
<summary>Prompt for Codex</summary>

```text
Extend the validated Stage 1 Terraform to Stage 2. Generate and review the plan, but do not apply it or create/delete resources without my explicit approval.

Set replica_count=2 and enable one DigitalOcean Regional HTTP Load Balancer in the same region/VPC. Both s-1vcpu-1gb Ubuntu 24.04 Droplets must use identical tags, app SHA, environment/config, Redis prefix, CDN base, and expected catalog revision. Configure TLS termination, /ready health checks, and temporary DNS to the load balancer.

Change the Cloud Firewall so SSH remains limited to admin CIDRs and backend HTTP is accepted only from the load balancer UID/VPC; remove direct public application access. Use source_load_balancer_uids where supported. Preserve Stage 1 rollback capability.

Run terraform fmt, validate, and a saved plan. Inspect the plan for unintended replacement or deletion, especially existing DNS, registry, and SSH-key resources. Return the resource delta, estimated billable additions, required inputs, deployment order, and rollback steps.
```

</details>

- [ ] Secure catalog replication.

<details>
<summary>Prompt for Codex</summary>

```text
Create or update the catalog upload workflow for two DigitalOcean replicas. The catalog is a private local file and must never enter Git, Terraform/state, cloud-init, a container image, GitHub Secrets, registry layers, logs, screenshots, or artifacts.

Implement a PowerShell upload script that:
- Accepts explicit host targets, local catalog path, expected SSH fingerprints, and expected SHA-256 revision.
- Verifies each host key before transfer.
- Copies to a temporary restricted path, then installs atomically as /opt/spartanguessr/secrets/image_catalog.json with root:spgdeploy ownership, directory mode 0750, and file mode 0440.
- Reports only host, success/failure, byte count, and SHA-256; never prints file contents.
- Verifies the container receives it read-only at /run/secrets/image_catalog.json.
- Keeps a replacement node unready until its checksum matches the expected revision.

Add safe validation/dry-run behavior and document the exact operator command. Do not access or upload the real catalog unless I explicitly provide the path and authorize transfer.
```

</details>

- [ ] Validate the trusted client-IP chain.

<details>
<summary>Prompt for Codex</summary>

```text
Implement and test the Stage 2 client-IP chain from DigitalOcean Load Balancer to Caddy to Flask.

Requirements:
- The Cloud Firewall must make the load balancer/VPC the only source of backend HTTP.
- Caddy must trust forwarded client information only from the known load-balancer/VPC source, discard untrusted incoming forwarding headers, and send Flask exactly one sanitized X-Forwarded-For value plus scheme.
- Flask must use ProxyFix(x_for=1, x_proto=1) only; do not trust forwarded host, port, or prefix.
- Preserve the Stage 1 behavior where Caddy uses the direct peer as the client.
- Do not add Cloudflare handling unless explicitly requested.

Add tests proving a forged client-supplied X-Forwarded-For cannot bypass rate limiting, six quick requests from one client yield five successes and one 429 under the default policy, and two distinct trusted clients receive independent counters. Include a deployed smoke procedure that avoids logging client IPs. Run tests and report the verified trust boundary and any DigitalOcean-specific assumption.
```

</details>

- [ ] Rolling deployment with readiness gating and rollback.

<details>
<summary>Prompt for Codex</summary>

```text
Implement the two-node rolling deployment path using the existing SHA-tagged image workflow.

For each node, sequentially:
1. Mark it draining so /ready returns 503.
2. Wait until the load balancer removes it while an external probe confirms the other node remains healthy.
3. Record the current image digest as the rollback target.
4. Pull and start the exact requested commit SHA.
5. Poll local /health and /ready.
6. Remove drain and wait for load-balancer health before touching the next node.

If any readiness check fails, restore the recorded previous digest on that node, verify it is healthy, stop the workflow, and never proceed to node 2. Record SHA, digest, node/instance ID, timestamps, drain duration, and readiness/rollback latency without logging secrets, session IDs, query strings, or client IPs.

Add a continuous complete-game/probe test for the rollout and a deliberately unhealthy test image or safe readiness flag. Acceptance: no session loss, one healthy node remains in service, failed rollout restores the prior SHA, and the live Render service remains untouched. Validate locally where possible and report any step requiring explicit deployment approval.
```

</details>

- [ ] Multi-replica and failure testing.

<details>
<summary>Prompt for Codex</summary>

```text
Create safe, bounded failure-test scripts and procedures for the two-replica DigitalOcean experiment. Never target Render, production Redis keys, R2, or resources lacking the exact experiment tag.

Test:
- Alternate every request of one game between both nodes; shared state/results must remain correct without sticky sessions.
- Submit two concurrent guesses for one round; exactly one state transition must be stored.
- Kill only the experiment backend container and measure restart/LB removal/rejoin.
- Drain one node, restart Docker, and verify automatic recovery.
- Drain and reboot one Droplet; the survivor must serve traffic and the rebooted node must rejoin.
- Destroy only one explicitly selected Terraform-managed replica during a continuous probe, then recreate it from the reviewed plan.
- On a drained node only, temporarily block its resolved Upstash destination with an exact, time-bounded rule and cleanup trap; /health stays 200, /ready becomes 503, game calls fail cleanly, and readiness recovers after removal.
- Deploy an unhealthy image and verify automatic rollback.

Every destructive step must require explicit confirmation and exact resource IDs. Capture sanitized probe timelines and recovery metrics. Scripts must clean up temporary firewall/stress state even on failure. Return runbooks and dry-run/static-test results; do not execute live failures without my approval.
```

</details>

- [ ] Benchmarks, reports, and cleanup audit.

<details>
<summary>Prompt for Codex</summary>

```text
Implement the minimum defensible k6 benchmark and evidence workflow for SpartanGuessr.

The main scenario must create a session, play all five rounds (get image, 1–3 second think time, submit a valid randomized guess), fetch results, and optionally read the leaderboard. Never write leaderboard data to production keys.

Provide smoke (1 VU/full game), policy-on, low-rate baseline, ramp, and a separately labeled capacity profile using a high rate limit only on isolated experiment services. For comparisons, use the same generator/path/scenario, randomize target order, run at least three repetitions, and compare medians/spread. Keep Render at safe low rates unless higher load is explicitly authorized.

Capture RPS, completed games/minute, p50/p95/p99 by operation and full game, HTTP/409/429/500 rates, Droplet CPU/memory/load/disk/network, load-balancer health, generator utilization, SHA, worker/thread settings, rate-limit mode, timestamps, and catalog revision. Discard runs where the generator is saturated.

Generate compact run manifests and sanitized summaries; do not save catalog data, coordinates, tokens, client IPs, concrete session IDs, query strings, or huge raw streams. Add a Render-versus-DigitalOcean comparison template covering effort, latency, recovery, operations, scaling, and actual/normalized cost with limitations.

Create a read-only cleanup audit that inventories exact experiment-prefixed Droplets, load balancer, volumes/snapshots, reserved IPs, registry/images, firewall, alerts, DNS/certificate, VPC, keys, and tokens. It must never mass-delete. Include reviewed Terraform destroy steps and a final dashboard/doctl zero-billable-resource checklist. Run local validation only; do not load-test, destroy, or modify cloud resources without explicit approval.
```

</details>

## Validate

- [ ] Confirm both nodes run the same SHA, environment, Redis prefix, CDN base, and catalog checksum.
- [ ] Alternate one game session between nodes; state/results must remain correct without sticky sessions.
- [ ] Verify real clients get separate rate limits and forged forwarding headers are ignored.
- [ ] Run a rolling deployment under continuous probes; no session loss or planned downtime.
- [ ] Test container failure, Docker restart, one Droplet reboot/loss, Redis loss/recovery, and an unhealthy deployment.
- [ ] Run at least three repeated full-game benchmarks; capture games/minute, RPS, p50/p95/p99, errors/429s, CPU, memory, and recovery time.
- [ ] Keep Render tests low-rate unless higher traffic is explicitly authorized. Destroy temporary larger benchmark Droplets immediately after each run.

## Finish

- [ ] Save only sanitized results: SHA/config, costs, metrics, failure/rollback timings, and limitations.
- [ ] Export billing/resource inventory and prepare the reviewed Terraform destroy plan.
- [ ] Destroy all experiment Droplets, load balancer, registry/images if experiment-only, firewall, alerts, DNS/certificate, VPC, snapshots, and reserved IPs; revoke temporary tokens/keys.
- [ ] Verify in both DigitalOcean dashboard and `doctl` that no billable experiment resources remain. A powered-off Droplet still bills.
- [ ] Keep Render available throughout and return the temporary frontend/API setting to Render if changed.
