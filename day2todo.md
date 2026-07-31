# Day 2 Operator Todo

Day 2 is not complete yet. The local benchmark, recovery probe, evidence
templates, validation helpers, and operator runbook are ready, but the real
operator evidence and teardown proof still have to be produced.

Run every section below in order from the repository root. Do not run the
measured scenario against Render.

## 1. Public preflight - first manual checkpoint

- [ ] Set the temporary experiment hostname.
- [ ] Confirm `/health` returns `200`.
- [ ] Confirm `/ready` returns `200`.
- [ ] Confirm the existing five-round smoke script reports `PASS`.

```powershell
$env:TARGET_BASE_URL = "https://<TEMP_HOSTNAME>"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
py -3 .\scripts\smoke.py $env:TARGET_BASE_URL
```

Stop if either status is not `200` or the smoke test does not pass.

This is the first operator-only checkpoint. Codex cannot safely perform it
because it requires contacting an external endpoint.

## 2. Freeze the run manifest

- [ ] Record a sanitized run-set ID and target label.
- [ ] Record the deployed commit SHA and image ID.
- [ ] Record the catalog revision.
- [ ] Record the Droplet size and region.
- [ ] Record the generator location.
- [ ] Record the isolated Redis prefix label.
- [ ] Record the rate-limit mode, request count, and window in seconds.
- [ ] Record the measured configuration: `5` VUs, `2m`, and `1` second pacing.
- [ ] Set `evidence_status` to `sanitized`.
- [ ] Replace every template placeholder.

```powershell
Copy-Item .\evidence\day2\run-manifest.template.json .\evidence\day2\run-manifest.json
notepad .\evidence\day2\run-manifest.json
$env:RUN_SET_ID = "<RUN_SET_ID_FROM_MANIFEST>"
```

After freezing the manifest, do not rebuild, redeploy, change the catalog, or
change runtime settings until the experiment is finished.

## 3. Verify k6 and run the unmeasured smoke

- [ ] Verify k6 is installed.
- [ ] If it is missing, install it manually.

```powershell
k6 version

# Run these only if k6 is unavailable.
winget install k6 --source winget
k6 version
```

- [ ] Run the one-VU smoke scenario.

```powershell
$env:RUN_ID = "smoke"
$env:K6_SCENARIO = "smoke"
$env:K6_VUS = "1"
$env:K6_DURATION = "30s"
$env:K6_PAUSE_SECONDS = "1"
k6 run .\load-tests\game.js
```

Expected output:

```text
evidence/day2/benchmarks/smoke-summary.json
```

The smoke result is a safety check. Do not include it as one of the three
measured results. Stop if k6 exits nonzero.

## 4. Run three identical measured tests

- [ ] Set the shared measured configuration once.

```powershell
$env:TARGET_BASE_URL = "https://<TEMP_HOSTNAME>"
$env:K6_SCENARIO = "measured"
$env:K6_VUS = "5"
$env:K6_DURATION = "2m"
$env:K6_PAUSE_SECONDS = "1"
$cooldownSeconds = 30

New-Item -ItemType Directory -Force .\evidence\day2\host | Out-Null
```

- [ ] Capture the baseline UTC time, CPU, and memory values.

```powershell
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\baseline.md
```

The note may contain only the UTC capture time, CPU percentage, memory usage,
and a short operator observation. Do not include the SSH command, host address,
container IDs, image IDs, raw URLs, or environment data.

### Run 1

- [ ] Confirm the Droplet is healthy and no other test is active.
- [ ] Run `run-1`.
- [ ] Capture the sanitized host snapshot.
- [ ] Wait exactly 30 seconds.

```powershell
$env:RUN_ID = "run-1"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-1 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-1.md
Start-Sleep -Seconds $cooldownSeconds
```

### Run 2

- [ ] Confirm the Droplet is healthy and no other test is active.
- [ ] Run `run-2` without changing any other test setting.
- [ ] Capture the sanitized host snapshot.
- [ ] Wait exactly 30 seconds.

```powershell
$env:RUN_ID = "run-2"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-2 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-2.md
Start-Sleep -Seconds $cooldownSeconds
```

### Run 3

- [ ] Confirm the Droplet is healthy and no other test is active.
- [ ] Run `run-3` without changing any other test setting.
- [ ] Capture the sanitized host snapshot.

```powershell
$env:RUN_ID = "run-3"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-3 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-3.md
```

Stop the measured experiment if any of the following occurs:

- Server errors exceed `1%`.
- The load generator saturates.
- The game becomes unusable.
- A k6 invocation exits nonzero.

Do not increase the VU count. Keep only sanitized aggregate summaries and
sanitized operator notes.

## 5. Run the bounded recovery experiment

### Terminal A - precheck and probe

- [ ] Establish two successful `/health` and `/ready` observations at least ten
  seconds apart.
- [ ] Start the three-minute recovery probe.

```powershell
$healthUri = $env:TARGET_BASE_URL.TrimEnd('/') + '/health'
$readyUri = $env:TARGET_BASE_URL.TrimEnd('/') + '/ready'
(Invoke-WebRequest -UseBasicParsing -Uri $healthUri).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri $readyUri).StatusCode
Start-Sleep -Seconds 10
(Invoke-WebRequest -UseBasicParsing -Uri $healthUri).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri $readyUri).StatusCode

New-Item -ItemType Directory -Force .\evidence\day2\recovery | Out-Null
.\scripts\recovery-probe.ps1 -BaseUrl $env:TARGET_BASE_URL -OutputPath .\evidence\day2\recovery\recovery-probe.csv -DurationSeconds 180
```

Leave the probe running until both endpoints recover. Then press Ctrl+C, or
allow the bounded duration to finish.

### Terminal B - trigger and observe recovery

- [ ] Confirm the Compose service name.
- [ ] Record the exact UTC failure-trigger time.
- [ ] Crash PID 1 inside the healthy backend container.
- [ ] Observe Compose status and the container restart count.

```powershell
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose ps"
$failureTriggeredAtUtc = [DateTime]::UtcNow.ToString('o')
$failureTriggeredAtUtc
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose exec -T backend sh -c 'kill -9 1'"
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose ps"
ssh root@<DROPLET_IP> 'cd /opt/spartanguessr && sudo docker inspect --format="{{.RestartCount}}" "$(sudo docker compose ps -q backend)"'
```

Do not use `docker stop` or `docker compose stop`; those commands suppress the
restart-policy behavior being tested.

If the backend does not restart automatically, run the following command once,
record automatic recovery as failed, and stop failure testing:

```powershell
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose up -d backend"
```

- [ ] Run the five-round smoke test after recovery.
- [ ] Create and fill the recovery metadata file.
- [ ] Record the failure-trigger timestamp, restart count, and smoke result.

```powershell
py -3 .\scripts\smoke.py $env:TARGET_BASE_URL
Copy-Item .\evidence\day2\recovery\recovery-metadata.template.json .\evidence\day2\recovery\recovery-metadata.json
notepad .\evidence\day2\recovery\recovery-metadata.json
```

## 6. Sanitize and validate evidence before teardown

- [ ] Open every evidence file and remove credentials and tokens.
- [ ] Remove raw URLs that identify private infrastructure.
- [ ] Remove IP addresses, container IDs, and environment data.
- [ ] Remove session IDs, coordinates, headers, and request/response bodies.
- [ ] Remove catalog records or catalog content.
- [ ] Confirm exactly one smoke summary and three measured summaries exist.
- [ ] Run the pre-teardown validator.

```powershell
py -3 .\scripts\validate-day2-evidence.py --pre-teardown --evidence-dir .\evidence\day2
```

Do not proceed until the validator passes. Then give Codex the sanitized
manifest, summaries, host notes, recovery CSV, recovery metadata, result
template, `day1.md`, and `day2.md`. Codex must calculate and create
`experiment-results.md` using measured values only.

## 7. Record cost and teardown proof

Before deleting resources:

- [ ] Record the Droplet creation time.
- [ ] Record experiment start and end times.
- [ ] Record actual accrued cost and currency.
- [ ] Record the experiment resource types currently present.
- [ ] Confirm the result document contains no secrets or catalog data.
- [ ] Record the Render URL, branch/commit, and relevant settings for the final
  unchanged check.
- [ ] Copy and open the teardown-proof template.

```powershell
Copy-Item .\evidence\day2\teardown-proof.template.json .\evidence\day2\teardown-proof.json
notepad .\evidence\day2\teardown-proof.json
```

Perform the manual teardown:

- [ ] Destroy the experiment Droplet. Do not merely power it off.
- [ ] Delete the experiment Cloud Firewall.
- [ ] Delete the temporary DNS `A` record.
- [ ] Delete any temporary DigitalOcean API token that was created.
- [ ] Confirm no experiment load balancer remains.
- [ ] Confirm no experiment volume remains.
- [ ] Confirm no experiment snapshot remains.
- [ ] Confirm no experiment registry remains.
- [ ] Confirm no experiment reserved IP remains.
- [ ] Confirm no powered-off experiment Droplet remains billable.
- [ ] Record the timestamped residual-resource confirmation.
- [ ] Set `remaining_experiment_resources` to an empty JSON list.

Perform the final Render check:

- [ ] Reopen the recorded Render service.
- [ ] Confirm its URL responds.
- [ ] Confirm its branch/commit and settings were not changed.
- [ ] Do not redeploy it for this check.
- [ ] Set `render_unchanged` to `true` only if all checks pass.
- [ ] Fill every remaining teardown-proof field and timestamp.

Set `temporary_api_token_status` to either `not_created` or `deleted`. The
experiment end time must be the final Render-confirmation time or later.

## 8. Run the final evidence gate

- [ ] Confirm Codex has created and filled `experiment-results.md`.
- [ ] Confirm `teardown-proof.json` contains no placeholders.
- [ ] Run the final validator.

```powershell
py -3 .\scripts\validate-day2-evidence.py --evidence-dir .\evidence\day2
```

Do not claim Day 2 is complete unless this command passes and the underlying
operator evidence and teardown proof are accurate.

## Expected evidence files

- [ ] `evidence/day2/run-manifest.json`
- [ ] `evidence/day2/benchmarks/smoke-summary.json`
- [ ] `evidence/day2/benchmarks/run-1-summary.json`
- [ ] `evidence/day2/benchmarks/run-2-summary.json`
- [ ] `evidence/day2/benchmarks/run-3-summary.json`
- [ ] `evidence/day2/host/baseline.md`
- [ ] `evidence/day2/host/run-1.md`
- [ ] `evidence/day2/host/run-2.md`
- [ ] `evidence/day2/host/run-3.md`
- [ ] `evidence/day2/recovery/recovery-probe.csv`
- [ ] `evidence/day2/recovery/recovery-metadata.json`
- [ ] `evidence/day2/experiment-results.md`
- [ ] `evidence/day2/teardown-proof.json`

## Day 2 definition of done

- [ ] Three comparable measured benchmark summaries exist.
- [ ] One recovery timeline and a post-recovery smoke result exist.
- [ ] The result document uses measured values only.
- [ ] Medians and min-max spreads are recorded for the required metrics.
- [ ] Actual cost, experiment duration, and limitations are recorded.
- [ ] No secrets, catalog content, session IDs, coordinates, response bodies,
  or client IPs entered Git.
- [ ] Render is unchanged.
- [ ] Every DigitalOcean experiment resource is destroyed.
- [ ] The final evidence validator passes.

