# Day 1 — Implement and Deploy the Minimum Experiment

## End-of-day outcome

One small DigitalOcean Droplet serves the existing Flask backend over HTTPS at
a temporary hostname. A complete game works through a smoke script, experiment
Redis keys are isolated, and Render remains unchanged.

## Responsibility boundary

Codex can inspect and edit this repository, run local tests, build containers
when Docker is available, and create scripts and documentation.

You must perform account and secret-bearing work:

- Inspect Render without changing it
- Create and configure DigitalOcean resources
- Choose DNS, regions, account plans, and credentials
- Enter secrets and upload the private catalog
- Run SSH/deployment commands against the Droplet
- Confirm public behavior and billing

Never paste secret values, catalog contents, or private keys into a Codex
prompt. Give Codex only sanitized errors and command output.

## Scope guard

Required: one Droplet, Docker Compose, Flask/Gunicorn, Caddy HTTPS, a read-only
catalog mount, isolated Redis keys, focused tests, and one public smoke test.

Not required: a second Droplet, load balancer, Terraform, registry, CI/CD,
automatic rollback, dedicated VPC, volumes, snapshots, or frontend redesign.

## 1. Your preflight

### 1.1 Preserve the Render baseline

1. Open the existing service in the Render Dashboard.
2. Record the public URL, region, instance type, deployed branch/commit, build
   command, start command, and health-check path.
3. Record environment variable **names only**, never their values.
4. Open the public Render URL and confirm it still responds.
5. Do not save settings, redeploy, restart, change DNS, or change environment
   variables.

Render reference: [Web Services](https://render.com/docs/web-services).

### 1.2 Prepare local operator inputs

1. Run `git status --short` and preserve unrelated work.
2. Decide whether to use the current branch or a clean experiment branch.
3. Confirm you possess:
   - A DigitalOcean account and SSH public key
   - Your current public IPv4 address for an SSH `/32` firewall rule
   - A temporary hostname you control
   - Upstash URL/token and the private catalog file
4. Choose a unique run ID such as `2026-07-30-a`.
5. Derive `REDIS_KEY_PREFIX=spg:do-exp:<run-id>:` and record it in a private
   operator note.

## 2. Codex prompt — finish backend deployment safeguards

Copy the prompt below into Codex from the repository root:

```text
Prepare the existing Flask backend for the minimum one-Droplet experiment.

First inspect backend/app.py, backend/tests.py, the current git diff, and all
Redis key construction. Existing uncommitted hardening may already implement
some requirements. Preserve correct existing work, unrelated user changes,
the API contract, scoring, and frontend behavior. Make the smallest necessary
patch; do not rewrite the backend.

Required behavior:
1. Require REDIS_KEY_PREFIX and apply it to every application Redis key:
   sessions, guesses, locks, leaderboards, and rate-limit counters.
2. Keep /health rate-limit-exempt and independent of Redis. Make /ready
   rate-limit-exempt and return JSON 503 when required configuration, catalog
   startup state, drain state, or Redis is unavailable.
3. Configure Flask for exactly one trusted Caddy hop with
   ProxyFix(x_for=1, x_proto=1). Do not trust forwarded host, port, or prefix.
4. Replace lock release GET-then-DELETE with an atomic compare-and-delete
   operation so a stale owner cannot delete a reacquired lock.
5. Preserve controlled JSON Redis errors and reject non-numeric, NaN,
   infinite, and out-of-map coordinates.
6. Do not log secrets, catalog content, coordinates, request bodies, query
   strings, client IPs, or concrete session identifiers.

Add or retain focused tests proving:
- /health stays 200 when Redis is unavailable and /ready becomes 503.
- Every Redis key family uses the configured prefix.
- ProxyFix consumes exactly one proxy-supplied client value and does not trust
  forwarded host, port, or prefix. The Caddy integration test below owns
  rejection of client-supplied forwarding headers.
- An old lock owner cannot release a newly acquired lock.
- One normal five-round game completes with reconciled results.
- Two concurrent guesses for one round create exactly one state transition.

Run the full backend test suite and any existing migration tests. Do not
connect to real Upstash, provision infrastructure, access Render or
DigitalOcean, use real secrets/catalog data, or modify the frontend.

Return:
- Files changed and why
- Exact test commands and results
- Any unmet requirement or manual configuration value
- A concise residual-risk list
```

### Your acceptance check

1. Read Codex's changed-file list and residual risks.
2. Run `git diff --check`.
3. Confirm no `.env`, token, catalog, coordinate dataset, or generated test
   output entered the diff.
4. Do not continue until the backend tests pass.

## 3. Codex prompt — add the minimum container runtime

After the backend gate passes, give Codex this prompt:

```text
Add the minimum reproducible runtime for the one-Droplet experiment. Inspect
the repository and current diff first. Preserve unrelated user changes and
use the existing Flask app import path and dependency layout.

Create or finish:
- A slim backend Dockerfile running Gunicorn as a non-root user.
- A .dockerignore appropriate to the selected build context. Exclude .env
  files, credentials, private catalogs, Git data, caches, tests, and docs from
  image layers.
- A small Gunicorn configuration appropriate for a 1 vCPU / 1 GiB host.
- compose.yaml with only backend and caddy services, restart:
  unless-stopped, a read-only catalog mount, and no published backend port.
  Publish only 80 and 443 through Caddy.
- A Caddyfile that obtains HTTPS for the configured hostname, replaces
  untrusted incoming forwarding headers, and sends Flask exactly one
  X-Forwarded-For value plus the original scheme.
- .env.example containing variable names and safe placeholders only.
- A dependency-free smoke script under scripts/ that accepts a base URL,
  creates a normal session, plays five valid rounds using the actual API
  contract, fetches results, and exits nonzero on any inconsistency. It must
  never print session IDs, coordinates, tokens, or response bodies.

Validate locally where the environment permits:
- backend tests
- docker compose config
- image build
- container user is non-root
- /health and /ready
- a request carrying a forged X-Forwarded-For through local Caddy does not
  create a different rate-limit identity
- the smoke script against the local Compose stack using disposable fake
  credentials/catalog fixtures only

Never add a real hostname, IP, token, catalog, or .env file. Do not access
DigitalOcean, Render, Upstash production data, or external DNS. Do not create
Terraform, CI/CD, registry, or load-balancer files.

Return:
- Files changed
- Exact validation commands and results
- Expected catalog mount source/target
- Required environment variable names
- Exact build, start, status, and smoke commands for the operator
- Anything the operator must still do manually
```

### Your local gate

1. Review `.env.example`; it must contain no usable secret.
2. Confirm the private catalog is ignored and absent from image layers.
3. Run the validation commands Codex reports.
4. Commit the reviewed experiment implementation and record the full SHA.

## 4. Your DigitalOcean setup

These steps intentionally remain manual.

### 4.1 Create one Droplet

1. In the DigitalOcean Control Panel, select **Create → Droplets**.
2. Choose a region reasonably close to Upstash and the expected tester.
3. Choose Ubuntu 24.04 LTS and the smallest Basic plan that satisfies the
   local runtime check; target 1 vCPU / 1 GiB.
4. Use the existing/default VPC.
5. Select SSH-key authentication and attach your key. Do not enable password
   login.
6. Create exactly one Droplet. Do not add backups, volumes, a load balancer,
   or a container registry.
7. Name/tag it clearly as temporary, for example `spg-resume-exp`.
8. Record its public IPv4 address, region, size, and creation time.

DigitalOcean reference:
[Create a Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/).

### 4.2 Create the Cloud Firewall

1. Open **Networking → Firewalls → Create Firewall**.
2. Add inbound SSH/TCP `22` from only your current public IPv4 `/32`.
3. Add inbound HTTP/TCP `80` from all IPv4 and IPv6 sources.
4. Add inbound HTTPS/TCP `443` from all IPv4 and IPv6 sources.
5. Keep the default outbound rules so DNS, package installation, HTTPS,
   Upstash, and the image CDN remain reachable.
6. Apply the firewall only to the experiment Droplet or its unique tag.
7. Remove any default SSH-from-everywhere rule before saving.

DigitalOcean references:
[Create a firewall](https://docs.digitalocean.com/products/networking/firewalls/how-to/create/)
and
[configure rules](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/).

### 4.3 Point temporary DNS at the Droplet

1. At the authoritative DNS provider, create an `A` record for the temporary
   hostname pointing to the Droplet IPv4 address.
2. Use a short TTL, such as five minutes, if your provider offers it.
3. Do not create an `AAAA` record unless the Droplet is configured for IPv6.
4. Wait until the hostname resolves to the recorded IPv4 address.
5. Do not change the Render hostname or the production frontend endpoint.

If DigitalOcean hosts the zone, use
[Manage DNS records](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/).

## 5. Your server installation and deployment

### 5.1 Connect and install Docker

1. SSH to the Droplet and verify the host fingerprint before accepting it.
2. Follow Docker's current Ubuntu `apt` repository procedure:
   [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
3. On a fresh Ubuntu host, the essential commands are:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl status docker --no-pager
sudo docker run --rm hello-world
sudo docker compose version
```

If Docker's official page has changed, follow the page rather than this copied
command block.

### 5.2 Upload only committed source and the catalog

From local PowerShell, substitute the Droplet IP and catalog path:

```powershell
$deployArchive = Join-Path $env:TEMP "spartanguessr-deploy.tar.gz"
git archive --format=tar.gz --output=$deployArchive HEAD
scp $deployArchive root@<DROPLET_IP>:/tmp/spartanguessr-deploy.tar.gz
scp <PRIVATE_CATALOG_PATH> root@<DROPLET_IP>:/tmp/image_catalog.json
```

On the Droplet:

```bash
sudo install -d -m 0750 /opt/spartanguessr
sudo tar -xzf /tmp/spartanguessr-deploy.tar.gz -C /opt/spartanguessr
sudo install -d -m 0750 /opt/spartanguessr/secrets
sudo install -m 0440 -o root -g 10001 /tmp/image_catalog.json \
  /opt/spartanguessr/secrets/image_catalog.json
rm /tmp/spartanguessr-deploy.tar.gz /tmp/image_catalog.json
```

Do not upload the working tree, `.git`, `.env`, private key, or unrelated
files.

### 5.3 Create private runtime configuration

1. Create `/opt/spartanguessr/.env` with mode `0600`.
2. Fill the variable names produced by Codex. Expected values include:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `IMAGE_CATALOG_PATH`
   - `IMAGE_CDN_BASE_URL`
   - `ALLOWED_ORIGINS` or the compatible singular variable, set to one exact
     frontend/preview origin and never `*`
   - `APP_VERSION=<full-commit-sha>`
   - `INSTANCE_ID=do-single-1`
   - `REDIS_KEY_PREFIX=spg:do-exp:<run-id>:`
   - Experiment rate-limit settings
   - Caddy's temporary hostname variable, if the generated config uses one
3. Never paste this file into chat, logs, Git, or screenshots.

### 5.4 Start and inspect

```bash
cd /opt/spartanguessr
sudo docker compose --env-file .env config --quiet
sudo docker compose --env-file .env up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100
```

Inspect logs locally for errors, but do not send unsanitized output to Codex.

## 6. Your public acceptance check

1. From your computer, request `https://<TEMP_HOSTNAME>/health`.
2. Request `https://<TEMP_HOSTNAME>/ready`; both must return `200`.
3. Run the Codex-created smoke script against the HTTPS hostname.
4. Send a request with a fake `X-Forwarded-For` and confirm the Caddy/Flask
   test behavior remains unchanged.
5. Inspect Upstash manually and confirm new keys begin with the experiment
   prefix. Do not delete or inspect unrelated keys.
6. In the DigitalOcean console, record Droplet size/region and current spend.
7. Reopen the recorded Render URL and confirm it remains healthy and on the
   recorded deployment.
8. Record only: hostname, commit SHA, image ID, catalog checksum, start time,
   and sanitized issues.

## Day 1 gate

- [ ] Backend tests pass.
- [ ] Public `/health`, `/ready`, and five-round smoke flow pass.
- [ ] Redis keys are isolated.
- [ ] Secrets/catalog are absent from Git and image layers.
- [ ] Render is unchanged.
