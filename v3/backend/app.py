import os, sqlite3, time
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, 'leaderboard.db')
DIFFICULTIES = {"easy", "normal", "hard"}

app = FastAPI(title="Flappy Arcade API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScoreIn(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    score: int = Field(ge=0)
    difficulty: str

class ScoreOut(BaseModel):
    id: int
    name: str
    score: int
    difficulty: str
    created_at: float


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                score INTEGER NOT NULL,
                difficulty TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_scores ON scores(score DESC, created_at ASC)")
        conn.commit()

@app.on_event("startup")
async def on_startup():
    init_db()

@app.get("/api/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/api/readyz")
async def readyz():
    # simple readiness: DB file exists and is writable
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("SELECT 1")
        return {"ready": True}
    except Exception:
        return {"ready": False}

@app.get("/api/leaderboard", response_model=List[ScoreOut])
async def leaderboard(limit: int = Query(10, ge=1, le=100), difficulty: Optional[str] = Query(None)):
    q = "SELECT id, name, score, difficulty, created_at FROM scores"
    params = []
    if difficulty:
        if difficulty not in DIFFICULTIES:
            raise HTTPException(400, detail="invalid difficulty")
        q += " WHERE difficulty = ?"
        params.append(difficulty)
    q += " ORDER BY score DESC, created_at ASC LIMIT ?"
    params.append(limit)

    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(q, params).fetchall()
    return [
        {"id": r[0], "name": r[1], "score": r[2], "difficulty": r[3], "created_at": r[4]}
        for r in rows
    ]

@app.post("/api/score", response_model=ScoreOut)
async def post_score(payload: ScoreIn):
    name = sanitize_name(payload.name)
    if payload.difficulty not in DIFFICULTIES:
        raise HTTPException(400, detail="invalid difficulty")

    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO scores(name, score, difficulty, created_at) VALUES(?,?,?,?)",
            (name, int(payload.score), payload.difficulty, now),
        )
        conn.commit()
        sid = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, score, difficulty, created_at FROM scores WHERE id=?",
            (sid,)
        ).fetchone()
    return {"id": row[0], "name": row[1], "score": row[2], "difficulty": row[3], "created_at": row[4]}


def sanitize_name(s: str) -> str:
    s = s.strip()
    # allow letters, digits, space, - _ .
    filtered = ''.join(ch for ch in s if ch.isalnum() or ch in " -_.")
    return filtered[:20] or "Player"

if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)