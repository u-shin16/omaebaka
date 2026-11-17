"""Omae Baka? — real-time English buzzer quiz (Flask + Socket.IO)."""
import os
import re
import sqlite3
import threading
import time

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

import game

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "").strip()
ALLOW_GUEST = os.environ.get("ALLOW_GUEST", "0") == "1"
DB_PATH = os.environ.get("STATS_DB", os.path.join(BASE_DIR, "data", "stats.db"))
SITE_URL = os.environ.get("SITE_URL", "https://omaebaka.webtool-labs.com").rstrip("/")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32)
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins=os.environ.get("CORS_ORIGINS", "*").split(","))

# ---------- stats (sqlite) ----------
_db_lock = threading.Lock()


def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS stats (uid TEXT PRIMARY KEY, games INTEGER DEFAULT 0,"
        " wins INTEGER DEFAULT 0, correct INTEGER DEFAULT 0)"
    )
    return conn


def get_stats(uid):
    with _db_lock, db() as conn:
        row = conn.execute("SELECT games, wins, correct FROM stats WHERE uid=?", (uid,)).fetchone()
    return {"games": row[0], "wins": row[1], "correct": row[2]} if row else {"games": 0, "wins": 0, "correct": 0}


def record_results(results):
    rows = [r for r in results if not r["guest"]]
    if not rows:
        return
    with _db_lock, db() as conn:
        for r in rows:
            conn.execute("INSERT OR IGNORE INTO stats (uid) VALUES (?)", (r["uid"],))
            conn.execute(
                "UPDATE stats SET games=games+1, wins=wins+?, correct=correct+? WHERE uid=?",
                (1 if r["win"] else 0, r["correct"], r["uid"]),
            )


# ---------- auth ----------
def clean_name(name):
    name = re.sub(r"[\x00-\x1f<>]", "", str(name or "")).strip()
    return name[:16]


def verify_token(token):
    """Verify a Firebase ID token. Returns claims or None."""
    if not FIREBASE_PROJECT_ID or not token:
        return None
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_firebase_token(token, g_requests.Request(), audience=FIREBASE_PROJECT_ID, clock_skew_in_seconds=30)
    except Exception as e:
        app.logger.warning("token rejected: %s", str(e)[:200])
        return None
    if not claims:
        return None
    provider = (claims.get("firebase") or {}).get("sign_in_provider")
    if provider == "password" and not claims.get("email_verified"):
        return None
    return claims


# ---------- in-memory rooms ----------
rooms = {}            # code -> Room
sessions = {}         # sid -> {"user": {...}, "room": code}
user_sids = {}        # uid -> set(sid)
state_lock = threading.RLock()
_finished_recorded = set()


def broadcast(room):
    now = time.time()
    state = room.public_state(now)
    socketio.emit("room", state, to=room.code)
    for uid in room.players:
        for sid in user_sids.get(uid, ()):
            if sessions.get(sid, {}).get("room") == room.code:
                socketio.emit("private", room.private_state(uid), to=sid)
    key = (room.code, id(room.questions))
    if room.phase == "finished" and room.questions and key not in _finished_recorded:
        _finished_recorded.add(key)
        try:
            record_results(room.results())
        except Exception as e:  # stats must never break the game
            app.logger.warning("stats failed: %s", e)


def ticker():
    while True:
        socketio.sleep(0.1)
        now = time.time()
        with state_lock:
            for code, room in list(rooms.items()):
                with room.lock:
                    changed = room.tick(now)
                if changed:
                    broadcast(room)
                if room.is_empty() and now - room.last_active > 600:
                    rooms.pop(code, None)


_ticker_started = False


def ensure_ticker():
    global _ticker_started
    with state_lock:
        if not _ticker_started:
            _ticker_started = True
            socketio.start_background_task(ticker)


def current_user():
    s = sessions.get(request.sid)
    return s["user"] if s and s.get("user") else None


def fail(msg):
    emit("error_msg", {"message": msg})


# ---------- socket events ----------
@socketio.on("connect")
def on_connect():
    ensure_ticker()
    sessions[request.sid] = {"user": None, "room": None}


@socketio.on("disconnect")
def on_disconnect(*_args):
    with state_lock:
        s = sessions.pop(request.sid, None)
        if not s or not s.get("user"):
            return
        uid = s["user"]["uid"]
        user_sids.get(uid, set()).discard(request.sid)
        code = s.get("room")
        room = rooms.get(code)
        if room and not any(sessions.get(x, {}).get("room") == code for x in user_sids.get(uid, ())):
            with room.lock:
                if room.phase in ("lobby", "finished"):
                    room.remove_player(uid, time.time())
                else:
                    room.set_connected(uid, False)
            broadcast(room)


@socketio.on("hello")
def on_hello(data):
    data = data or {}
    user = None
    claims = verify_token(data.get("token"))
    if claims:
        name = clean_name(data.get("name")) or clean_name(claims.get("name")) or clean_name((claims.get("email") or "").split("@")[0]) or "Player"
        user = {"uid": claims["user_id"] if "user_id" in claims else claims["sub"], "name": name, "guest": False}
    elif ALLOW_GUEST and data.get("guest"):
        name = clean_name(data.get("name")) or "Guest"
        gid = re.sub(r"[^a-zA-Z0-9]", "", str(data.get("guestId") or ""))[:32] or request.sid
        user = {"uid": "guest-" + gid, "name": name, "guest": True}
    if not user:
        emit("auth_failed", {"message": "Please sign in again."})
        return
    with state_lock:
        old = sessions.get(request.sid, {}).get("user")
        if old and old["uid"] != user["uid"]:
            user_sids.get(old["uid"], set()).discard(request.sid)
        sessions[request.sid] = {"user": user, "room": None}
        user_sids.setdefault(user["uid"], set()).add(request.sid)
    stats = get_stats(user["uid"]) if not user["guest"] else None
    emit("welcome", {"user": user, "stats": stats})


def _enter(room, user):
    with room.lock:
        room.add_player(user)
    sessions[request.sid]["room"] = room.code
    join_room(room.code)
    broadcast(room)


@socketio.on("create_room")
def on_create(data):
    user = current_user()
    if not user:
        return fail("Please sign in first.")
    data = data or {}
    with state_lock:
        _leave_current()
        code = game.new_code(rooms)
        room = game.Room(code, user, now=time.time())
        try:
            room.update_settings(user["uid"], data.get("category", "mix"), data.get("count", 10))
        except ValueError as e:
            return fail(str(e))
        rooms[code] = room
        _enter(room, user)


@socketio.on("join_room")
def on_join(data):
    user = current_user()
    if not user:
        return fail("Please sign in first.")
    code = re.sub(r"[^A-Z0-9]", "", str((data or {}).get("code", "")).upper())
    with state_lock:
        room = rooms.get(code)
        if not room:
            return fail("Room not found. Check the code.")
        if sessions[request.sid].get("room") != code:
            _leave_current()
        try:
            _enter(room, user)
        except ValueError as e:
            return fail(str(e))


def _leave_current():
    s = sessions.get(request.sid)
    if not s or not s.get("room"):
        return
    code = s["room"]
    s["room"] = None
    leave_room(code)
    room = rooms.get(code)
    if room and s.get("user"):
        with room.lock:
            room.remove_player(s["user"]["uid"], time.time())
        broadcast(room)


@socketio.on("leave_room")
def on_leave(_data=None):
    with state_lock:
        _leave_current()
    emit("left", {})


def _room_action(fn):
    user = current_user()
    s = sessions.get(request.sid) or {}
    room = rooms.get(s.get("room"))
    if not user or not room:
        return fail("You are not in a room.")
    try:
        with room.lock:
            fn(room, user["uid"], time.time())
    except ValueError as e:
        return fail(str(e))
    broadcast(room)


@socketio.on("settings")
def on_settings(data):
    data = data or {}
    _room_action(lambda r, uid, now: r.update_settings(uid, data.get("category"), data.get("count")))


@socketio.on("start")
def on_start(_data=None):
    _room_action(lambda r, uid, now: r.start(uid, now))


@socketio.on("buzz")
def on_buzz(_data=None):
    _room_action(lambda r, uid, now: r.buzz(uid, now))


@socketio.on("pick")
def on_pick(data):
    ch = (data or {}).get("ch")
    _room_action(lambda r, uid, now: r.pick(uid, ch, now))


# ---------- pages ----------
@app.route("/")
def index():
    return render_template("index.html", allow_guest=ALLOW_GUEST, firebase_ready=bool(FIREBASE_PROJECT_ID))


@app.route("/privacy")
def privacy():
    return render_template("privacy.html")


@app.route("/terms")
def terms():
    return render_template("terms.html")


@app.route("/healthz")
def healthz():
    return jsonify(ok=True, rooms=len(rooms))


@app.route("/robots.txt")
def robots():
    return Response(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap():
    urls = "".join(f"<url><loc>{SITE_URL}{p}</loc></url>" for p in ("/", "/privacy", "/terms"))
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    return Response(xml, mimetype="application/xml")


if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8007)), debug=False, allow_unsafe_werkzeug=True)
