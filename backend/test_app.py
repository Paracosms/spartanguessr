"""
Tests for SpartanGuessr backend.
Uses Flask's test client with Redis mocked out so no live Upstash connection is needed.

Run with: pytest test_app.py -v
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    """Reusable mock redis object with sensible defaults."""
    r = MagicMock()
    r.get.return_value = None       # no session by default
    r.hgetall.return_value = {}     # fallback hash also empty (load_session uses both)
    r.set.return_value = True
    r.lpush.return_value = 1
    r.expire.return_value = True
    r.lrange.return_value = []
    r.zcard.return_value = 0
    r.zrange.return_value = []
    r.zadd.return_value = 1
    r.zrevrank.return_value = 0     # position 1 (0-indexed)
    r.zremrangebyrank.return_value = 0
    r.zcount.return_value = 0
    r.set.return_value = True       # nx lock returns True = acquired
    r.delete.return_value = 1
    return r


@pytest.fixture
def app(mock_redis):
    """Create a test Flask app with Redis patched."""
    with patch("app.redis", mock_redis), \
         patch("app.acquire_session_lock", return_value="lock-token"), \
         patch("app.release_session_lock", return_value=None):
        import app as flask_app
        flask_app.app.config["TESTING"] = True
        yield flask_app.app, flask_app, mock_redis


@pytest.fixture
def client(app):
    flask_app, _, _ = app
    return flask_app.test_client()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def make_session_json(**overrides):
    """Build a minimal valid session dict for mock redis.get to return."""
    base = {
        "session_id": "test-session-123",
        "difficulty": "hard",
        "max_rounds": "5",
        "current_round": "1",
        "outside_only": "false",
        "seed": "abc",
        "leaderboard_mode": "true",
        "current_image_url": "",
        "total_score": "0",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    base.update(overrides)
    return json.dumps(base)


# ---------------------------------------------------------------------------
# Session TTL tests
# ---------------------------------------------------------------------------

class TestSessionTTL:
    def test_create_session_sets_ttl(self, app, client):
        """save_session should call redis.set with ex=SESSION_TTL_SECONDS."""
        _, flask_app, mock_redis = app

        res = client.post("/session", json={
            "difficulty": "medium",
            "max_rounds": 5,
            "outside_only": False,
            "seed": "testseed",
            "leaderboard_mode": False,
        })

        assert res.status_code == 201
        # verify set was called with an expiry
        set_calls = mock_redis.set.call_args_list
        session_set = [c for c in set_calls if "session:" in str(c.args)]
        assert session_set, "redis.set was never called for the session key"
        _, kwargs = session_set[0].args, session_set[0].kwargs
        assert "ex" in kwargs, "redis.set must include ex= for TTL"
        assert kwargs["ex"] == flask_app.SESSION_TTL_SECONDS

    def test_session_ttl_value_is_24_hours(self, app):
        """SESSION_TTL_SECONDS should be exactly 86400 (24 hours)."""
        _, flask_app, _ = app
        assert flask_app.SESSION_TTL_SECONDS == 86400


# ---------------------------------------------------------------------------
# Guess TTL tests
# ---------------------------------------------------------------------------

class TestGuessTTL:
    def test_save_guess_calls_expire(self, app):
        """save_guess should call redis.expire with SESSION_TTL_SECONDS after lpush."""
        _, flask_app, mock_redis = app
        from models import Guess

        guess = Guess("sess-1", "/image/hard/outside/1", 1, 10.0, 20.0, 100.0, 4500, "seed")

        with patch("app.redis", mock_redis):
            flask_app.save_guess(guess)

        # lpush then expire on the same key
        expected_key = "session:sess-1:guesses"
        mock_redis.lpush.assert_called_once_with(expected_key, guess.to_json())
        mock_redis.expire.assert_called_once_with(expected_key, flask_app.SESSION_TTL_SECONDS)

    def test_guess_ttl_matches_session_ttl(self, app):
        """Guess TTL and session TTL must be the same so they expire together."""
        _, flask_app, mock_redis = app
        from models import Guess

        guess = Guess("sess-2", "/image/hard/outside/1", 1, 10.0, 20.0, 100.0, 4500, "seed")

        with patch("app.redis", mock_redis):
            flask_app.save_guess(guess)

        expire_ttl = mock_redis.expire.call_args[0][1]
        assert expire_ttl == flask_app.SESSION_TTL_SECONDS


# ---------------------------------------------------------------------------
# Leaderboard cap tests
# ---------------------------------------------------------------------------

class TestLeaderboardCap:
    def test_add_to_leaderboard_trims_after_add(self, client, app):
        """POST /leaderboard must call zremrangebyrank to enforce the 50-entry cap."""
        _, flask_app, mock_redis = app

        res = client.post("/leaderboard", json={"name": "Player1", "score": 9999})

        assert res.status_code == 201
        mock_redis.zremrangebyrank.assert_called_once_with(
            flask_app.LEADERBOARD_KEY,
            0,
            -(flask_app.MAX_LEADERBOARD_SIZE + 1),
        )

    def test_trim_happens_after_zadd(self, client, app):
        """zremrangebyrank must be called after zadd, not before."""
        _, flask_app, mock_redis = app
        call_order = []

        mock_redis.zadd.side_effect = lambda *a, **kw: call_order.append("zadd")
        mock_redis.zremrangebyrank.side_effect = lambda *a, **kw: call_order.append("zremrangebyrank")

        client.post("/leaderboard", json={"name": "Player2", "score": 5000})

        assert call_order == ["zadd", "zremrangebyrank"], \
            f"Expected zadd then zremrangebyrank, got: {call_order}"

    def test_add_leaderboard_returns_position(self, client, app):
        """POST /leaderboard should return name, score, and position."""
        _, _, mock_redis = app
        mock_redis.zrevrank.return_value = 2  # 0-indexed → position 3

        res = client.post("/leaderboard", json={"name": "Player3", "score": 7500})
        data = res.get_json()

        assert res.status_code == 201
        assert data["name"] == "Player3"
        assert data["score"] == 7500
        assert data["position"] == 3


# ---------------------------------------------------------------------------
# Leaderboard read tests
# ---------------------------------------------------------------------------

class TestLeaderboardRead:
    def test_get_leaderboard_empty(self, client, app):
        """GET /leaderboard returns empty list when no scores exist."""
        _, _, mock_redis = app
        mock_redis.zrange.return_value = []

        res = client.get("/leaderboard")
        assert res.status_code == 200
        assert res.get_json() == []

    def test_get_leaderboard_ranks(self, client, app):
        """Tied scores share the same rank; distinct scores get sequential ranks."""
        _, _, mock_redis = app
        mock_redis.zrange.return_value = [
            ("Alice", 5000),
            ("Bob", 5000),   # tied with Alice
            ("Carol", 3000),
        ]

        res = client.get("/leaderboard")
        data = res.get_json()

        assert data[0]["rank"] == 1  # Alice
        assert data[1]["rank"] == 1  # Bob — tied
        assert data[2]["rank"] == 3  # Carol — skips rank 2


# ---------------------------------------------------------------------------
# Leaderboard qualify tests
# ---------------------------------------------------------------------------

class TestLeaderboardQualify:
    def test_qualifies_when_board_not_full(self, client, app):
        """Score always qualifies when fewer than 50 entries exist."""
        _, _, mock_redis = app
        mock_redis.zcard.return_value = 10
        mock_redis.zcount.return_value = 5  # 5 scores above → position 6

        res = client.get("/leaderboard/qualify?score=1000")
        data = res.get_json()

        assert res.status_code == 200
        assert data["qualifies"] is True
        assert data["position"] == 6

    def test_does_not_qualify_when_score_too_low(self, client, app):
        """Score below the lowest top-50 entry should not qualify."""
        _, _, mock_redis = app
        mock_redis.zcard.return_value = 50
        mock_redis.zrange.return_value = [("Lowest", 9000)]  # lowest in top 50

        res = client.get("/leaderboard/qualify?score=100")
        data = res.get_json()

        assert res.status_code == 200
        assert data["qualifies"] is False

    def test_qualify_missing_score_param(self, client):
        """GET /leaderboard/qualify without score param returns 400."""
        res = client.get("/leaderboard/qualify")
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Leaderboard input validation tests
# ---------------------------------------------------------------------------

class TestLeaderboardValidation:
    def test_rejects_missing_name(self, client):
        res = client.post("/leaderboard", json={"score": 5000})
        assert res.status_code == 400
        assert "Name" in res.get_json()["error"]

    def test_rejects_negative_score(self, client):
        res = client.post("/leaderboard", json={"name": "Player", "score": -1})
        assert res.status_code == 400

    def test_rejects_missing_body(self, client):
        res = client.post("/leaderboard", content_type="application/json", data="")
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Session creation tests
# ---------------------------------------------------------------------------

class TestSessionCreation:
    def test_leaderboard_mode_forces_hard_difficulty(self, client):
        """Leaderboard mode should override difficulty to hard and max_rounds to 5."""
        res = client.post("/session", json={
            "difficulty": "easy",
            "max_rounds": 10,
            "leaderboard_mode": True,
            "seed": "xyz",
        })
        data = res.get_json()

        assert res.status_code == 201
        assert data["difficulty"] == "hard"
        assert data["max_rounds"] == 5
        assert data["leaderboard_mode"] is True

    def test_normal_mode_respects_settings(self, client):
        """Non-leaderboard games should use whatever settings were passed."""
        res = client.post("/session", json={
            "difficulty": "easy",
            "max_rounds": 3,
            "leaderboard_mode": False,
            "seed": "xyz",
        })
        data = res.get_json()

        assert res.status_code == 201
        assert data["difficulty"] == "easy"
        assert data["max_rounds"] == 3

    def test_invalid_difficulty_rejected(self, client):
        res = client.post("/session", json={"difficulty": "insane", "max_rounds": 5})
        assert res.status_code == 400
