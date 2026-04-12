import os
import io
import random
import json
import re
import uuid
import secrets
import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from roundTracking import get_round_difficulty
from score_algorithm import score_algorithm
from models import GameSession, Guess
from upstash_redis import Redis

load_dotenv()

app = Flask(__name__)
CORS(app)

redis_url = (os.environ.get("UPSTASH_REDIS_REST_URL") or "").strip().rstrip("/")
redis_token = (os.environ.get("UPSTASH_REDIS_REST_TOKEN") or "").strip()
redis = Redis(url=redis_url, token=redis_token) if redis_url and redis_token else None

LEADERBOARD_KEY = "leaderboard"
MAX_LEADERBOARD_SIZE = 50
SESSION_LOCK_TTL_SECONDS = 10

IMAGE_MAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_map.json")
with open(IMAGE_MAP_PATH, "r", encoding="utf-8") as f:
    image_map = json.load(f)


def flatten_image_urls(map_data):
    return {
        image_url
        for difficulty_group in map_data.values()
        for location_group in difficulty_group.values()
        for image_url in location_group.values()
    }


KNOWN_IMAGE_URLS = flatten_image_urls(image_map)


def generate_session_id():
    """Generate a collision-resistant 64-character session ID."""
    return secrets.token_hex(32)


def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def format_redis_error(err):
    """Return a user-safe, actionable message for common Redis failures."""
    message = str(err).strip() or err.__class__.__name__
    lowered = message.lower()

    if "401" in lowered or "403" in lowered or "unauthorized" in lowered or "forbidden" in lowered:
        return "Redis authentication failed. Verify UPSTASH_REDIS_REST_TOKEN."
    if "name or service not known" in lowered or "failed to resolve" in lowered or "dns" in lowered:
        return "Redis URL is invalid or unreachable. Verify UPSTASH_REDIS_REST_URL."
    if "timed out" in lowered or "timeout" in lowered or "connection" in lowered:
        return "Redis connection failed. Check Upstash availability and Render outbound network access."
    return f"Redis request failed: {message}"


def acquire_session_lock(session_id):
    lock_key = f"session:{session_id}:lock"
    lock_token = uuid.uuid4().hex
    acquired = redis.set(lock_key, lock_token, nx=True, ex=SESSION_LOCK_TTL_SECONDS)
    if not acquired:
        return None
    return lock_token


def release_session_lock(session_id, lock_token):
    lock_key = f"session:{session_id}:lock"
    try:
        current_value = redis.get(lock_key)
        if current_value == lock_token:
            redis.delete(lock_key)
    except Exception:
        # Lock TTL provides a safe fallback if deletion fails.
        pass


def save_session(session):
    """Save session to Redis."""
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session.session_id}"
    session_data = session.to_dict()

    flattened = []
    for field, value in session_data.items():
        flattened.extend([field, value])

    try:
        redis.hset(key, mapping=session_data)
    except TypeError:
        # Compatibility fallback for upstash-redis versions without `mapping=` support.
        redis.hset(key, *flattened)
    except Exception as err:
        if "wrong number of arguments for 'hset' command" not in str(err).lower():
            raise
        # Some client versions accept the call shape but serialize dicts incorrectly.
        redis.hset(key, *flattened)


def load_session(session_id):
    """Load session from Redis."""
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session_id}"
    data = redis.hgetall(key)
    return GameSession.from_dict(data) if data else None


def save_guess(guess):
    """Append guess to session's guess list."""
    key = f"session:{guess.session_id}:guesses"
    redis.lpush(key, guess.to_json())


def load_guesses(session_id):
    """Load all guesses for a session."""
    key = f"session:{session_id}:guesses"
    guess_jsons = redis.lrange(key, 0, -1)
    return [Guess.from_json(g) for g in reversed(guess_jsons)]


def resolve_coordinates_from_image_url(image_url):
    if image_url not in KNOWN_IMAGE_URLS:
        return None

    # convert (x,y).JPG to x, y
    match = re.search(r"\((\d+),(\d+)\)", image_url)
    if not match:
        return None

    return float(match.group(1)), float(match.group(2))


def select_round_location(image_difficulty, outside_enabled, rng):
    available_locations = [
        location
        for location in ("inside", "outside")
        if image_map.get(image_difficulty, {}).get(location)
    ]
    if not available_locations:
        return None

    if not outside_enabled:
        return "inside" if "inside" in available_locations else available_locations[0]

    preferred_location = rng.choice(["inside", "outside"])
    if preferred_location in available_locations:
        return preferred_location

    return available_locations[0]


def build_round_image(session):
    round_difficulty = get_round_difficulty(session.difficulty, session.max_rounds, session.current_round)
    rng = random.Random(f"{session.seed}:{session.session_id}:{session.current_round}")

    location = select_round_location(round_difficulty, session.outside_enabled, rng)
    if not location:
        return None

    guesses = load_guesses(session.session_id)
    used_urls = {guess.image_url for guess in guesses}

    difficulty_bucket = image_map.get(round_difficulty, {})
    primary_candidates = [
        image_url
        for image_url in difficulty_bucket.get(location, {}).values()
        if image_url not in used_urls
    ]

    if primary_candidates:
        return {
            "difficulty": round_difficulty,
            "location": location,
            "image_url": rng.choice(primary_candidates),
        }

    # Fallback: still use the same difficulty but let location vary if one side is exhausted.
    same_difficulty_candidates = [
        image_url
        for location_images in difficulty_bucket.values()
        for image_url in location_images.values()
        if image_url not in used_urls
    ]
    if same_difficulty_candidates:
        image_url = rng.choice(same_difficulty_candidates)
        resolved_location = "outside" if image_url in difficulty_bucket.get("outside", {}).values() else "inside"
        return {
            "difficulty": round_difficulty,
            "location": resolved_location,
            "image_url": image_url,
        }

    # Final fallback if all images were already used in this session.
    all_candidates = [
        image_url
        for image_url in difficulty_bucket.get(location, {}).values()
    ]
    if all_candidates:
        return {
            "difficulty": round_difficulty,
            "location": location,
            "image_url": rng.choice(all_candidates),
        }

    return None

# Health check
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


# GET /image/placeholder
# Fetches placeholder image from private GitHub repo and forwards it
# so the token never reaches the frontend
@app.route("/image/placeholder")
def get_placeholder():
    return jsonify({
        "image_id": 0,
        "image_url": "https://ngocng2910.github.io/images/hard/outside/IMG_8146.JPG",
        "difficulty": "hard",
        "title": "Placeholder Image",
    }), 200

#GET /random-image
#Get data from frontend to fetch a random image from image_map
@app.route("/random-image")
def random_image():
    session_id = request.args.get("session_id", type=str)
    if session_id is not None:
        lock_token = acquire_session_lock(session_id)
        if not lock_token:
            return jsonify({"error": "Session is busy. Retry request."}), 409

        try:
            session = load_session(session_id)
            if not session:
                return jsonify({"error": "Session not found."}), 404

            if session.current_round > session.max_rounds:
                return jsonify({
                    "completed": True,
                    "round_number": session.current_round,
                    "max_rounds": session.max_rounds,
                }), 200

            if session.current_image_url:
                return jsonify({
                    "difficulty": get_round_difficulty(session.difficulty, session.max_rounds, session.current_round),
                    "round_number": session.current_round,
                    "image_url": session.current_image_url,
                    "seed": session.seed,
                }), 200

            round_image = build_round_image(session)
            if not round_image:
                return jsonify({"error": "No image found"}), 404

            session.current_image_url = round_image["image_url"]
            save_session(session)

            return jsonify({
                "difficulty": round_image["difficulty"],
                "location": round_image["location"],
                "image_url": round_image["image_url"],
                "round_number": session.current_round,
                "seed": session.seed,
            }), 200
        finally:
            release_session_lock(session_id, lock_token)

    difficulty = request.args.get("difficulty")
    outside_enabled = request.args.get("outside_enabled", "false").lower() == "true"
    seed = request.args.get("seed")
    
    rng = random.Random(seed)
    
    if outside_enabled:
        location = rng.choice(["inside", "outside"])
    else:
        location = "inside"
        
    images = image_map[difficulty][location]
    if not images:
        return jsonify({"error": "No image found"}), 404
    
    img_name = rng.choice(list(images.keys()))
    image_url = images[img_name]

    return jsonify({
        "difficulty": difficulty,
        "location": location,
        "image": img_name,
        "image_url": image_url,
        "seed": seed
    }), 200
    
#GET/image/<difficulty>/<location>/<image_id>
#Get image url the convert it to send to frontend
@app.route("/image/<difficulty>/<location>/<image_id>")
def get_image(difficulty, location, image_id):
    try:
        url = image_map[difficulty][location][image_id]
        response = requests.get(url)
        image_binary = io.BytesIO(response.content)
        return send_file(image_binary, mimetype="image/jpeg")
    except KeyError:
        return "Not found", 404
    except requests.RequestException: 
        return "Failed fetching image", 500

# POST /session
# Start a new game session
# Body: { "difficulty": "medium", "max_rounds": 5, "outside_enabled": false }
@app.route("/session", methods=["POST"])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    difficulty = data.get("difficulty", "medium")
    max_rounds = data.get("max_rounds", data.get("round_count", 5))
    outside_enabled = parse_bool(data.get("outside_enabled", data.get("outside_only", False)), default=False)
    seed = str(data.get("seed", "")).strip()

    if difficulty not in ("easy", "medium", "hard"):
        return jsonify({"error": "Invalid difficulty."}), 400
    if not isinstance(max_rounds, int) or max_rounds < 1:
        return jsonify({"error": "max_rounds must be a positive integer."}), 400

    try:
        session_id = None
        for _ in range(5):
            candidate = generate_session_id()
            if not load_session(candidate):
                session_id = candidate
                break
        if not session_id:
            return jsonify({"error": "Unable to allocate session. Please retry."}), 503

        session = GameSession(session_id, difficulty, max_rounds, outside_enabled, seed=seed)
        save_session(session)
    except RuntimeError as err:
        app.logger.error(str(err))
        return jsonify({"error": str(err)}), 503
    except Exception as err:
        app.logger.exception("Failed to create session")
        return jsonify({"error": format_redis_error(err)}), 503

    return jsonify({
        "session_id": session.session_id,
        "difficulty": session.difficulty,
        "max_rounds": session.max_rounds,
        "current_round": session.current_round,
        "outside_enabled": session.outside_enabled,
        "seed": session.seed,
        "total_score": session.total_score,
        "created_at": session.created_at,
    }), 201


# GET /session/<session_id>
# Return current server-side state for a session.
@app.route("/session/<session_id>", methods=["GET"])
def get_session_state(session_id):
    session = load_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    return jsonify({
        "session_id": session.session_id,
        "difficulty": session.difficulty,
        "max_rounds": session.max_rounds,
        "current_round": session.current_round,
        "outside_enabled": session.outside_enabled,
        "current_image_url": session.current_image_url,
        "total_score": session.total_score,
        "created_at": session.created_at,
    }), 200


# POST /guess
# Submit a guess for a round
# Body: { "session_id": 1, "image_url": "https://...", "round_number": 1,
#         "guess_latitude": 37.33, "guess_longitude": -121.88 }
@app.route("/guess", methods=["POST"])
def submit_guess():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    required = ["session_id", "image_url", "round_number", "guess_latitude", "guess_longitude"]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}. Pin must be placed before submitting."}), 400

    session_id = data["session_id"]
    lock_token = acquire_session_lock(session_id)
    if not lock_token:
        return jsonify({"error": "Session is busy. Retry guess submission."}), 409

    try:
        session = load_session(session_id)
        if not session:
            return jsonify({"error": "Session not found. Please restart the game."}), 404

        if not isinstance(data.get("round_number"), int):
            return jsonify({"error": "round_number must be an integer."}), 400

        if data["round_number"] != session.current_round:
            return jsonify({
                "error": "Round out of sync. Request the current round image before guessing.",
                "expected_round": session.current_round,
            }), 409

        if not session.current_image_url:
            return jsonify({"error": "No active round image. Request a round image first."}), 409

        image_url = str(data.get("image_url", "")).strip()
        if image_url != session.current_image_url:
            return jsonify({"error": "image_url does not match the active round image."}), 409

        coordinates = resolve_coordinates_from_image_url(image_url)
        if not coordinates:
            return jsonify({"error": "Unable to resolve coordinates from image_url."}), 404

        guess_lat = data.get("guess_latitude")
        guess_lng = data.get("guess_longitude")

        if guess_lat is None or guess_lng is None:
            return jsonify({"error": "Missing coordinates"}), 400

        # Calculate distance and score
        score, distance_meters = score_algorithm(
            [guess_lat, guess_lng],
            [coordinates[0], coordinates[1]]
        )

        # Save guess
        guess = Guess(
            session.session_id,
            image_url,
            data["round_number"],
            guess_lat,
            guess_lng,
            distance_meters,
            score,
            data.get("seed") or session.seed,
        )
        save_guess(guess)

        # Update session total score and round
        session.total_score += score

        if session.current_round < session.max_rounds:
            session.current_round += 1
        else:
            session.current_round = session.max_rounds + 1
        session.current_image_url = None
        save_session(session)

        return jsonify({
            "round_number": data["round_number"],
            "distance_meters": round(distance_meters, 2),
            "score": score,
            "total_score": session.total_score,
            "game_complete": session.current_round > session.max_rounds,
            "next_round_number": session.current_round if session.current_round <= session.max_rounds else None,
            # Reveal correct location AFTER guess is submitted
            "actual_latitude": coordinates[0],
            "actual_longitude": coordinates[1],
            "guess_latitude": guess_lat,
            "guess_longitude": guess_lng
        }), 200
    finally:
        release_session_lock(session_id, lock_token)


# GET /session/<session_id>/results
# Get all round results for a session (final summary)
@app.route("/session/<session_id>/results")
def get_results(session_id):
    session = load_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    guesses = load_guesses(session_id)

    rounds = [{
        "round_number": g.round_number,
        "distance_meters": g.distance_meters,
        "score": g.score,
    } for g in guesses]

    distances = [g.distance_meters for g in guesses]

    return jsonify({
        "session_id": session_id,
        "difficulty": session.difficulty,
        "total_score": session.total_score,
        "rounds_played": len(guesses),
        "average_distance": round(sum(distances) / len(distances), 2) if distances else 0,
        "smallest_distance": round(min(distances), 2) if distances else 0,
        "largest_distance": round(max(distances), 2) if distances else 0,
        "rounds": rounds,
    }), 200


# GET /leaderboard
# Returns top 50 scores with ranks (tied scores share same rank)
@app.route("/leaderboard")
def get_leaderboard():
    results = redis.zrange(LEADERBOARD_KEY, 0, MAX_LEADERBOARD_SIZE - 1, withscores=True, rev=True)

    leaderboard = []
    prev_score = None
    rank = 0

    for i, (name, score) in enumerate(results):
        score = int(score)
        if score != prev_score:
            rank = i + 1
            prev_score = score
        leaderboard.append({"name": name, "score": score, "rank": rank})

    return jsonify(leaderboard), 200


# GET /leaderboard/qualify?score=<score>
# Check if a score qualifies for top 50
@app.route("/leaderboard/qualify")
def check_qualify():
    score = request.args.get("score", type=int)
    if score is None:
        return jsonify({"error": "Score is required."}), 400

    count = redis.zcard(LEADERBOARD_KEY)
    if count < MAX_LEADERBOARD_SIZE:
        position = redis.zcount(LEADERBOARD_KEY, score + 1, "inf") + 1
        return jsonify({"qualifies": True, "position": position}), 200

    lowest = redis.zrange(LEADERBOARD_KEY, MAX_LEADERBOARD_SIZE - 1, MAX_LEADERBOARD_SIZE - 1, withscores=True, rev=True)
    if lowest:
        lowest_score = int(lowest[0][1])
        qualifies = score >= lowest_score
        position = redis.zcount(LEADERBOARD_KEY, score + 1, "inf") + 1 if qualifies else None
        return jsonify({"qualifies": qualifies, "position": position}), 200

    return jsonify({"qualifies": True}), 200


# POST /leaderboard
# Add a score to the leaderboard
# Body: { "name": "player_name", "score": 5000 }
@app.route("/leaderboard", methods=["POST"])
def add_to_leaderboard():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    name = data.get("name", "").strip()
    score = data.get("score")

    if not name:
        return jsonify({"error": "Name is required."}), 400
    if not isinstance(score, int) or score < 0:
        return jsonify({"error": "Valid score is required."}), 400

    redis.zadd(LEADERBOARD_KEY, {name: score})
    position = redis.zrevrank(LEADERBOARD_KEY, name) + 1

    return jsonify({"name": name, "score": score, "position": position}), 201


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
