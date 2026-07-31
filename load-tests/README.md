# Day 2 k6 operator runbook

The workload in 'game.js' creates a non-leaderboard medium five-round session,
requests each round image, submits five valid guesses, and fetches results.
It never sends a leaderboard write. Each run writes an aggregate-only JSON
file; it does not write the target URL, session identifiers, coordinates,
headers, request or response bodies, client IPs, tokens, or catalog data.

Run these commands manually from the repository root only after the Day 1
public health, readiness, and five-round smoke checks pass and the manifest is
frozen. Do not use the measured scenario against Render.

## 1. Public preflight and manifest freeze

Replace the placeholder before pressing Enter. Continue only when the two
status commands report '200' and the existing smoke script reports 'PASS'.
This is an operator-run external check; it is not a capacity test.

~~~powershell
$env:TARGET_BASE_URL = "https://<TEMP_HOSTNAME>"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
py -3 .\scripts\smoke.py $env:TARGET_BASE_URL
~~~

Do not rebuild, redeploy, change the catalog, or change runtime settings after
recording the manifest values.

## 2. Prepare k6 and the manifest

If 'k6 version' does not work, install k6 yourself:

~~~powershell
winget install k6 --source winget
k6 version
~~~

Create the local manifest from the template and fill it with the frozen,
non-secret values. Replace every placeholder, set 'evidence_status' to
'sanitized', and use a sanitized target label rather than a raw URL.

~~~powershell
Copy-Item .\evidence\day2\run-manifest.template.json .\evidence\day2\run-manifest.json
notepad .\evidence\day2\run-manifest.json
~~~

After saving the manifest, set the exact same sanitized run-set label for all
four k6 invocations:

~~~powershell
$env:RUN_SET_ID = "<RUN_SET_ID_FROM_MANIFEST>"
~~~

## 3. Unmeasured smoke

Replace the placeholder before pressing Enter. The output is
'evidence/day2/benchmarks/smoke-summary.json'; do not treat it as a measured
result.

~~~powershell
$env:TARGET_BASE_URL = "https://<TEMP_HOSTNAME>"
$env:RUN_ID = "smoke"
$env:K6_SCENARIO = "smoke"
$env:K6_VUS = "1"
$env:K6_DURATION = "30s"
$env:K6_PAUSE_SECONDS = "1"
k6 run .\load-tests\game.js
~~~

## 4. Three matching measured runs

Before every run, confirm the Droplet is healthy and no other test is active.
Capture a sanitized CPU/memory snapshot before the first run and one during or
immediately after each run. Do not raise the VU count if errors exceed 1%, the
generator saturates, or the game becomes unusable.

~~~powershell
$env:TARGET_BASE_URL = "https://<TEMP_HOSTNAME>"
$env:K6_SCENARIO = "measured"
$env:K6_VUS = "5"
$env:K6_DURATION = "2m"
$env:K6_PAUSE_SECONDS = "1"
$cooldownSeconds = 30

New-Item -ItemType Directory -Force .\evidence\day2\host | Out-Null

# Record the displayed UTC time, CPU, and memory values only in baseline.md.
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\baseline.md

$env:RUN_ID = "run-1"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-1 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-1.md
Start-Sleep -Seconds $cooldownSeconds

$env:RUN_ID = "run-2"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-2 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-2.md
Start-Sleep -Seconds $cooldownSeconds

$env:RUN_ID = "run-3"
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/health')).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri ($env:TARGET_BASE_URL.TrimEnd('/') + '/ready')).StatusCode
k6 run .\load-tests\game.js
if ($LASTEXITCODE -ne 0) { throw 'run-3 failed; stop the experiment.' }
[DateTime]::UtcNow.ToString('o')
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker stats --no-stream"
notepad .\evidence\day2\host\run-3.md
~~~

In each host note, transcribe only the displayed UTC time, CPU percentage,
memory usage, and a short operator observation. Do not paste the SSH command or
raw URLs, addresses, container IDs, image IDs, or environment data. The exact
30-second cooldown above must remain unchanged between the measured runs.

The expected measured files are:

- 'evidence/day2/benchmarks/run-1-summary.json'
- 'evidence/day2/benchmarks/run-2-summary.json'
- 'evidence/day2/benchmarks/run-3-summary.json'
- 'evidence/day2/host/baseline.md'
- 'evidence/day2/host/run-1.md'
- 'evidence/day2/host/run-2.md'
- 'evidence/day2/host/run-3.md'

Keep only the sanitized aggregate summaries and sanitized host notes.

## 5. Bounded recovery probe

In terminal A, establish two successful observations at least ten seconds
apart, then start the probe. Press Ctrl+C only after both endpoints have
recovered, or let the three-minute bound finish.

~~~powershell
$healthUri = $env:TARGET_BASE_URL.TrimEnd('/') + '/health'
$readyUri = $env:TARGET_BASE_URL.TrimEnd('/') + '/ready'
(Invoke-WebRequest -UseBasicParsing -Uri $healthUri).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri $readyUri).StatusCode
Start-Sleep -Seconds 10
(Invoke-WebRequest -UseBasicParsing -Uri $healthUri).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri $readyUri).StatusCode

New-Item -ItemType Directory -Force .\evidence\day2\recovery | Out-Null
.\scripts\recovery-probe.ps1 -BaseUrl $env:TARGET_BASE_URL -OutputPath .\evidence\day2\recovery\recovery-probe.csv -DurationSeconds 180
~~~

In a separate terminal B, the operator must confirm the service name and
crash PID 1 inside the already healthy backend container. Do not use
'docker stop' or 'docker compose stop', because either suppresses the
configured restart-policy behavior.

~~~powershell
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose ps"
$failureTriggeredAtUtc = [DateTime]::UtcNow.ToString('o')
$failureTriggeredAtUtc
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose exec -T backend sh -c 'kill -9 1'"
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose ps"
ssh root@<DROPLET_IP> 'cd /opt/spartanguessr && sudo docker inspect --format="{{.RestartCount}}" "$(sudo docker compose ps -q backend)"'
~~~

Record the displayed '$failureTriggeredAtUtc' value exactly in
'recovery-metadata.json'. If the backend does not restart, run the following
recovery command once, record the automatic recovery as failed, and stop
failure testing:

~~~powershell
ssh root@<DROPLET_IP> "cd /opt/spartanguessr && sudo docker compose up -d backend"
~~~

Then run the existing five-round smoke test again:

~~~powershell
py -3 .\scripts\smoke.py $env:TARGET_BASE_URL
~~~

Copy the recovery metadata template, then record the UTC time the crash command
was issued, the observed restart count, and whether the post-recovery smoke
passed:

~~~powershell
Copy-Item .\evidence\day2\recovery\recovery-metadata.template.json .\evidence\day2\recovery\recovery-metadata.json
notepad .\evidence\day2\recovery\recovery-metadata.json
~~~

## 6. Pre-teardown evidence check and Codex handoff

After the benchmark, host, and recovery files have been sanitized, run:

~~~powershell
py -3 .\scripts\validate-day2-evidence.py --pre-teardown --evidence-dir .\evidence\day2
~~~

The command must pass before teardown. Then ask Codex to analyze the sanitized
manifest, smoke and three measured summaries, four host notes, recovery CSV,
recovery metadata, result template, 'day1.md', and 'day2.md'. Codex should
create 'experiment-results.md' using measured values only.

## 7. Cost and manual teardown checklist

Complete these operator-only steps before considering the experiment complete:

1. Record the actual experiment start/end times, accrued cost, and current
   experiment resource-type list without account identifiers.
2. Record the Droplet creation time and copy the teardown template:

   ~~~powershell
   Copy-Item .\evidence\day2\teardown-proof.template.json .\evidence\day2\teardown-proof.json
   notepad .\evidence\day2\teardown-proof.json
   ~~~

3. Destroy the experiment Droplet; do not merely power it off.
4. Delete the experiment Cloud Firewall and temporary DNS A record.
5. Delete any temporary DigitalOcean API token created for the experiment.
6. Confirm no experiment load balancer, volume, snapshot, registry, reserved
   IP, or powered-off Droplet remains billable.
7. Reopen the recorded Render service and confirm its URL, branch/commit, and
   settings were not changed.
8. Fill every teardown-proof placeholder. Set the temporary-token status to
   'not_created' or 'deleted', set 'remaining_experiment_resources' to an empty
   list, set 'render_unchanged' to true, and record experiment end as the final
   Render-confirmation time or later.

## 8. Final local evidence check

After Codex has filled 'experiment-results.md' and teardown proof is complete,
run:

~~~powershell
py -3 .\scripts\validate-day2-evidence.py --evidence-dir .\evidence\day2
~~~

Only a successful final validation plus the underlying operator evidence
satisfies the Day 2 definition of done.
