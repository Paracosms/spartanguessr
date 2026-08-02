#!/usr/bin/env python3
"""Focused local tests for the reduced Day 2 evidence validator."""

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


VALIDATOR_PATH = Path(__file__).with_name("validate-day2-evidence.py")
SPEC = importlib.util.spec_from_file_location("day2_evidence_validator", VALIDATOR_PATH)
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class EvidenceValidatorTests(unittest.TestCase):
    def test_detects_ipv4_and_ipv6_without_rejecting_timestamp(self):
        self.assertTrue(VALIDATOR.contains_ip_address("client=192.0.2.1"))
        self.assertTrue(VALIDATOR.contains_ip_address("client=2001:db8::1"))
        self.assertTrue(VALIDATOR.contains_ip_address("client=[fe80::1%eth0]"))
        self.assertFalse(
            VALIDATOR.contains_ip_address("timestamp=2026-07-31T10:00:00Z")
        )

    def test_recovery_uses_success_after_final_readiness_failure(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            csv_path = root / "recovery-probe.csv"
            metadata_path = root / "recovery-metadata.json"
            rows = (
                ("2026-07-31T09:59:59.0000000Z", "/health", "200", "success", "10"),
                ("2026-07-31T09:59:59.1000000Z", "/ready", "200", "success", "10"),
                ("2026-07-31T10:00:00.2000000Z", "/ready", "200", "success", "10"),
                ("2026-07-31T10:00:01.1000000Z", "/ready", "503", "failure", "10"),
                ("2026-07-31T10:00:02.2000000Z", "/ready", "503", "failure", "10"),
                ("2026-07-31T10:00:04.0000000Z", "/ready", "200", "success", "10"),
            )
            with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
                writer = csv.writer(csv_file)
                writer.writerow(
                    ("timestamp_utc", "endpoint", "http_status", "outcome", "elapsed_ms")
                )
                writer.writerows(rows)
            metadata_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "failure_triggered_at_utc": "2026-07-31T10:00:00Z",
                        "post_recovery_smoke": "passed",
                    }
                ),
                encoding="utf-8",
            )

            recovery = VALIDATOR.validate_recovery(csv_path, metadata_path)

            self.assertEqual(recovery["ready_recovery_ms"], 4000)

    def test_recovery_rejects_invalid_elapsed_value_cleanly(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            csv_path = Path(temporary_directory) / "recovery-probe.csv"
            metadata_path = Path(temporary_directory) / "recovery-metadata.json"
            csv_path.write_text(
                "timestamp_utc,endpoint,http_status,outcome,elapsed_ms\n"
                "2026-07-31T10:00:00Z,/ready,200,success,not-a-number\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "invalid elapsed-millisecond value",
            ):
                VALIDATOR.validate_recovery(csv_path, metadata_path)

    def test_summary_requires_the_fixed_measured_configuration(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            summary_path = Path(temporary_directory) / "run-1-summary.json"
            summary_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "test_config": {
                            "scenario": "smoke",
                            "vus": 1,
                            "duration": "30s",
                            "pause_seconds": 1,
                        },
                        "metrics": {
                            "completed_games_per_minute": 1,
                            "request_p95_ms": 2,
                            "http_failure_rate": 0,
                        },
                        "thresholds": {
                            "all_checks_passed": True,
                            "http_failure_rate_at_most_one_percent": True,
                            "at_least_one_game_completed": True,
                            "no_game_flow_failures": True,
                        },
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "fixed test configuration",
            ):
                VALIDATOR.validate_summary(summary_path, VALIDATOR.MEASURED_CONFIG)

    def test_summary_must_contain_a_completed_game(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            summary_path = Path(temporary_directory) / "run-1-summary.json"
            summary_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "test_config": VALIDATOR.MEASURED_CONFIG,
                        "metrics": {
                            "completed_games_per_minute": 0,
                            "request_p95_ms": 2,
                            "http_failure_rate": 0,
                        },
                        "thresholds": {
                            "all_checks_passed": True,
                            "http_failure_rate_at_most_one_percent": True,
                            "at_least_one_game_completed": True,
                            "no_game_flow_failures": True,
                        },
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "contains no completed game",
            ):
                VALIDATOR.validate_summary(summary_path, VALIDATOR.MEASURED_CONFIG)

    def test_results_document_only_needs_resume_sections(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            results_path = Path(temporary_directory) / "experiment-results.md"
            results_path.write_text(
                "\n".join(
                    (
                        "## Benchmark measurements",
                        "games/min and request p95",
                        "## Recovery measurement",
                        "readiness recovered",
                        "## Limitations",
                        "short experiment",
                        "## Resume bullet",
                        "measured values",
                    )
                ),
                encoding="utf-8",
            )
            VALIDATOR.validate_results_document(results_path)


if __name__ == "__main__":
    unittest.main()
