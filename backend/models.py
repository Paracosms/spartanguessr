from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class GameSession(db.Model):
    session_id = db.Column(db.Integer, primary_key=True)
    difficulty = db.Column(db.String(10), nullable=False)
    max_rounds = db.Column(db.Integer, nullable=False)
    total_score = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Image(db.Model):
    image_id = db.Column(db.Integer, primary_key=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)

class Guess(db.Model):
    guess_id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("game_session.session_id"))
    image_id = db.Column(db.Integer, db.ForeignKey("image.image_id"))
    round_number = db.Column(db.Integer, nullable=False)
    guess_latitude = db.Column(db.Float)
    guess_longitude = db.Column(db.Float)
    distance_meters = db.Column(db.Float)
    score = db.Column(db.Integer)
    seed = db.Column(db.String(50), nullable=True)
