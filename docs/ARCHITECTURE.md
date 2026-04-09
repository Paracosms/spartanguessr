# SpartanGuessr - Concurrent Players Architecture

## Overview

SpartanGuessr is a GeoGuessr-style game where players guess locations on a map. Players interact with the game independently - there is no real-time interaction between players. The backend must handle multiple concurrent players making API requests simultaneously.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Player A       │     │  Player B       │     │  Player C       │
│  (Browser)      │     │  (Browser)      │     │  (Browser)      │
│  - Own session  │     │  - Own session  │     │  - Own session  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │    Concurrent REST API requests                │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Gunicorn             │
                    │   (4 workers)          │
                    │                        │
                    │   Worker 1 ───▶ Flask  │
                    │   Worker 2 ───▶ Flask  │
                    │   Worker 3 ───▶ Flask  │
                    │   Worker 4 ───▶ Flask  │
                    └───────────┬────────────┘
                                │
                                │ Connection Pool
                                ▼
                    ┌────────────────────────┐
                    │   PostgreSQL           │
                    │   (Render managed)     │
                    │                        │
                    │   - Game sessions      │
                    │   - Guesses            │
                    │   - Images             │
                    └────────────────────────┘
```

---

## Why PostgreSQL (Not SQLite)

| Issue | SQLite | PostgreSQL |
|-------|--------|------------|
| Concurrent writes | Single file lock, blocks under load | Multiple simultaneous connections |
| Render filesystem | Ephemeral - data lost on redeploy | Persistent - survives deploys |
| Scaling | Cannot scale horizontally | Can add read replicas |

---

## Player Flow

Each player goes through this flow independently:

```
1. Player starts game
   └── POST /session → Creates new session in PostgreSQL

2. Player sees image
   └── GET /image/:id → Returns image to display

3. Player submits guess (repeated for each round)
   └── POST /guess → Calculates score, stores in PostgreSQL

4. Player sees results
   └── GET /session/:id/results → Returns all round scores
```

Each player has their own session. No shared state between players during gameplay.

---

## Concurrent Request Handling

```
                    ┌─────────────────────────────────────┐
                    │           Gunicorn                  │
                    │                                     │
   Player A ──────▶│  Worker 1 ───▶ Flask App Instance   │
   (HTTP req)      │                                     │
                    │                                     │
   Player B ──────▶│  Worker 2 ───▶ Flask App Instance   │
   (HTTP req)      │                                     │
                    │                                     │
   Player C ──────▶│  Worker 3 ───▶ Flask App Instance   │
   (HTTP req)      │                                     │
                    │                                     │
   Player D ──────▶│  Worker 4 ───▶ Flask App Instance   │
   (HTTP req)      │                                     │
                    └─────────────────────────────────────┘
                                     │
                                     │ SQLAlchemy
                                     │ Connection Pool
                                     ▼
                           ┌──────────────────┐
                           │   PostgreSQL     │
                           │                  │
                           │   10+ concurrent │
                           │   connections    │
                           └──────────────────┘
```

- **Workers**: Each handles one request at a time (4 workers = 4 concurrent requests)
- **Connection Pool**: SQLAlchemy maintains pool of DB connections
- **Stateless**: No player state in memory - all state in PostgreSQL

---

## Implementation

### 1. Update requirements.txt

```diff
  flask==3.0.3
  flask-cors==4.0.1
  python-dotenv==1.0.1
  gunicorn==22.0.0
  pytest==8.2.2
  flask-sqlalchemy
  sqlalchemy
+ psycopg2-binary==2.9.9
```

### 2. Update app.py Database Configuration

```python
import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from models import db, GameSession, Image, Guess

load_dotenv()

app = Flask(__name__)
CORS(app)

# PostgreSQL connection
database_url = os.environ.get("DATABASE_URL")

# Render provides "postgres://" but SQLAlchemy needs "postgresql://"
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# Fallback to SQLite for local development
app.config["SQLALCHEMY_DATABASE_URI"] = database_url or "sqlite:///spartanguessr.db"

# Connection pool settings for concurrent connections
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_size": 10,
    "max_overflow": 20
}

db.init_app(app)

with app.app_context():
    db.create_all()
```

### 3. Create render.yaml

Place in repository root:

```yaml
services:
  - type: web
    name: spartanguessr-backend
    env: python
    region: oregon
    plan: free
    buildCommand: pip install -r backend/requirements.txt
    startCommand: cd backend && gunicorn app:app --workers 4 --bind 0.0.0.0:$PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: DATABASE_URL
        fromDatabase:
          name: spartanguessr-db
          property: connectionString
      - key: ALLOWED_ORIGIN
        value: https://your-frontend-url.onrender.com

databases:
  - name: spartanguessr-db
    databaseName: spartanguessr
    user: spartanguessr_user
```

---

## Render Deployment Steps

1. **Create PostgreSQL Database**
   - Dashboard → New → PostgreSQL
   - Choose free tier
   - Note: `DATABASE_URL` is auto-generated

2. **Create Web Service**
   - Dashboard → New → Web Service
   - Connect GitHub repository
   - Render detects `render.yaml` automatically

3. **Link Database to Web Service**
   - In web service settings, add `DATABASE_URL` from database

4. **Set CORS Origin**
   - Add `ALLOWED_ORIGIN` environment variable
   - Set to your frontend URL (e.g., Vercel, Netlify, or Render static site)

---

## Gunicorn Configuration

```bash
gunicorn app:app --workers 4 --bind 0.0.0.0:$PORT
```

- **workers**: Number of worker processes (4 handles ~4 concurrent requests minimum)
- Free tier: 0.5 CPU, so 2-4 workers is appropriate
- Paid tier: Scale workers based on CPU cores (formula: `2 * CPU_cores + 1`)

---

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Render | PostgreSQL connection string (auto-provided) |
| `PORT` | Render | Port to bind (auto-provided) |
| `ALLOWED_ORIGIN` | You set | Frontend URL for CORS |

---

## How Concurrent Players Work

1. **Player A** sends POST /session → Worker 1 handles → Creates session in PostgreSQL
2. **Player B** sends POST /session → Worker 2 handles → Creates session in PostgreSQL
3. **Player A** sends POST /guess → Worker 3 handles → Updates Player A's session
4. **Player B** sends POST /guess → Worker 4 handles → Updates Player B's session
5. **Player C** sends GET /session/:id/results → Worker 1 handles → Reads from PostgreSQL

All happen simultaneously. No blocking. Each session is isolated.

---

## Checklist

- [ ] Add `psycopg2-binary==2.9.9` to `requirements.txt`
- [ ] Update database configuration in `app.py`
- [ ] Create `render.yaml` in repository root
- [ ] Create PostgreSQL database on Render
- [ ] Deploy web service on Render
- [ ] Set `ALLOWED_ORIGIN` environment variable