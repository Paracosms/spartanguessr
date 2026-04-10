import os
import io
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from roundTracking import roundTracking
from score_algorithm import score_algorithm
from flask_sqlalchemy import SQLAlchemy
from models import db, GameSession, Image, Guess
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


# POST /session
# Start a new game session
# Body: { "difficulty": "medium", "max_rounds": 5 }
@app.route("/session", methods=["POST"])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required."}), 400

    difficulty = data.get("difficulty", "medium")
    max_rounds = data.get("max_rounds", 5)

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
# Body: { "session_id": 1, "image_id": 12, "round_number": 1,
#         "guess_latitude": 37.33, "guess_longitude": -121.88 }
@app.route("/guess", methods=["POST"])
def submit_guess():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body is required."}), 400
    
    

    required = ["session_id", "image_id", "round_number", "guess_latitude", "guess_longitude"]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}. Pin must be placed before submitting."}), 400

    session = db.session.get(GameSession, data["session_id"])
    if not session:
        return jsonify({"error": "Session not found. Please restart the game."}), 404

    image = db.session.get(Image, data["image_id"])
    if not image:
        return jsonify({"error": "Image not found."}), 404

    guess_lat = data.get("guess_latitude")
    guess_lng = data.get("guess_longitude")
    
    if guess_lat is None or guess_lng is None:
            return jsonify({"error": "Missing coordinates"}), 400
    # Calculate distance and score
    score, distance_meters = score_algorithm(
        [guess_lat, guess_lng],
        [image.latitude, image.longitude]
    )

    # Save guess
    guess = Guess(
        session_id=session.session_id,
        image_id=image.image_id,
        round_number=data["round_number"],
        guess_latitude=guess_lat,
        guess_longitude=guess_lng,
        distance_meters=distance_meters,
        score=score,
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
        "actual_latitude": image.latitude,
        "actual_longitude": image.longitude,
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
