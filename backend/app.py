import os
import random
import json
import uuid
import secrets
import time
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from roundTracking import get_round_difficulty
from score_algorithm import score_algorithm
from models import GameSession, Guess
from image_catalog import load_image_catalog
from upstash_redis import Redis

load_dotenv()

app = Flask(__name__)

allowed_origin = os.environ.get("ALLOWED_ORIGIN")
CORS(app, origins=[
    allowed_origin,
    "http://localhost:5173",
    # GitHub Pages sends this origin for https://paracosms.github.io/spartanguessr/.
    "https://paracosms.github.io",
])

# setup database using environment variables
redis = Redis.from_env()

LEADERBOARD_KEY = "leaderboard"
MAX_LEADERBOARD_SIZE = 50
SESSION_LOCK_TTL_SECONDS = 10
SESSION_TTL_SECONDS = 60 * 60 # sessions expire after 1 hr
RATE_LIMIT_SECONDS = 1
RATE_LIMIT_REQUESTS = 5
# rate limit: RATE_LIMIT_REQUESTS per RATE_LIMIT_SECONDS per IP address (e.g. 5 requests per second per IP)

IMAGE_CATALOG_PATH = os.environ.get("IMAGE_CATALOG_PATH")
IMAGE_CDN_BASE_URL = os.environ.get("IMAGE_CDN_BASE_URL", "").rstrip("/")
if not IMAGE_CDN_BASE_URL:
    raise RuntimeError("IMAGE_CDN_BASE_URL is required.")
image_by_id, image_ids_by_bucket = load_image_catalog(IMAGE_CATALOG_PATH)
app.logger.info("Validated private image catalog with %d records", len(image_by_id))

# random 64 character string for session id to prevent guessing and collisions
def generate_session_id():
    return secrets.token_hex(32)

# boolean helper function to handle various truthy/falsy inputs
def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in ("1", "true", "yes", "on")

def is_rate_limited():
    """Allow up to RATE_LIMIT_REQUESTS per RATE_LIMIT_SECONDS for each IP."""
    client_ip = request.remote_addr or "unknown"
    window = int(time.time() // RATE_LIMIT_SECONDS)
    key = f"rate-limit:{client_ip}:{window}"

    try:
        request_count = int(redis.incr(key))
        if request_count == 1:
            redis.expire(key, RATE_LIMIT_SECONDS + 1)
    except Exception:
        # A limiter outage should not make the game unavailable. The Redis-backed
        # session operations below still fail normally when Redis is unavailable.
        app.logger.exception("Rate limiter unavailable")
        return False

    return request_count > RATE_LIMIT_REQUESTS

@app.before_request
def enforce_rate_limit():
    if is_rate_limited():
        return jsonify({"error": "Rate limit exceeded. Try again shortly."}), 429

def encode_leaderboard_member(session_id, name):
    return json.dumps({
        "session_id": str(session_id),
        "name": name,
    }, separators=(",", ":"))

def get_leaderboard_member_name(member):
    if isinstance(member, (bytes, bytearray)):
        member = member.decode("utf-8")

    try:
        data = json.loads(member)
        if isinstance(data, dict) and "name" in data:
            return str(data.get("name") or "Anonymous")
    except (TypeError, ValueError):
        pass

    return str(member)

def get_leaderboard_position_for_score(score):
    count = redis.zcard(LEADERBOARD_KEY)
    if count < MAX_LEADERBOARD_SIZE:
        return True, redis.zcount(LEADERBOARD_KEY, score + 1, "inf") + 1

    lowest = redis.zrange(LEADERBOARD_KEY, MAX_LEADERBOARD_SIZE - 1, MAX_LEADERBOARD_SIZE - 1, withscores=True, rev=True)
    if lowest:
        lowest_score = int(lowest[0][1])
        qualifies = score >= lowest_score
        position = redis.zcount(LEADERBOARD_KEY, score + 1, "inf") + 1 if qualifies else None
        return qualifies, position

    return True, 1

# error debugging (i hate redis)
def format_redis_error(err):
    message = str(err).strip() or err.__class__.__name__
    lowered = message.lower()

    if "401" in lowered or "403" in lowered or "unauthorized" in lowered or "forbidden" in lowered:
        return "Redis authentication failed. Verify UPSTASH_REDIS_REST_TOKEN."
    if "name or service not known" in lowered or "failed to resolve" in lowered or "dns" in lowered:
        return "Redis URL is invalid or unreachable. Verify UPSTASH_REDIS_REST_URL."
    if "timed out" in lowered or "timeout" in lowered or "connection" in lowered:
        return "Redis connection failed. Check Upstash availability and Render outbound network access."
    return f"Redis request failed: {message}"

# locking to prevent simultaneous requests and race condition
def acquire_session_lock(session_id):
    lock_key = f"session:{session_id}:lock"
    lock_token = uuid.uuid4().hex
    acquired = redis.set(lock_key, lock_token, nx=True, ex=SESSION_LOCK_TTL_SECONDS)
    if not acquired:
        return None
    return lock_token

# unlock
def release_session_lock(session_id, lock_token):
    lock_key = f"session:{session_id}:lock"
    try:
        current_value = redis.get(lock_key)
        if current_value == lock_token:
            redis.delete(lock_key)
    except Exception:
        # lock if failed
        pass

# save the session JSON with the configured ttl
def save_session(session):
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session.session_id}"
    session_json = json.dumps(session.to_dict())
    redis.set(key, session_json, ex=SESSION_TTL_SECONDS)

# load a session JSON blob from redis
def load_session(session_id):
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session_id}"
    raw = redis.get(key)
    if not raw:
        return None

    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")

    return GameSession.from_dict(json.loads(raw))

# you can read the function name can't you?
def save_guess(guess):
    key = f"session:{guess.session_id}:guesses"
    redis.lpush(key, guess.to_json())
    redis.expire(key, SESSION_TTL_SECONDS) # match session ttl so guesses don't outlive their session

# all guesses for a given session
def load_guesses(session_id):
    key = f"session:{session_id}:guesses"
    guess_jsons = redis.lrange(key, 0, -1)
    return [Guess.from_json(g) for g in reversed(guess_jsons)]

def build_image_url(image_id):
    return f"{IMAGE_CDN_BASE_URL}/{image_by_id[image_id]['object_key']}"

# selects inside/outside based on difficulty and seed
def select_round_location(image_difficulty, outside_only, rng):
    available_locations = [
        location
        for location in ("inside", "outside")
        if image_ids_by_bucket[image_difficulty][location]
    ]
    if not available_locations:
        return None

    if outside_only:
        return "outside" if "outside" in available_locations else None

    preferred_location = rng.choice(["inside", "outside"])
    if preferred_location in available_locations:
        return preferred_location

    return available_locations[0]

# next random image for the session
def build_round_image(session):
    round_difficulty = get_round_difficulty(session.difficulty, session.max_rounds, session.current_round)
    rng = random.Random(session.seed)

    location = select_round_location(round_difficulty, session.outside_only, rng)
    if not location:
        return None

    guesses = load_guesses(session.session_id)
    used_image_ids = {guess.image_id for guess in guesses}
    available_image_ids = image_ids_by_bucket[round_difficulty][location]

    if not available_image_ids:
        return None

    unused_image_ids = [image_id for image_id in available_image_ids if image_id not in used_image_ids]
    image_id = rng.choice(unused_image_ids or available_image_ids)
    return {"difficulty": round_difficulty, "location": location, "image_id": image_id}

# health check
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200

#GET /random-image
# Get the active round's direct CDN image URL.
@app.route("/random-image")
def random_image():
    session_id = request.args.get("session_id", type=str)
    if not session_id:
        return jsonify({"error": "session_id is required."}), 400

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

        if session.current_image_id:
            return jsonify({
                "difficulty": get_round_difficulty(session.difficulty, session.max_rounds, session.current_round),
                "round_number": session.current_round,
                "image_url": build_image_url(session.current_image_id),
            }), 200

        round_image = build_round_image(session)
        if not round_image:
            return jsonify({"error": "No image found"}), 404

        session.current_image_id = round_image["image_id"]
        save_session(session)

        return jsonify({
            "difficulty": round_image["difficulty"],
            "location": round_image["location"],
            "image_url": build_image_url(round_image["image_id"]),
            "round_number": session.current_round,
        }), 200
    finally:
        release_session_lock(session_id, lock_token)
    
# POST /session
# Start a new game session
# Body: { "difficulty": "medium", "max_rounds": 5, "outside_only": false }
@app.route("/session", methods=["POST"])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    leaderboard_mode = parse_bool(data.get("leaderboard_mode", False), default=False)
    difficulty = data.get("difficulty", "medium")
    max_rounds = data.get("max_rounds", 5)
    outside_only = parse_bool(data.get("outside_only", False), default=False)
    seed = secrets.token_hex(32) if leaderboard_mode else str(data.get("seed", "")).strip()

    if leaderboard_mode:
        difficulty = "hard"
        max_rounds = 5
        outside_only = False

    if difficulty not in ("easy", "medium", "hard"):
        return jsonify({"error": "Invalid difficulty."}), 400
    if not isinstance(max_rounds, int) or not (1 <= max_rounds <= 10):
        return jsonify({"error": "max_rounds must be an integer within the expected range."}), 400

    try:
        session_id = None
        for _ in range(5):
            candidate = generate_session_id()
            if not load_session(candidate):
                session_id = candidate
                break
        if not session_id:
            return jsonify({"error": "Unable to allocate session. Please retry."}), 503

        session = GameSession(
            session_id,
            difficulty,
            max_rounds,
            outside_only,
            seed=seed,
            leaderboard_mode=leaderboard_mode,
        )
        save_session(session)
    except RuntimeError as err:
        app.logger.error(str(err))
        return jsonify({"error": str(err)}), 503
    except Exception as err:
        app.logger.exception("Failed to create session")
        return jsonify({"error": format_redis_error(err)}), 503

    response = {
        "session_id": session.session_id,
        "difficulty": session.difficulty,
        "max_rounds": session.max_rounds,
        "current_round": session.current_round,
        "outside_only": session.outside_only,
        "leaderboard_mode": session.leaderboard_mode,
        "total_score": session.total_score,
        "created_at": session.created_at,
    }
    if not session.leaderboard_mode:
        response["seed"] = session.seed
    return jsonify(response), 201


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
        "outside_only": session.outside_only,
        "leaderboard_mode": session.leaderboard_mode,
        "image_url": build_image_url(session.current_image_id) if session.current_image_id else None,
        "total_score": session.total_score,
        "created_at": session.created_at,
    }), 200


# POST /guess
# Submit a guess for a round
# Body: { "session_id": 1, "round_number": 1,
#         "guess_latitude": 37.33, "guess_longitude": -121.88 }
@app.route("/guess", methods=["POST"])
def submit_guess():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    required = ["session_id", "round_number", "guess_latitude", "guess_longitude"]
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

        if not session.current_image_id:
            return jsonify({"error": "No active round image. Request a round image first."}), 409

        image_id = session.current_image_id
        image_record = image_by_id.get(image_id)
        if not image_record:
            return jsonify({"error": "Active round image is unavailable."}), 409
        coordinates = (image_record["x"], image_record["y"])

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
            image_id,
            data["round_number"],
            guess_lat,
            guess_lng,
            distance_meters,
            score,
        )
        save_guess(guess)

        # Update session total score and round
        session.total_score += score

        if session.current_round < session.max_rounds:
            session.current_round += 1
        else:
            session.current_round = session.max_rounds + 1
        session.current_image_id = None
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

    for i, (member, score) in enumerate(results):
        score = int(score)
        if score != prev_score:
            rank = i + 1
            prev_score = score
        leaderboard.append({"name": get_leaderboard_member_name(member), "score": score, "rank": rank})

    return jsonify(leaderboard), 200


# GET /leaderboard/qualify?score=<score>
# Check if a score qualifies for top 50
@app.route("/leaderboard/qualify")
def check_qualify():
    score = request.args.get("score", type=int)
    if score is None:
        return jsonify({"error": "Score is required."}), 400

    qualifies, position = get_leaderboard_position_for_score(score)
    return jsonify({"qualifies": qualifies, "position": position}), 200


# POST /leaderboard
# Add a completed leaderboard-mode session's server-calculated score to the leaderboard.
# Body: { "session_id": "session_id", "name": "player_name" }
@app.route("/leaderboard", methods=["POST"])
def add_to_leaderboard():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    name = data.get("name", "").strip()
    session_id = str(data.get("session_id", "")).strip()

    if not name:
        return jsonify({"error": "Name is required."}), 400
    if len(name) > 20:
        return jsonify({"error": "Name must be 20 characters or fewer."}), 400
    if "score" in data:
        return jsonify({"error": "Scores are calculated server-side. Submit session_id and name only."}), 400
    if not session_id:
        return jsonify({"error": "session_id is required."}), 400

    lock_token = acquire_session_lock(session_id)
    if not lock_token:
        return jsonify({"error": "Session is busy. Retry leaderboard submission."}), 409

    try:
        session = load_session(session_id)
        if not session:
            return jsonify({"error": "Session not found."}), 404
        if not session.leaderboard_mode:
            return jsonify({"error": "Only leaderboard mode sessions can submit scores."}), 400
        if session.current_round <= session.max_rounds:
            return jsonify({"error": "Game must be complete before submitting to the leaderboard."}), 409
        if session.leaderboard_submitted:
            return jsonify({"error": "Leaderboard score has already been submitted for this session."}), 409

        score = session.total_score
        qualifies, _ = get_leaderboard_position_for_score(score)
        if not qualifies:
            return jsonify({"error": "Score does not qualify for the leaderboard."}), 409

        member = encode_leaderboard_member(session.session_id, name)
        redis.zadd(LEADERBOARD_KEY, {member: score})
        redis.zremrangebyrank(LEADERBOARD_KEY, 0, -(MAX_LEADERBOARD_SIZE + 1)) # trim lowest scores so the set stays at 50
        rank = redis.zrevrank(LEADERBOARD_KEY, member)
        if rank is None:
            return jsonify({"error": "Score does not qualify for the leaderboard."}), 409

        session.leaderboard_submitted = True
        save_session(session)

        position = rank + 1

        return jsonify({"name": name, "score": score, "position": position}), 201
    finally:
        release_session_lock(session_id, lock_token)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
