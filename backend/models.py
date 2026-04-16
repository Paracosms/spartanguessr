# all data is stored in Upstash Redis with simple key-value patterns.
# session data stored as hash: session:{session_id}
# guesses stored as list: session:{session_id}:guesses

import json
from datetime import UTC, datetime


class GameSession:
    # session properties
    def __init__(self, session_id, difficulty, max_rounds, outside_only=False, seed="", leaderboard_mode=False):
        self.session_id = session_id
        self.difficulty = difficulty
        self.max_rounds = max_rounds
        self.current_round = 1
        self.outside_only = outside_only
        self.seed = seed
        self.leaderboard_mode = leaderboard_mode
        self.current_image_url = None
        self.total_score = 0
        self.created_at = datetime.now(UTC).isoformat()

    def to_dict(self):
        # serialize to dict
        return {
            "session_id": str(self.session_id),
            "difficulty": self.difficulty,
            "max_rounds": str(self.max_rounds),
            "current_round": str(self.current_round),
            "outside_only": "true" if self.outside_only else "false",
            "seed": self.seed,
            "leaderboard_mode": "true" if self.leaderboard_mode else "false",
            "current_image_url": self.current_image_url or "",
            "total_score": str(self.total_score),
            "created_at": self.created_at,
        }

    @staticmethod
    def from_dict(data):
        # deserialize from hash (backwards compatibility)
        if not data:
            return None
        session = GameSession(
            str(data.get("session_id", "")),
            data.get("difficulty", "medium"),
            int(data.get("max_rounds", 5)),
            data.get("outside_only", "false") == "true",
            data.get("seed", ""),
            data.get("leaderboard_mode", "false") == "true",
        )
        session.current_round = int(data.get("current_round", 1))
        session.current_image_url = data.get("current_image_url") or None
        session.total_score = int(data.get("total_score", 0))
        session.created_at = data.get("created_at", datetime.now(UTC).isoformat())
        return session


class Guess:
    # guess properties
    def __init__(self, session_id, image_url, round_number, guess_latitude, guess_longitude, distance_meters, score, seed=None):
        self.session_id = session_id
        self.image_url = image_url
        self.round_number = round_number
        self.guess_latitude = guess_latitude
        self.guess_longitude = guess_longitude
        self.distance_meters = distance_meters
        self.score = score
        self.seed = seed

    # serialize to json
    def to_json(self):
        return json.dumps({
            "session_id": self.session_id,
            "image_url": self.image_url,
            "round_number": self.round_number,
            "guess_latitude": self.guess_latitude,
            "guess_longitude": self.guess_longitude,
            "distance_meters": self.distance_meters,
            "score": self.score,
            "seed": self.seed,
        })

    @staticmethod
    # deserialize
    def from_json(json_str):
        data = json.loads(json_str)
        return Guess(
            data["session_id"],
            data["image_url"],
            data["round_number"],
            data["guess_latitude"],
            data["guess_longitude"],
            data["distance_meters"],
            data["score"],
            data.get("seed"),
        )
