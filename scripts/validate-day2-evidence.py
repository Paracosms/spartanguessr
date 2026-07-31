#!/usr/bin/env python3
"""Validate and summarize sanitized Day 2 experiment evidence.

The program is deliberately local-only: it reads explicit files below an
evidence directory, makes no network calls, and never echoes data that
resembles a credential or other prohibited detail.
"""

import argparse
import csv
import ipaddress
import json
import math
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path


class EvidenceError(Exception):
    """Raised when evidence is incomplete, malformed, or unsafe."""


RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_EVIDENCE_BYTES = 1_000_000
PROHIBITED_CONTENT = (
    ("credential-like assignment", re.compile(
        r"(?i)\b(?:api[_-]?key|secret|token|password|authorization|upstash)\b\s*[:=]\s*['\"]?[A-Za-z0-9._~+/=-]{8,}"
    )),
    ("bearer credential", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")),
    ("raw URL", re.compile(r"(?i)\bhttps?://[^\s'\"<>]+")),
    ("session identifier field", re.compile(r"(?i)\bsession[_-]?id\b")),
    ("coordinate field", re.compile(
        r"(?i)\b(?:actual_|guess_)?(?:latitude|longitude|coordinates?)\b"
    )),
    ("response body field", re.compile(r"(?i)\b(?:response_)?body\b")),
)
IP_CANDIDATE_RE = re.compile(
    r"(?<![0-9A-Za-z_])\[?[0-9A-Fa-f:.%]{2,}\]?(?![0-9A-Za-z_])"
)

SUMMARY_METRICS = {
    "games_completed": ("count", "per_second", "per_minute"),
    "full_game_duration_ms": ("min", "average", "p50", "p95", "max"),
    "http_requests": ("count", "requests_per_second"),
    "request_duration_ms": ("p50", "p95"),
    "http_failures": ("rate",),
    "http_429s": ("count", "per_second"),
    "game_flow_failures": ("count", "per_second"),
    "checks": ("pass_rate",),
}


def fail(message):
    raise EvidenceError(message)


def read_text(path):
    if path.is_symlink():
        fail(f"Evidence file must not be a symbolic link: {path.name}")
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        fail(f"Missing required evidence file: {path.name}")
    except OSError:
        fail(f"Unable to inspect evidence file: {path.name}")
    if size > MAX_EVIDENCE_BYTES:
        fail(f"Evidence file exceeds the {MAX_EVIDENCE_BYTES}-byte safety limit: {path.name}")
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"Missing required evidence file: {path.name}")
    except (UnicodeDecodeError, OSError):
        fail(f"Evidence file is not UTF-8 text: {path.name}")


def contains_ip_address(text):
    for match in IP_CANDIDATE_RE.finditer(text):
        candidate = match.group(0).strip("[]")
        candidate = candidate.split("%", 1)[0]
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            continue
        return True
    return False


def reject_prohibited_content(path):
    text = read_text(path)
    for description, pattern in PROHIBITED_CONTENT:
        if pattern.search(text):
            fail(f"Possible {description} found in {path.name}; sanitize it before analysis.")
    if contains_ip_address(text):
        fail(f"Possible client IP address found in {path.name}; sanitize it before analysis.")
    return text


def load_json(path):
    text = reject_prohibited_content(path)
    try:
        value = json.loads(text)
    except (json.JSONDecodeError, RecursionError):
        fail(f"Invalid JSON evidence file: {path.name}")
    if not isinstance(value, dict):
        fail(f"Top-level JSON value must be an object: {path.name}")
    return value


def expect_keys(value, expected, label):
    if set(value) != set(expected):
        fail(f"Unexpected or missing fields in {label}.")


def expect_nonempty_string(value, label):
    if not isinstance(value, str) or not value.strip() or value.startswith("<"):
        fail(f"{label} must be a filled non-secret string.")
    return value


def expect_number(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{label} must be a finite number.")
    if value < minimum:
        fail(f"{label} must not be less than {minimum}.")
    return value


def expect_integer(value, label, minimum=0):
    expect_number(value, label, minimum=minimum)
    if not isinstance(value, int):
        fail(f"{label} must be an integer.")
    return value


def parse_utc(value, label):
    raw = expect_nonempty_string(value, label)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        fail(f"{label} must be an ISO-8601 UTC timestamp.")
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        fail(f"{label} must include a UTC offset.")
    return parsed.astimezone(timezone.utc)


def validate_manifest(path):
    manifest = load_json(path)
    expect_keys(
        manifest,
        (
            "schema_version",
            "evidence_status",
            "run_set_id",
            "target_label",
            "commit_sha",
            "image_id",
            "catalog_revision",
            "droplet",
            "generator_location",
            "redis_prefix_label",
            "rate_limit",
            "measured_run_ids",
            "measured_config",
        ),
        path.name,
    )
    if manifest["schema_version"] != 1 or manifest["evidence_status"] != "sanitized":
        fail(f"{path.name} must declare schema version 1 and sanitized evidence status.")
    for key in (
        "target_label",
        "run_set_id",
        "commit_sha",
        "image_id",
        "catalog_revision",
        "generator_location",
        "redis_prefix_label",
    ):
        expect_nonempty_string(manifest[key], f"manifest.{key}")

    droplet = manifest["droplet"]
    if not isinstance(droplet, dict):
        fail("manifest.droplet must be an object.")
    expect_keys(droplet, ("size", "region"), "manifest.droplet")
    expect_nonempty_string(droplet["size"], "manifest.droplet.size")
    expect_nonempty_string(droplet["region"], "manifest.droplet.region")

    rate_limit = manifest["rate_limit"]
    if not isinstance(rate_limit, dict):
        fail("manifest.rate_limit must be an object.")
    expect_keys(rate_limit, ("mode", "requests", "window_seconds"), "manifest.rate_limit")
    expect_nonempty_string(rate_limit["mode"], "manifest.rate_limit.mode")
    expect_integer(rate_limit["requests"], "manifest.rate_limit.requests", minimum=1)
    expect_integer(rate_limit["window_seconds"], "manifest.rate_limit.window_seconds", minimum=1)

    run_ids = manifest["measured_run_ids"]
    if not isinstance(run_ids, list) or len(run_ids) != 3 or len(set(run_ids)) != 3:
        fail("manifest.measured_run_ids must contain exactly three unique run IDs.")
    for run_id in run_ids:
        if not isinstance(run_id, str) or not RUN_ID_RE.fullmatch(run_id):
            fail("manifest.measured_run_ids contains an invalid run ID.")

    config = manifest["measured_config"]
    if not isinstance(config, dict):
        fail("manifest.measured_config must be an object.")
    expect_keys(config, ("scenario", "vus", "duration", "pause_seconds"), "manifest.measured_config")
    if config["scenario"] != "measured":
        fail("manifest.measured_config.scenario must be measured.")
    expect_integer(config["vus"], "manifest.measured_config.vus", minimum=1)
    expect_nonempty_string(config["duration"], "manifest.measured_config.duration")
    expect_number(config["pause_seconds"], "manifest.measured_config.pause_seconds", minimum=0)
    return manifest


def validate_summary(path, expected_run_id, expected_run_set_id, expected_config):
    summary = load_json(path)
    expect_keys(summary, ("schema_version", "test_config", "metrics", "thresholds"), path.name)
    if summary["schema_version"] != 1:
        fail(f"{path.name} has an unsupported schema version.")

    config = summary["test_config"]
    if not isinstance(config, dict):
        fail(f"{path.name}.test_config must be an object.")
    expect_keys(
        config,
        ("run_id", "run_set_id", "scenario", "vus", "duration", "pause_seconds"),
        f"{path.name}.test_config",
    )
    if config["run_id"] != expected_run_id:
        fail(f"{path.name} run ID does not match the manifest.")
    if config["run_set_id"] != expected_run_set_id:
        fail(f"{path.name} run-set ID does not match the frozen manifest.")
    if config["scenario"] != expected_config["scenario"]:
        fail(f"{path.name} scenario does not match the frozen manifest.")
    for key in ("vus", "duration", "pause_seconds"):
        if config[key] != expected_config[key]:
            fail(f"{path.name} {key} does not match the frozen manifest.")

    metrics = summary["metrics"]
    if not isinstance(metrics, dict):
        fail(f"{path.name}.metrics must be an object.")
    expect_keys(metrics, SUMMARY_METRICS, f"{path.name}.metrics")
    for metric_name, value_names in SUMMARY_METRICS.items():
        metric = metrics[metric_name]
        if not isinstance(metric, dict):
            fail(f"{path.name} metric {metric_name} must be an object.")
        expect_keys(metric, value_names, f"{path.name} metric {metric_name}")
        for value_name in value_names:
            expect_number(metric[value_name], f"{path.name} metric {metric_name}.{value_name}")

    for metric_name in (
        "games_completed",
        "http_requests",
        "http_429s",
        "game_flow_failures",
    ):
        expect_integer(
            metrics[metric_name]["count"],
            f"{path.name} metric {metric_name}.count",
        )
    if metrics["games_completed"]["count"] < 1:
        fail(f"{path.name} contains no completed game.")
    if metrics["game_flow_failures"]["count"] != 0:
        fail(f"{path.name} reports a game-flow failure.")
    if metrics["http_failures"]["rate"] > 0.01:
        fail(f"{path.name} exceeds the one-percent HTTP failure limit.")
    if metrics["checks"]["pass_rate"] != 1:
        fail(f"{path.name} reports a failed flow check.")
    if metrics["http_429s"]["count"] > metrics["http_requests"]["count"]:
        fail(f"{path.name} reports more 429s than HTTP requests.")
    if not math.isclose(
        metrics["games_completed"]["per_minute"],
        metrics["games_completed"]["per_second"] * 60,
        rel_tol=1e-9,
        abs_tol=1e-9,
    ):
        fail(f"{path.name} has inconsistent completed-game rates.")

    request_duration = metrics["request_duration_ms"]
    if request_duration["p50"] > request_duration["p95"]:
        fail(f"{path.name} request-duration p50 exceeds p95.")
    game_duration = metrics["full_game_duration_ms"]
    if not (
        game_duration["min"]
        <= game_duration["p50"]
        <= game_duration["p95"]
        <= game_duration["max"]
    ):
        fail(f"{path.name} full-game duration percentiles are inconsistent.")
    if not game_duration["min"] <= game_duration["average"] <= game_duration["max"]:
        fail(f"{path.name} full-game average is outside the observed range.")

    thresholds = summary["thresholds"]
    threshold_names = (
        "all_checks_passed",
        "http_failure_rate_at_most_one_percent",
        "at_least_one_game_completed",
        "no_game_flow_failures",
    )
    if not isinstance(thresholds, dict):
        fail(f"{path.name}.thresholds must be an object.")
    expect_keys(thresholds, threshold_names, f"{path.name}.thresholds")
    if not all(value is True for value in thresholds.values()):
        fail(f"{path.name} reports a failed threshold.")
    return summary


def validate_benchmark_summaries(root, manifest):
    benchmark_root = root / "benchmarks"
    expected_run_ids = manifest["measured_run_ids"]
    expected_names = {
        "smoke-summary.json",
        *(run_id + "-summary.json" for run_id in expected_run_ids),
    }
    try:
        actual_names = {
            path.name
            for path in benchmark_root.glob("*-summary.json")
            if path.is_file() or path.is_symlink()
        }
    except OSError:
        fail("Unable to inspect the benchmark evidence directory.")
    if actual_names != expected_names:
        fail(
            "Benchmark evidence must contain exactly smoke-summary.json and "
            "the three manifest-named measured summaries."
        )

    validate_summary(
        benchmark_root / "smoke-summary.json",
        "smoke",
        manifest["run_set_id"],
        {
            "scenario": "smoke",
            "vus": 1,
            "duration": "30s",
            "pause_seconds": 1,
        },
    )
    return [
        validate_summary(
            benchmark_root / (run_id + "-summary.json"),
            run_id,
            manifest["run_set_id"],
            manifest["measured_config"],
        )
        for run_id in expected_run_ids
    ]


def validate_recovery(path, metadata_path):
    text = reject_prohibited_content(path)
    try:
        rows = list(csv.DictReader(text.splitlines()))
    except csv.Error:
        fail(f"Invalid CSV evidence file: {path.name}")
    expected_fields = ("timestamp_utc", "endpoint", "http_status", "outcome", "elapsed_ms")
    if not rows:
        fail(f"{path.name} contains no recovery observations.")
    if tuple(rows[0]) != expected_fields:
        fail(f"{path.name} has unexpected or unsafe CSV fields.")

    previous = None
    parsed_rows = []
    for row in rows:
        if set(row) != set(expected_fields):
            fail(f"{path.name} has an unexpected CSV row shape.")
        timestamp = parse_utc(row["timestamp_utc"], f"{path.name}.timestamp_utc")
        if previous is not None and timestamp < previous:
            fail(f"{path.name} timestamps are not ordered.")
        previous = timestamp
        if row["endpoint"] not in ("/health", "/ready"):
            fail(f"{path.name} contains an unexpected endpoint.")
        if row["outcome"] not in ("success", "failure"):
            fail(f"{path.name} contains an unexpected outcome.")
        if row["http_status"]:
            try:
                status = int(row["http_status"])
            except ValueError:
                fail(f"{path.name} contains a non-numeric HTTP status.")
            if not 100 <= status <= 599:
                fail(f"{path.name} contains an invalid HTTP status.")
        try:
            elapsed_ms = float(row["elapsed_ms"])
        except (TypeError, ValueError, OverflowError):
            fail(f"{path.name} contains an invalid elapsed-millisecond value.")
        expect_number(elapsed_ms, f"{path.name}.elapsed_ms")
        parsed_rows.append((timestamp, row))

    metadata = load_json(metadata_path)
    expect_keys(
        metadata,
        ("schema_version", "failure_triggered_at_utc", "container_restart_count", "post_recovery_smoke"),
        metadata_path.name,
    )
    if metadata["schema_version"] != 1:
        fail(f"{metadata_path.name} has an unsupported schema version.")
    triggered_at = parse_utc(metadata["failure_triggered_at_utc"], "recovery metadata trigger time")
    expect_integer(metadata["container_restart_count"], "recovery metadata restart count")
    if metadata["post_recovery_smoke"] not in ("passed", "failed"):
        fail("recovery metadata post_recovery_smoke must be passed or failed.")

    recovery = {"public_probe_error_count": 0}
    for endpoint in ("/health", "/ready"):
        pre_trigger_successes = [
            timestamp
            for timestamp, row in parsed_rows
            if row["endpoint"] == endpoint
            and timestamp < triggered_at
            and row["outcome"] == "success"
        ]
        if not pre_trigger_successes:
            fail(f"{path.name} has no healthy pre-trigger observation for {endpoint}.")

        endpoint_rows = [
            (timestamp, row)
            for timestamp, row in parsed_rows
            if row["endpoint"] == endpoint and timestamp >= triggered_at
        ]
        if not endpoint_rows:
            fail(f"{path.name} has no post-trigger observations for {endpoint}.")
        failure_timestamps = [
            timestamp
            for timestamp, row in endpoint_rows
            if row["outcome"] == "failure"
        ]
        recovery["public_probe_error_count"] += len(failure_timestamps)
        if not failure_timestamps:
            fail(f"{path.name} has no observed post-trigger failure for {endpoint}.")

        last_failure = failure_timestamps[-1]
        recovered_successes = [
            timestamp
            for timestamp, row in endpoint_rows
            if row["outcome"] == "success" and timestamp > last_failure
        ]
        if not recovered_successes:
            fail(f"{path.name} has no recovered success after the final failure for {endpoint}.")
        recovery[endpoint.lstrip("/") + "_first_success_after_trigger_ms"] = round(
            (recovered_successes[0] - triggered_at).total_seconds() * 1000,
            3,
        )
    recovery["container_restart_count"] = metadata["container_restart_count"]
    recovery["post_recovery_smoke"] = metadata["post_recovery_smoke"]
    return recovery


def validate_teardown(path):
    proof = load_json(path)
    expect_keys(
        proof,
        (
            "schema_version",
            "droplet_created_at_utc",
            "experiment_started_at_utc",
            "experiment_ended_at_utc",
            "resource_types_before_teardown",
            "actual_cost",
            "droplet_destroyed_at_utc",
            "firewall_deleted_at_utc",
            "dns_record_deleted_at_utc",
            "temporary_api_token_status",
            "remaining_experiment_resources",
            "residual_resources_confirmed_at_utc",
            "render_unchanged",
            "render_unchanged_confirmed_at_utc",
        ),
        path.name,
    )
    if proof["schema_version"] != 1:
        fail(f"{path.name} has an unsupported schema version.")
    timestamps = {}
    for key in (
        "droplet_created_at_utc",
        "experiment_started_at_utc",
        "experiment_ended_at_utc",
        "droplet_destroyed_at_utc",
        "firewall_deleted_at_utc",
        "dns_record_deleted_at_utc",
        "residual_resources_confirmed_at_utc",
        "render_unchanged_confirmed_at_utc",
    ):
        timestamps[key] = parse_utc(proof[key], f"teardown proof {key}")

    resource_types = proof["resource_types_before_teardown"]
    if not isinstance(resource_types, list) or not resource_types:
        fail("teardown proof resource_types_before_teardown must be a nonempty list.")
    for resource_type in resource_types:
        expect_nonempty_string(resource_type, "teardown proof resource type")

    if proof["temporary_api_token_status"] not in ("not_created", "deleted"):
        fail("teardown proof temporary_api_token_status must be not_created or deleted.")
    if proof["remaining_experiment_resources"] != []:
        fail("teardown proof must confirm an empty remaining_experiment_resources list.")
    if proof["render_unchanged"] is not True:
        fail("teardown proof must confirm render_unchanged as true.")

    if timestamps["droplet_created_at_utc"] > timestamps["droplet_destroyed_at_utc"]:
        fail("teardown proof records Droplet destruction before creation.")
    if timestamps["droplet_created_at_utc"] > timestamps["experiment_started_at_utc"]:
        fail("teardown proof records experiment start before Droplet creation.")
    if timestamps["experiment_started_at_utc"] > timestamps["experiment_ended_at_utc"]:
        fail("teardown proof experiment end precedes experiment start.")
    cleanup_timestamps = (
        timestamps["droplet_destroyed_at_utc"],
        timestamps["firewall_deleted_at_utc"],
        timestamps["dns_record_deleted_at_utc"],
    )
    if min(cleanup_timestamps) < timestamps["experiment_started_at_utc"]:
        fail("teardown proof records cleanup before experiment start.")
    if timestamps["residual_resources_confirmed_at_utc"] < max(cleanup_timestamps):
        fail("residual-resource confirmation must follow the recorded deletions.")
    if (
        timestamps["render_unchanged_confirmed_at_utc"]
        < timestamps["residual_resources_confirmed_at_utc"]
    ):
        fail("the final Render confirmation must follow resource cleanup confirmation.")
    if (
        timestamps["experiment_ended_at_utc"]
        < timestamps["render_unchanged_confirmed_at_utc"]
    ):
        fail("experiment end must include the final Render confirmation.")

    cost = proof["actual_cost"]
    if not isinstance(cost, dict):
        fail("teardown proof actual_cost must be an object.")
    expect_keys(cost, ("amount", "currency"), "teardown proof actual_cost")
    expect_number(cost["amount"], "teardown proof actual_cost.amount")
    expect_nonempty_string(cost["currency"], "teardown proof actual_cost.currency")
    return proof


def validate_host_snapshots(root):
    snapshot_names = ("baseline.md", "run-1.md", "run-2.md", "run-3.md")
    for name in snapshot_names:
        path = root / "host" / name
        text = reject_prohibited_content(path)
        if not text.strip():
            fail(f"Host snapshot note is empty: {path.name}")


def validate_results_document(path):
    text = reject_prohibited_content(path)
    if "[NOT MEASURED" in text or "[NOT ELIGIBLE" in text:
        fail(f"{path.name} still contains an unfilled measurement placeholder.")
    required_sections = (
        "## Scope and architecture",
        "## Frozen manifest",
        "## Benchmark measurements",
        "## Host snapshots",
        "## Recovery measurement",
        "## Cost and teardown proof",
        "## Limitations",
        "## Render versus Droplet operations note",
        "## Resume bullet",
        "## Two-minute walkthrough outline",
    )
    for section in required_sections:
        if section not in text:
            fail(f"{path.name} is missing the required section {section}.")
    limitation_terms = (
        "shared-CPU",
        "generator location",
        "Upstash",
        "short",
        "multi-node",
        "high-availability",
    )
    for term in limitation_terms:
        if term not in text:
            fail(f"{path.name} is missing the required limitation term {term}.")


def median_and_spread(values):
    return {
        "median": statistics.median(values),
        "spread_min": min(values),
        "spread_max": max(values),
    }


def summarize(summaries, recovery, teardown=None):
    measurements = []
    series = {
        "completed_games_per_minute": [],
        "requests_per_second": [],
        "request_p50_ms": [],
        "request_p95_ms": [],
        "http_failure_rate": [],
        "http_429_count": [],
    }
    for summary in summaries:
        metrics = summary["metrics"]
        measurements.append({
            "run_id": summary["test_config"]["run_id"],
            "completed_games_per_minute": metrics["games_completed"]["per_minute"],
            "requests_per_second": metrics["http_requests"]["requests_per_second"],
            "request_p50_ms": metrics["request_duration_ms"]["p50"],
            "request_p95_ms": metrics["request_duration_ms"]["p95"],
            "http_failure_rate": metrics["http_failures"]["rate"],
            "http_429_count": metrics["http_429s"]["count"],
        })
        for key in series:
            series[key].append(measurements[-1][key])
    report = {
        "status": "valid_sanitized_evidence",
        "measured_runs": measurements,
        "median_and_spread": {
            key: median_and_spread(values)
            for key, values in series.items()
        },
        "recovery": recovery,
    }
    if teardown is not None:
        started_at = parse_utc(
            teardown["experiment_started_at_utc"],
            "teardown proof experiment_started_at_utc",
        )
        ended_at = parse_utc(
            teardown["experiment_ended_at_utc"],
            "teardown proof experiment_ended_at_utc",
        )
        report["actual_cost"] = teardown["actual_cost"]
        report["experiment_duration_seconds"] = (
            ended_at - started_at
        ).total_seconds()
    return report


def check_templates(root):
    template_paths = (
        root / "run-manifest.template.json",
        root / "recovery" / "recovery-metadata.template.json",
        root / "teardown-proof.template.json",
    )
    for path in template_paths:
        try:
            json.loads(read_text(path))
        except json.JSONDecodeError:
            fail(f"Invalid JSON template: {path.name}")
    results_template = read_text(root / "experiment-results.template.md")
    if "[NOT MEASURED" not in results_template:
        fail("Experiment results template must visibly mark placeholders as not measured.")
    print("PASS: Day 2 evidence templates are valid JSON/text scaffolds.")


def main():
    parser = argparse.ArgumentParser(
        description="Validate local sanitized Day 2 evidence without network access."
    )
    parser.add_argument(
        "--evidence-dir",
        type=Path,
        default=Path("evidence/day2"),
        help="Directory containing the sanitized Day 2 evidence.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check-templates",
        action="store_true",
        help="Validate only the committed templates, not measured evidence.",
    )
    mode.add_argument(
        "--pre-teardown",
        action="store_true",
        help=(
            "Validate sanitized benchmark, host, and recovery evidence and "
            "print calculations before teardown."
        ),
    )
    args = parser.parse_args()
    root = args.evidence_dir

    try:
        if args.check_templates:
            check_templates(root)
            return 0

        manifest = validate_manifest(root / "run-manifest.json")
        summaries = validate_benchmark_summaries(root, manifest)
        recovery = validate_recovery(
            root / "recovery" / "recovery-probe.csv",
            root / "recovery" / "recovery-metadata.json",
        )
        validate_host_snapshots(root)
        if args.pre_teardown:
            print(json.dumps(summarize(summaries, recovery), indent=2, sort_keys=True))
            return 0

        teardown = validate_teardown(root / "teardown-proof.json")
        validate_results_document(root / "experiment-results.md")
        print(json.dumps(summarize(summaries, recovery, teardown), indent=2, sort_keys=True))
        return 0
    except EvidenceError as exc:
        print("FAIL: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
