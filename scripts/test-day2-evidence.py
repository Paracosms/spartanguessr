#!/usr/bin/env python3
"""Focused local tests for the sanitized Day 2 evidence validator."""

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

    def test_recovery_uses_success_after_final_failure(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            csv_path = root / "recovery-probe.csv"
            metadata_path = root / "recovery-metadata.json"
            rows = (
                ("2026-07-31T09:59:59.0000000Z", "/health", "200", "success", "10"),
                ("2026-07-31T09:59:59.1000000Z", "/ready", "200", "success", "10"),
                ("2026-07-31T10:00:00.1000000Z", "/health", "200", "success", "10"),
                ("2026-07-31T10:00:00.2000000Z", "/ready", "200", "success", "10"),
                ("2026-07-31T10:00:01.0000000Z", "/health", "", "failure", "1000"),
                ("2026-07-31T10:00:01.1000000Z", "/ready", "503", "failure", "10"),
                ("2026-07-31T10:00:02.0000000Z", "/health", "", "failure", "1000"),
                ("2026-07-31T10:00:02.2000000Z", "/ready", "503", "failure", "10"),
                ("2026-07-31T10:00:03.0000000Z", "/health", "200", "success", "10"),
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
                        "container_restart_count": 1,
                        "post_recovery_smoke": "passed",
                    }
                ),
                encoding="utf-8",
            )

            recovery = VALIDATOR.validate_recovery(csv_path, metadata_path)

            self.assertEqual(recovery["public_probe_error_count"], 4)
            self.assertEqual(recovery["health_first_success_after_trigger_ms"], 3000)
            self.assertEqual(recovery["ready_first_success_after_trigger_ms"], 4000)

    def test_recovery_rejects_invalid_elapsed_value_cleanly(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            csv_path = Path(temporary_directory) / "recovery-probe.csv"
            metadata_path = Path(temporary_directory) / "recovery-metadata.json"
            csv_path.write_text(
                "timestamp_utc,endpoint,http_status,outcome,elapsed_ms\n"
                "2026-07-31T10:00:00Z,/health,200,success,not-a-number\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "invalid elapsed-millisecond value",
            ):
                VALIDATOR.validate_recovery(csv_path, metadata_path)

    def test_summary_must_match_frozen_run_set(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            summary_path = Path(temporary_directory) / "run-1-summary.json"
            summary_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "test_config": {
                            "run_id": "run-1",
                            "run_set_id": "wrong-run-set",
                            "scenario": "measured",
                            "vus": 5,
                            "duration": "2m",
                            "pause_seconds": 1,
                        },
                        "metrics": {},
                        "thresholds": {},
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "run-set ID does not match",
            ):
                VALIDATOR.validate_summary(
                    summary_path,
                    "run-1",
                    "expected-run-set",
                    {
                        "scenario": "measured",
                        "vus": 5,
                        "duration": "2m",
                        "pause_seconds": 1,
                    },
                )

    def test_summary_cannot_claim_threshold_success_without_completed_game(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            summary_path = Path(temporary_directory) / "run-1-summary.json"
            summary_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "test_config": {
                            "run_id": "run-1",
                            "run_set_id": "expected-run-set",
                            "scenario": "measured",
                            "vus": 5,
                            "duration": "2m",
                            "pause_seconds": 1,
                        },
                        "metrics": {
                            "games_completed": {
                                "count": 0,
                                "per_second": 0,
                                "per_minute": 0,
                            },
                            "full_game_duration_ms": {
                                "min": 1,
                                "average": 2,
                                "p50": 2,
                                "p95": 3,
                                "max": 3,
                            },
                            "http_requests": {
                                "count": 1,
                                "requests_per_second": 1,
                            },
                            "request_duration_ms": {"p50": 1, "p95": 2},
                            "http_failures": {"rate": 0},
                            "http_429s": {"count": 0, "per_second": 0},
                            "game_flow_failures": {"count": 0, "per_second": 0},
                            "checks": {"pass_rate": 1},
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
                VALIDATOR.validate_summary(
                    summary_path,
                    "run-1",
                    "expected-run-set",
                    {
                        "scenario": "measured",
                        "vus": 5,
                        "duration": "2m",
                        "pause_seconds": 1,
                    },
                )

    def test_teardown_proof_requires_ordered_complete_cleanup(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            proof_path = Path(temporary_directory) / "teardown-proof.json"
            proof = {
                "schema_version": 1,
                "droplet_created_at_utc": "2026-07-31T08:00:00Z",
                "experiment_started_at_utc": "2026-07-31T09:00:00Z",
                "experiment_ended_at_utc": "2026-07-31T10:05:00Z",
                "resource_types_before_teardown": [
                    "droplet",
                    "cloud_firewall",
                    "dns_a_record",
                ],
                "actual_cost": {"amount": 0, "currency": "USD"},
                "droplet_destroyed_at_utc": "2026-07-31T10:00:00Z",
                "firewall_deleted_at_utc": "2026-07-31T10:01:00Z",
                "dns_record_deleted_at_utc": "2026-07-31T10:02:00Z",
                "temporary_api_token_status": "not_created",
                "remaining_experiment_resources": [],
                "residual_resources_confirmed_at_utc": "2026-07-31T10:03:00Z",
                "render_unchanged": True,
                "render_unchanged_confirmed_at_utc": "2026-07-31T10:04:00Z",
            }
            proof_path.write_text(json.dumps(proof), encoding="utf-8")

            self.assertEqual(
                VALIDATOR.validate_teardown(proof_path)["render_unchanged"],
                True,
            )

            proof["remaining_experiment_resources"] = ["unexpected_resource"]
            proof_path.write_text(json.dumps(proof), encoding="utf-8")
            with self.assertRaisesRegex(
                VALIDATOR.EvidenceError,
                "empty remaining_experiment_resources",
            ):
                VALIDATOR.validate_teardown(proof_path)


if __name__ == "__main__":
    unittest.main()
