#!/usr/bin/env python3
"""Dependency-free smoke test for the SpartanGuessr backend API.

Creates a normal session, plays five valid rounds, fetches results,
and exits nonzero on any inconsistency.

Never prints session IDs, coordinates, tokens, or response bodies.
"""

import json
import sys
import urllib.error
import urllib.request


def _jpost(url, body):
    """POST JSON and return the parsed response."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body_text = ""
        try:
            body_text = exc.read().decode(errors="replace")[:200]
        except Exception:
            pass
        raise SystemExit(f"HTTP {exc.code} on POST {url}: {body_text}")


def _jget(url):
    """GET JSON and return the parsed response."""
    try:
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body_text = ""
        try:
            body_text = exc.read().decode(errors="replace")[:200]
        except Exception:
            pass
        raise SystemExit(f"HTTP {exc.code} on GET {url}: {body_text}")


def _assert(condition, message):
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def smoke(base_url):
    base = base_url.rstrip("/")

    # --- 1. Create session ---
    session = _jpost(
        f"{base}/session",
        {
            "difficulty": "medium",
            "max_rounds": 5,
            "outside_only": False,
        },
    )
    sid = session.get("session_id", "")
    _assert(isinstance(sid, str) and len(sid) == 64, "session_id is not a 64-char hex string")
    _assert(session["difficulty"] == "medium", "wrong difficulty in session response")
    _assert(session["max_rounds"] == 5, "wrong max_rounds")
    _assert(session["current_round"] == 1, "initial round is not 1")

    # --- 2. Play five rounds ---
    for expected_round in range(1, 6):
        # Request a round image
        img_resp = _jget(f"{base}/random-image?session_id={sid}")

        # Game must not be completed prematurely
        _assert(
            img_resp.get("completed") is not True,
            "game unexpectedly marked complete before 5 rounds",
        )
        _assert(
            img_resp["round_number"] == expected_round,
            f"round_number mismatch: expected {expected_round}, got {img_resp.get('round_number')}",
        )
        _assert(
            isinstance(img_resp.get("image_url"), str)
            and img_resp["image_url"].startswith("http"),
            "image_url missing or invalid",
        )

        # Submit a guess at fixed coordinates
        guess = _jpost(
            f"{base}/guess",
            {
                "session_id": sid,
                "round_number": expected_round,
                "guess_latitude": 500.0,
                "guess_longitude": 600.0,
            },
        )

        _assert(
            guess["round_number"] == expected_round,
            f"guess round_number mismatch: {guess.get('round_number')}",
        )
        _assert(isinstance(guess["distance_meters"], (int, float)), "distance_meters not numeric")
        _assert(isinstance(guess["score"], int), "score not integer")
        _assert(isinstance(guess["total_score"], int), "total_score not integer")
        _assert(guess["total_score"] >= 0, "total_score negative")
        _assert(
            isinstance(guess["actual_latitude"], (int, float))
            and isinstance(guess["actual_longitude"], (int, float)),
            "actual coordinates missing or non-numeric",
        )
        _assert(
            isinstance(guess["guess_latitude"], (int, float))
            and isinstance(guess["guess_longitude"], (int, float)),
            "guess coordinates missing or non-numeric",
        )

        if expected_round < 5:
            _assert(guess["game_complete"] is False, "game_complete should be False before round 5")
            _assert(
                guess["next_round_number"] == expected_round + 1,
                f"next_round_number should be {expected_round + 1}",
            )
        else:
            _assert(guess["game_complete"] is True, "game_complete should be True after round 5")
            _assert(guess["next_round_number"] is None, "next_round_number should be None after last round")

    # --- 3. Fetch results ---
    results = _jget(f"{base}/session/{sid}/results")

    _assert(results["session_id"] == sid, "results session_id mismatch")
    _assert(results["difficulty"] == "medium", "results difficulty mismatch")
    _assert(results["rounds_played"] == 5, "rounds_played != 5")
    _assert(isinstance(results["total_score"], (int, float)), "total_score not numeric")
    _assert(isinstance(results["average_distance"], (int, float)), "average_distance not numeric")
    _assert(isinstance(results["smallest_distance"], (int, float)), "smallest_distance not numeric")
    _assert(isinstance(results["largest_distance"], (int, float)), "largest_distance not numeric")
    _assert(len(results["rounds"]) == 5, "results rounds list length != 5")

    for i, rnd in enumerate(results["rounds"]):
        _assert(rnd["round_number"] == i + 1, f"result round {i} has wrong round_number")
        _assert(isinstance(rnd["distance_meters"], (int, float)), f"round {i+1} distance not numeric")
        _assert(isinstance(rnd["score"], int), f"round {i+1} score not integer")

    computed_total = sum(r["score"] for r in results["rounds"])
    _assert(
        computed_total == results["total_score"],
        f"total_score {results['total_score']} != sum of round scores {computed_total}",
    )

    print("PASS")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <base_url>", file=sys.stderr)
        sys.exit(2)

    try:
        smoke(sys.argv[1])
    except SystemExit:
        raise
    except Exception as exc:
        print(f"FAIL: {exc}")
        sys.exit(1)
