import os
import io
import random
import json
import re
import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from roundTracking import roundTracking
from score_algorithm import score_algorithm
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from models import db, GameSession, Guess
from upstash_redis import Redis

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///spartanguessr.db")
db.init_app(app)

redis = Redis(
    url=os.environ.get("UPSTASH_REDIS_REST_URL"),
    token=os.environ.get("UPSTASH_REDIS_REST_TOKEN")
)

LEADERBOARD_KEY = "leaderboard"
MAX_LEADERBOARD_SIZE = 50

with app.app_context():
    db.create_all()

with open("image_map.json", "r") as f:
        image_map = json.load(f)


def flatten_image_urls(map_data):
    return {
        image_url
        for difficulty_group in map_data.values()
        for location_group in difficulty_group.values()
        for image_url in location_group.values()
    }


KNOWN_IMAGE_URLS = flatten_image_urls(image_map)


def resolve_coordinates_from_image_url(image_url):
    if image_url not in KNOWN_IMAGE_URLS:
        return None

    # convert (x,y).JPG to x, y
    match = re.search(r"\((\d+),(\d+)\)", image_url)
    if not match:
        return None

    return float(match.group(1)), float(match.group(2))

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
# Body: { "difficulty": "medium", "max_rounds": 5 }

# todo:
# refactor to include this payload:
# {
#   difficulty: 2,
#   round_count: 5,
#   timer_length: "30",
#   seed: "",
#   unlabled_map: false,
#   outside_only: false
# }

@app.route("/session", methods=["POST"])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    difficulty = data.get("difficulty", "medium")
    max_rounds = data.get("max_rounds", data.get("round_count", 5))

    if difficulty not in ("easy", "medium", "hard"):
        return jsonify({"error": "Invalid difficulty."}), 400
    if not isinstance(max_rounds, int) or max_rounds < 1:
        return jsonify({"error": "max_rounds must be a positive integer."}), 400

    session = GameSession(difficulty=difficulty, max_rounds=max_rounds, total_score=0)
    db.session.add(session)
    db.session.commit()

    return jsonify({
        "session_id": session.session_id,
        "difficulty": session.difficulty,
        "max_rounds": session.max_rounds,
        "total_score": session.total_score,
        "created_at": session.created_at.isoformat(),
    }), 201


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

    session = db.session.get(GameSession, data["session_id"])
    if not session:
        return jsonify({"error": "Session not found. Please restart the game."}), 404

    image_url = str(data.get("image_url", "")).strip()
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
        session_id=session.session_id,
        image_url=image_url,
        round_number=data["round_number"],
        guess_latitude=guess_lat,
        guess_longitude=guess_lng,
        distance_meters=distance_meters,
        score=score,
        seed=data.get("seed"),
    )
    db.session.add(guess)

    # Update session total score
    session.total_score += score
    db.session.commit()

    return jsonify({
        "round_number": data["round_number"],
        "distance_meters": round(distance_meters, 2),
        "score": score,
        "total_score": session.total_score,
        # Reveal correct location AFTER guess is submitted
        "actual_latitude": coordinates[0],
        "actual_longitude": coordinates[1],
        "guess_latitude": guess_lat,
        "guess_longitude": guess_lng
    }), 200


# GET /session/<session_id>/results
# Get all round results for a session (final summary)
@app.route("/session/<int:session_id>/results")
def get_results(session_id):
    session = db.session.get(GameSession, session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    guesses = Guess.query.filter_by(session_id=session_id).order_by(Guess.round_number).all()

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
