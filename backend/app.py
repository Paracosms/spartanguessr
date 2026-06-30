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

allowed_origin = os.environ.get("ALLOWED_ORIGIN")
CORS(app, origins=[allowed_origin, "http://localhost:5173"])

# setup database using environment variables
redis = Redis.from_env()

LEADERBOARD_KEY = "leaderboard"
MAX_LEADERBOARD_SIZE = 50
SESSION_LOCK_TTL_SECONDS = 10
SESSION_TTL_SECONDS = 60 * 60 # sessions expire after 1 hr

IMAGE_MAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_map.json")
with open(IMAGE_MAP_PATH, "r", encoding="utf-8") as f:
    image_map = json.load(f)

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

# save to redis with a 24 hour ttl so old sessions don't pile up
def save_session(session):
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session.session_id}"
    session_json = json.dumps(session.to_dict())
    redis.set(key, session_json, ex=SESSION_TTL_SECONDS)

# load from redis
def load_session(session_id):
    if redis is None:
        raise RuntimeError("Session backend is not configured. Missing Redis environment variables.")
    key = f"session:{session_id}"

    # store json string, fallback to hash if needed
    try:
        raw = redis.get(key)
        if raw:
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8")
            return GameSession.from_dict(json.loads(raw))
    except Exception:
        pass

    data = redis.hgetall(key)
    return GameSession.from_dict(data) if data else None

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

# build relative image path
def build_image_path(difficulty, location, image_id):
    return f"/image/{difficulty}/{location}/{image_id}"

# get actual url from image_map using difficulty, location, image_id
def get_image_url_from_map(difficulty, location, image_id):
    return image_map.get(difficulty, {}).get(location, {}).get(str(image_id))

# convert (x,y).JPG to x, y
def resolve_coordinates_from_image_url(image_url):

    match = re.search(r"\((\d+),(\d+)\)", image_url)
    if not match:
        return None

    return float(match.group(1)), float(match.group(2))

# selects inside/outside based on difficulty and seed
def select_round_location(image_difficulty, outside_only, rng):
    available_locations = [
        location
        for location in ("inside", "outside")
        if image_map.get(image_difficulty, {}).get(location)
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
    used_image_paths = {guess.image_url for guess in guesses}

    difficulty_bucket = image_map.get(round_difficulty, {})
    location_bucket = difficulty_bucket.get(location, {})
    available_image_ids = list(location_bucket.keys())

    if not available_image_ids:
        return None

    # pick a random image_id that hasn't been used yet
    max_attempts = len(available_image_ids) * 2
    attempts = 0
    image_id = None

    while attempts < max_attempts:
        image_id = str(rng.randint(1, len(available_image_ids)))
        image_path = build_image_path(round_difficulty, location, image_id)
        if image_id in location_bucket and image_path not in used_image_paths:
            return {
                "difficulty": round_difficulty,
                "location": location,
                "image_path": image_path,
                "image_id": image_id,
            }
        attempts += 1

    # fallback: just pick the first available unused image
    for img_id in available_image_ids:
        image_path = build_image_path(round_difficulty, location, img_id)
        if image_path not in used_image_paths:
            return {
                "difficulty": round_difficulty,
                "location": location,
                "image_path": image_path,
                "image_id": img_id,
            }

    # fallback: return any available image (all have been used)
    if available_image_ids:
        img_id = available_image_ids[0]
        return {
            "difficulty": round_difficulty,
            "location": location,
            "image_path": build_image_path(round_difficulty, location, img_id),
            "image_id": img_id,
        }

    return None

# health check
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200

#GET /random-image
#Get data from frontend to fetch a random image from image_map
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

        session.current_image_url = round_image["image_path"]
        save_session(session)

        return jsonify({
            "difficulty": round_image["difficulty"],
            "location": round_image["location"],
            "image_url": round_image["image_path"],
            "round_number": session.current_round,
            "seed": session.seed,
        }), 200
    finally:
        release_session_lock(session_id, lock_token)
    
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
    seed = str(data.get("seed", "")).strip()

    if leaderboard_mode:
        difficulty = "hard"
        max_rounds = 5
        outside_only = False

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

    return jsonify({
        "session_id": session.session_id,
        "difficulty": session.difficulty,
        "max_rounds": session.max_rounds,
        "current_round": session.current_round,
        "outside_only": session.outside_only,
        "seed": session.seed,
        "leaderboard_mode": session.leaderboard_mode,
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
        "outside_only": session.outside_only,
        "leaderboard_mode": session.leaderboard_mode,
        "current_image_url": session.current_image_url,
        "total_score": session.total_score,
        "created_at": session.created_at,
    }), 200


# POST /guess
# Submit a guess for a round
# Body: { "session_id": 1, "image_url": "/image/<difficulty>/<location>/<image_id>", "round_number": 1,
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

        # parse the image_url to extract difficulty, location, image_id
        # format: /image/<difficulty>/<location>/<image_id>
        parts = image_url.split("/")
        if len(parts) != 5 or parts[0] != "" or parts[1] != "image":
            return jsonify({"error": "Invalid image_url format."}), 400

        difficulty_from_url = parts[2]
        location_from_url = parts[3]
        image_id_from_url = parts[4]

        # Get the actual image URL from the map to extract coordinates
        actual_image_url = get_image_url_from_map(difficulty_from_url, location_from_url, image_id_from_url)
        if not actual_image_url:
            return jsonify({"error": "Image not found in map."}), 404

        coordinates = resolve_coordinates_from_image_url(actual_image_url)
        if not coordinates:
            return jsonify({"error": "Unable to resolve coordinates from image."}), 404

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
