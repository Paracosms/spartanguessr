"""
Tests for SpartanGuessr backend.
Uses Flask's test client with Redis mocked out so no live Upstash connection is needed.

Run with: pytest tests.py -v
"""

import json
import importlib
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

from image_catalog import load_image_catalog


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    """Reusable mock redis object with sensible defaults."""
    r = MagicMock()
    r.get.return_value = None       # no session by default
    r.set.return_value = True
    r.incr.return_value = 1
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
def catalog_path(tmp_path):
    images = {}
    for index, (difficulty, location) in enumerate(
        (difficulty, location)
        for difficulty in ("easy", "medium", "hard")
        for location in ("inside", "outside")
    ):
        image_id = f"{index + 1:032x}"
        images[image_id] = {
            "object_key": f"{image_id}.jpg",
            "difficulty": difficulty,
            "location": location,
            "x": 100 + index,
            "y": 200 + index,
        }
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"version": 1, "images": images}), encoding="utf-8")
    return path


@pytest.fixture
def app(mock_redis, catalog_path):
    """Create a test Flask app with Redis patched."""
    with patch.dict(os.environ, {
        "UPSTASH_REDIS_REST_URL": "https://example.com",
        "UPSTASH_REDIS_REST_TOKEN": "test-token",
        "ALLOWED_ORIGIN": "http://localhost:5173",
        "IMAGE_CATALOG_PATH": str(catalog_path),
        "IMAGE_CDN_BASE_URL": "https://images.example.com",
    }, clear=False):
        sys.modules.pop("app", None)
        flask_app = importlib.import_module("app")
        flask_app.redis = mock_redis
        flask_app.acquire_session_lock = MagicMock(return_value="lock-token")
        flask_app.release_session_lock = MagicMock(return_value=None)
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
        "current_image_id": "",
        "total_score": "0",
        "leaderboard_submitted": "false",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    base.update(overrides)
    return json.dumps(base)


def mock_completed_leaderboard_session(mock_redis, **overrides):
    """Configure redis.get to return a completed leaderboard-mode session."""
    session_data = {
        "current_round": "6",
        "total_score": "9999",
        "leaderboard_mode": "true",
        "leaderboard_submitted": "false",
    }
    session_data.update(overrides)
    mock_redis.get.return_value = make_session_json(**session_data)


class TestLoadSession:
    def test_load_session_returns_none_when_missing(self, app):
        _, flask_app, mock_redis = app

        assert flask_app.load_session("missing-session") is None
        mock_redis.get.assert_called_once_with("session:missing-session")

    def test_load_session_decodes_json_bytes(self, app):
        _, flask_app, mock_redis = app
        mock_redis.get.return_value = make_session_json(
            session_id="json-session",
            difficulty="medium",
            max_rounds="3",
        ).encode("utf-8")

        session = flask_app.load_session("json-session")

        assert session is not None
        assert session.session_id == "json-session"
        assert session.difficulty == "medium"
        assert session.max_rounds == 3


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
        """SESSION_TTL_SECONDS should be exactly 3600 (1 hour)."""
        _, flask_app, _ = app
        assert flask_app.SESSION_TTL_SECONDS == 3600


# ---------------------------------------------------------------------------
# Guess TTL tests
# ---------------------------------------------------------------------------

class TestGuessTTL:
    def test_save_guess_calls_expire(self, app):
        """save_guess should call redis.expire with SESSION_TTL_SECONDS after lpush."""
        _, flask_app, mock_redis = app
        from models import Guess

        guess = Guess("sess-1", "00000000000000000000000000000001", 1, 10.0, 20.0, 100.0, 4500)

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

        guess = Guess("sess-2", "00000000000000000000000000000001", 1, 10.0, 20.0, 100.0, 4500)

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
        mock_completed_leaderboard_session(mock_redis)

        res = client.post("/leaderboard", json={"session_id": "test-session-123", "name": "Player1"})

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
        mock_completed_leaderboard_session(mock_redis, total_score="5000")

        mock_redis.zadd.side_effect = lambda *a, **kw: call_order.append("zadd")
        mock_redis.zremrangebyrank.side_effect = lambda *a, **kw: call_order.append("zremrangebyrank")

        client.post("/leaderboard", json={"session_id": "test-session-123", "name": "Player2"})

        assert call_order == ["zadd", "zremrangebyrank"], \
            f"Expected zadd then zremrangebyrank, got: {call_order}"

    def test_add_leaderboard_returns_position(self, client, app):
        """POST /leaderboard should return name, score, and position."""
        _, _, mock_redis = app
        mock_redis.zrevrank.return_value = 2  # 0-indexed → position 3
        mock_completed_leaderboard_session(mock_redis, total_score="7500")

        res = client.post("/leaderboard", json={"session_id": "test-session-123", "name": "Player3"})
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
        res = client.post("/leaderboard", json={"session_id": "test-session-123"})
        assert res.status_code == 400
        assert "Name" in res.get_json()["error"]

    def test_rejects_missing_session_id(self, client):
        res = client.post("/leaderboard", json={"name": "Player"})
        assert res.status_code == 400

    def test_rejects_client_supplied_score(self, client):
        res = client.post("/leaderboard", json={
            "session_id": "test-session-123",
            "name": "Player",
            "score": 99999,
        })
        assert res.status_code == 400
        assert "server-side" in res.get_json()["error"]

    def test_rejects_console_exploit_shape(self, client):
        res = client.post("/leaderboard", json={"name": "YOUR NAME", "score": 99999})
        assert res.status_code == 400
        assert "server-side" in res.get_json()["error"]

    def test_rejects_incomplete_game(self, client, app):
        _, _, mock_redis = app
        mock_completed_leaderboard_session(mock_redis, current_round="5")

        res = client.post("/leaderboard", json={"session_id": "test-session-123", "name": "Player"})

        assert res.status_code == 409

    def test_rejects_duplicate_session_submission(self, client, app):
        _, _, mock_redis = app
        mock_completed_leaderboard_session(mock_redis, leaderboard_submitted="true")

        res = client.post("/leaderboard", json={"session_id": "test-session-123", "name": "Player"})

        assert res.status_code == 409

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
        assert "seed" not in data

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
        assert data["seed"] == "xyz"

    def test_invalid_difficulty_rejected(self, client):
        res = client.post("/session", json={"difficulty": "insane", "max_rounds": 5})
        assert res.status_code == 400

    def test_leaderboard_sessions_ignore_supplied_seed_and_generate_unique_seeds(self, client, mock_redis):
        generated = iter(("a" * 64, "1" * 64, "b" * 64, "2" * 64))
        with patch("app.secrets.token_hex", side_effect=lambda _: next(generated)):
            first = client.post("/session", json={"leaderboard_mode": True, "seed": "attacker"})
            second = client.post("/session", json={"leaderboard_mode": True, "seed": "attacker"})

        assert first.status_code == second.status_code == 201
        saved_sessions = [
            json.loads(call.args[1])
            for call in mock_redis.set.call_args_list
            if call.args and str(call.args[0]).startswith("session:") and not str(call.args[0]).endswith(":lock")
        ]
        assert [session["seed"] for session in saved_sessions] == ["a" * 64, "b" * 64]
        assert all(session["seed"] != "attacker" for session in saved_sessions)

    def test_session_state_never_exposes_seed(self, client, mock_redis):
        mock_redis.get.return_value = make_session_json(seed="private-seed")
        response = client.get("/session/test-session-123")
        assert response.status_code == 200
        assert "seed" not in response.get_json()


class TestRandomImage:
    def test_random_image_requires_session_id(self, client):
        res = client.get("/random-image")

        assert res.status_code == 400
        assert res.get_json()["error"] == "session_id is required."

    def test_random_image_returns_existing_round_image(self, client, app):
        _, _, mock_redis = app
        mock_redis.get.return_value = make_session_json(
            seed="stable-seed",
            current_image_id="00000000000000000000000000000006",
        )

        res = client.get("/random-image?session_id=test-session-123")
        data = res.get_json()

        assert res.status_code == 200
        assert data["image_url"] == "https://images.example.com/00000000000000000000000000000006.jpg"

    def test_new_round_stores_internal_id_and_returns_direct_cdn_url(self, client, app):
        _, flask_app, _ = app
        session = flask_app.GameSession("test-session-123", "hard", 5, False, seed="stable")
        saved = []
        with patch("app.load_session", return_value=session), patch("app.save_session", side_effect=saved.append):
            response = client.get("/random-image?session_id=test-session-123")

        data = response.get_json()
        assert response.status_code == 200
        assert session.current_image_id in flask_app.image_by_id
        assert saved == [session]
        assert data["image_url"].startswith("https://images.example.com/")
        assert "(" not in data["image_url"]


class TestCatalogValidation:
    def write_catalog(self, tmp_path, text):
        path = tmp_path / "catalog.json"
        path.write_text(text, encoding="utf-8")
        return path

    @pytest.mark.parametrize("contents", ["not json", '{"version": 2, "images": {}}', '{"version": 1, "images": {}}'])
    def test_invalid_catalog_is_rejected(self, tmp_path, contents):
        with pytest.raises(RuntimeError):
            load_image_catalog(self.write_catalog(tmp_path, contents))

    def test_missing_catalog_is_rejected(self, tmp_path):
        with pytest.raises(RuntimeError):
            load_image_catalog(tmp_path / "missing.json")

    def test_duplicate_ids_are_rejected(self, tmp_path):
        image_id = "a" * 32
        record = '{"object_key":"' + image_id + '.jpg","difficulty":"hard","location":"outside","x":1,"y":1}'
        contents = '{"version":1,"images":{"' + image_id + '":' + record + ',"' + image_id + '":' + record + '}}'
        with pytest.raises(RuntimeError, match="Duplicate catalog key"):
            load_image_catalog(self.write_catalog(tmp_path, contents))

    @pytest.mark.parametrize("x,y", [(float("inf"), 1), (1, float("nan")), (-1, 1), (1, 1504)])
    def test_coordinates_must_be_finite_and_in_bounds(self, tmp_path, x, y):
        image_id = "a" * 32
        catalog = {"version": 1, "images": {image_id: {
            "object_key": f"{image_id}.jpg", "difficulty": "hard", "location": "outside", "x": x, "y": y,
        }}}
        path = tmp_path / "catalog.json"
        path.write_text(json.dumps(catalog), encoding="utf-8")
        with pytest.raises(RuntimeError):
            load_image_catalog(path)

    def test_duplicate_object_keys_are_rejected(self, tmp_path):
        first, second = "a" * 32, "b" * 32
        catalog = {"version": 1, "images": {
            first: {"object_key": f"{first}.jpg", "difficulty": "hard", "location": "outside", "x": 1, "y": 1},
            second: {"object_key": f"{first}.jpg", "difficulty": "hard", "location": "outside", "x": 2, "y": 2},
        }}
        path = tmp_path / "catalog.json"
        path.write_text(json.dumps(catalog), encoding="utf-8")
        with pytest.raises(RuntimeError, match="Duplicate object key"):
            load_image_catalog(path)


class TestRemovedImageProxy:
    def test_image_proxy_route_does_not_exist(self, client):
        assert client.get("/image/hard/outside/1").status_code == 404


class TestRateLimit:
    def test_all_requests_limit_each_ip(self, client, app):
        _, flask_app, mock_redis = app
        mock_redis.incr.side_effect = [1, 2, 3, 4, 5, 6]

        responses = [
            client.get("/health", environ_base={"REMOTE_ADDR": "192.0.2.10"})
            for _ in range(flask_app.RATE_LIMIT_REQUESTS + 1)
        ]

        assert [response.status_code for response in responses] == [200] * 5 + [429]
        assert mock_redis.incr.call_count == flask_app.RATE_LIMIT_REQUESTS + 1


class TestSeedStability:
    def test_guess_ignores_client_seed_override_and_keeps_session_seed_stable(self, client, app):
        _, flask_app, mock_redis = app
        session = flask_app.GameSession(
            "test-session-123",
            "hard",
            5,
            False,
            seed="stable-seed",
            leaderboard_mode=True,
        )
        session.current_image_id = "00000000000000000000000000000006"
        session.current_round = 1

        saved_guesses = []

        def capture_guess(guess):
            saved_guesses.append(guess)

        with patch("app.load_session", return_value=session), \
             patch("app.save_session"), \
             patch("app.save_guess", side_effect=capture_guess):
            res = client.post("/guess", json={
                "session_id": "test-session-123",
                "image_url": "https://attacker.example/wrong.jpg",
                "image_id": "ffffffffffffffffffffffffffffffff",
                "round_number": 1,
                "guess_latitude": 12.0,
                "guess_longitude": 34.0,
                "seed": "client-override-seed",
            })

        assert res.status_code == 200
        assert len(saved_guesses) == 1
        assert saved_guesses[0].image_id == "00000000000000000000000000000006"
        assert session.seed == "stable-seed"
        assert not hasattr(saved_guesses[0], "seed")
