#!/usr/bin/env python3
"""Validate only the sanitized, resume-facing Day 2 measurements."""

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
    """Raised when local evidence is missing, inconsistent, or unsafe."""


SUMMARY_METRICS = (
    "completed_games_per_minute",
    "request_p95_ms",
    "http_failure_rate",
)
SUMMARY_THRESHOLDS = (
    "all_checks_passed",
    "http_failure_rate_at_most_one_percent",
    "at_least_one_game_completed",
    "no_game_flow_failures",
)
SMOKE_CONFIG = {
    "scenario": "smoke",
    "vus": 1,
    "duration": "30s",
    "pause_seconds": 1,
}
MEASURED_CONFIG = {
    "scenario": "measured",
    "vus": 5,
    "duration": "2m",
    "pause_seconds": 1,
}


def fail(message):
    raise EvidenceError(message)


def read_text(path):
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        fail(f"Unable to read {path}: {exc}")


def contains_ip_address(text):
    for token in re.findall(r"[0-9A-Fa-f:.%]+", text):
        candidate = token.strip("[]")
        if "%" in candidate:
            candidate = candidate.split("%", 1)[0]
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            continue
        return True
    return False


def reject_prohibited_content(path):
    text = read_text(path)
    prohibited = (
        (r"https?://", "a raw URL"),
        (r"(?i)\b(?:authorization|bearer|access[_ -]?token|api[_ -]?token)\b", "a credential field"),
        (r"(?i)\b(?:session[_ -]?id|client[_ -]?ip)\b", "an identifier field"),
        (r"(?i)\b(?:guess[_ -]?(?:latitude|longitude)|coordinates?)\b", "coordinate data"),
        (r"(?i)\b(?:request|response)[_ -]?bod(?:y|ies)\b", "a request or response body"),
        (r"(?i)\bheaders?\b", "request headers"),
    )
    for pattern, description in prohibited:
        if re.search(pattern, text):
            fail(f"{path.name} contains {description}.")
    if contains_ip_address(text):
        fail(f"{path.name} contains an IP address.")
    return text


def load_json(path):
    text = reject_prohibited_content(path)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {path.name}: {exc}")


def expect_keys(value, expected, label):
    if not isinstance(value, dict) or set(value) != set(expected):
        fail(f"{label} has unexpected fields.")


def expect_number(value, label, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{label} must be a finite number.")
    if minimum is not None and value < minimum:
        fail(f"{label} must be at least {minimum}.")
    if maximum is not None and value > maximum:
        fail(f"{label} must be at most {maximum}.")


def expect_integer(value, label, minimum=None):
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"{label} must be an integer.")
    if minimum is not None and value < minimum:
        fail(f"{label} must be at least {minimum}.")


def parse_utc(value, label):
    if not isinstance(value, str) or not value:
        fail(f"{label} must be a UTC timestamp.")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    match = re.search(r"\.(\d+)(?=[+-]\d\d:\d\d)$", normalized)
    if match and len(match.group(1)) > 6:
        normalized = normalized[: match.start(1)] + match.group(1)[:6] + normalized[match.end(1) :]
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        fail(f"{label} must be an ISO-8601 timestamp.")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        fail(f"{label} must include a UTC offset.")
    return parsed.astimezone(timezone.utc)


def validate_summary(path, expected_config):
    summary = load_json(path)
    expect_keys(summary, ("schema_version", "test_config", "metrics", "thresholds"), path.name)
    if summary["schema_version"] != 1:
        fail(f"{path.name} has an unsupported schema version.")

    config = summary["test_config"]
    expect_keys(config, ("scenario", "vus", "duration", "pause_seconds"), f"{path.name}.test_config")
    if config != expected_config:
        fail(f"{path.name} does not use the required fixed test configuration.")

    metrics = summary["metrics"]
    expect_keys(metrics, SUMMARY_METRICS, f"{path.name}.metrics")
    expect_number(metrics["completed_games_per_minute"], f"{path.name}.completed_games_per_minute", minimum=0)
    if metrics["completed_games_per_minute"] <= 0:
        fail(f"{path.name} contains no completed game.")
    expect_number(metrics["request_p95_ms"], f"{path.name}.request_p95_ms", minimum=0)
    expect_number(metrics["http_failure_rate"], f"{path.name}.http_failure_rate", minimum=0, maximum=1)
    if metrics["http_failure_rate"] > 0.01:
        fail(f"{path.name} exceeds the one-percent HTTP failure limit.")

    thresholds = summary["thresholds"]
    expect_keys(thresholds, SUMMARY_THRESHOLDS, f"{path.name}.thresholds")
    if not all(value is True for value in thresholds.values()):
        fail(f"{path.name} reports a failed threshold.")
    return summary


def validate_benchmark_summaries(root):
    benchmark_root = root / "benchmarks"
    expected_names = {
        "smoke-summary.json",
        "run-1-summary.json",
        "run-2-summary.json",
        "run-3-summary.json",
    }
    try:
        actual_names = {path.name for path in benchmark_root.glob("*-summary.json") if path.is_file()}
    except OSError:
        fail("Unable to inspect the benchmark evidence directory.")
    if actual_names != expected_names:
        fail("Benchmark evidence must contain exactly one smoke summary and three measured summaries.")

    validate_summary(benchmark_root / "smoke-summary.json", SMOKE_CONFIG)
    return [
        validate_summary(benchmark_root / f"run-{run_number}-summary.json", MEASURED_CONFIG)
        for run_number in (1, 2, 3)
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
        expect_number(elapsed_ms, f"{path.name}.elapsed_ms", minimum=0)
        parsed_rows.append((timestamp, row))

    metadata = load_json(metadata_path)
    expect_keys(
        metadata,
        ("schema_version", "failure_triggered_at_utc", "post_recovery_smoke"),
        metadata_path.name,
    )
    if metadata["schema_version"] != 1:
        fail(f"{metadata_path.name} has an unsupported schema version.")
    triggered_at = parse_utc(metadata["failure_triggered_at_utc"], "recovery trigger time")
    if metadata["post_recovery_smoke"] != "passed":
        fail("Post-recovery smoke must pass before claiming a readiness recovery time.")

    pre_trigger_successes = [
        timestamp
        for timestamp, row in parsed_rows
        if row["endpoint"] == "/ready"
        and timestamp < triggered_at
        and row["outcome"] == "success"
    ]
    if not pre_trigger_successes:
        fail(f"{path.name} has no healthy pre-trigger /ready observation.")

    post_trigger_rows = [
        (timestamp, row)
        for timestamp, row in parsed_rows
        if row["endpoint"] == "/ready" and timestamp >= triggered_at
    ]
    if not post_trigger_rows:
        fail(f"{path.name} has no post-trigger /ready observations.")
    failure_timestamps = [
        timestamp for timestamp, row in post_trigger_rows if row["outcome"] == "failure"
    ]
    if not failure_timestamps:
        fail(f"{path.name} has no observed post-trigger readiness failure.")
    last_failure = failure_timestamps[-1]
    recovered_successes = [
        timestamp
        for timestamp, row in post_trigger_rows
        if row["outcome"] == "success" and timestamp > last_failure
    ]
    if not recovered_successes:
        fail(f"{path.name} has no readiness success after the final failure.")

    return {
        "ready_recovery_ms": round((recovered_successes[0] - triggered_at).total_seconds() * 1000, 3),
    }


def validate_results_document(path):
    text = reject_prohibited_content(path)
    if "[NOT MEASURED" in text or "[NOT ELIGIBLE" in text:
        fail(f"{path.name} still contains an unfilled measurement placeholder.")
    for section in (
        "## Benchmark measurements",
        "## Recovery measurement",
        "## Limitations",
        "## Resume bullet",
    ):
        if section not in text:
            fail(f"{path.name} is missing the required section {section}.")
    for term in ("games/min", "p95", "readiness"):
        if term.lower() not in text.lower():
            fail(f"{path.name} is missing the required resume metric {term}.")


def median_and_spread(values):
    return {
        "median": statistics.median(values),
        "spread_min": min(values),
        "spread_max": max(values),
    }


def summarize(summaries, recovery):
    measurements = [
        {
            "run": f"run-{index}",
            "completed_games_per_minute": summary["metrics"]["completed_games_per_minute"],
            "request_p95_ms": summary["metrics"]["request_p95_ms"],
        }
        for index, summary in enumerate(summaries, start=1)
    ]
    return {
        "status": "valid_sanitized_evidence",
        "measured_runs": measurements,
        "median_and_spread": {
            "completed_games_per_minute": median_and_spread(
                [item["completed_games_per_minute"] for item in measurements]
            ),
            "request_p95_ms": median_and_spread(
                [item["request_p95_ms"] for item in measurements]
            ),
        },
        "ready_recovery_seconds": round(recovery["ready_recovery_ms"] / 1000, 3),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Validate local sanitized Day 2 resume evidence without network access."
    )
    parser.add_argument(
        "--evidence-dir",
        type=Path,
        default=Path("evidence/day2"),
        help="Directory containing the Day 2 evidence.",
    )
    args = parser.parse_args()
    root = args.evidence_dir

    try:
        summaries = validate_benchmark_summaries(root)
        recovery = validate_recovery(
            root / "recovery" / "recovery-probe.csv",
            root / "recovery" / "recovery-metadata.json",
        )
        validate_results_document(root / "experiment-results.md")
        print(json.dumps(summarize(summaries, recovery), indent=2, sort_keys=True))
        return 0
    except EvidenceError as exc:
        print("FAIL: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
