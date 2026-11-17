"""Omae Baka? — game logic (no networking here, so it can be tested directly)."""
import os
import random
import string
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUESTION_DIR = os.path.join(BASE_DIR, "questions")

CATEGORIES = {
    "general": "General Knowledge",
    "history": "History",
    "geography": "Geography",
    "music": "Music",
    "it": "IT",
}
CATEGORY_CHOICES = list(CATEGORIES) + ["mix"]
COUNT_CHOICES = [5, 10, 15, 20]
MAX_PLAYERS = 8

WORD_INTERVAL = 0.32      # seconds between revealed words
BUZZ_WINDOW = 6.0         # seconds to buzz after the full question is shown
ANSWER_BASE = 5.0         # answer time = base + per_char * letters
ANSWER_PER_CHAR = 1.3
REVEAL_TIME = 4.0         # seconds the correct answer is shown
COUNTDOWN = 3.0           # seconds before the first question
POINTS_CORRECT = 10
POINTS_WRONG = -5


def load_questions():
    bank = {}
    for key in CATEGORIES:
        items = []
        with open(os.path.join(QUESTION_DIR, f"{key}.txt"), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                answer, question = line.split("|", 1)
                items.append({"cat": key, "a": answer.strip().upper(), "q": question.strip()})
        bank[key] = items
    return bank


QUESTIONS = load_questions()


def answer_slots(answer):
    """Indexes of characters the player must pick (letters and digits)."""
    return [i for i, ch in enumerate(answer) if ch.isalnum()]


def make_options(correct, rng):
    pool = string.digits if correct.isdigit() else string.ascii_uppercase
    others = rng.sample([c for c in pool if c != correct], 3)
    options = others + [correct]
    rng.shuffle(options)
    return options


def pick_questions(category, count, rng):
    if category == "mix":
        pool = [q for items in QUESTIONS.values() for q in items]
    else:
        pool = list(QUESTIONS[category])
    return rng.sample(pool, min(count, len(pool)))


class Room:
    def __init__(self, code, host, now=None, rng=None):
        self.code = code
        self.rng = rng or random.Random()
        self.lock = threading.RLock()
        self.host_uid = host["uid"]
        self.players = {}           # uid -> player dict (insertion order = join order)
        self.settings = {"category": "mix", "count": 10}
        self.phase = "lobby"
        self.questions = []
        self.qi = -1
        self.words = []
        self.shown = 0
        self.next_at = 0.0          # next timed event
        self.locked = set()         # uids who already missed this question
        self.buzzer = None
        self.pos = 0                # index into answer slots
        self.options = []
        self.answer_deadline = 0.0
        self.event = None           # last thing that happened (shown as a banner)
        self.version = 0
        self.last_active = now if now is not None else time.time()
        self.add_player(host)

    # ---------- players ----------
    def add_player(self, user):
        uid = user["uid"]
        if uid in self.players:
            self.players[uid]["connected"] = True
            self.players[uid]["name"] = user["name"]
        else:
            if len(self.players) >= MAX_PLAYERS:
                raise ValueError("This room is full (max 8 players).")
            self.players[uid] = {
                "uid": uid, "name": user["name"], "guest": user.get("guest", False),
                "score": 0, "correct": 0, "wrong": 0, "connected": True,
            }
        self._touch()

    def remove_player(self, uid, now):
        if uid not in self.players:
            return
        if self.phase == "lobby" or self.phase == "finished":
            del self.players[uid]
        else:
            self.players[uid]["connected"] = False
            if self.buzzer == uid:
                self._wrong(uid, now, reason="left")
        if self.host_uid == uid:
            nxt = next((p["uid"] for p in self.players.values() if p["connected"]), None)
            if nxt:
                self.host_uid = nxt
        self._touch()

    def set_connected(self, uid, connected):
        if uid in self.players:
            self.players[uid]["connected"] = connected
            self._touch()

    def connected_uids(self):
        return [u for u, p in self.players.items() if p["connected"]]

    def is_empty(self):
        return not self.connected_uids()

    # ---------- settings / flow ----------
    def update_settings(self, uid, category=None, count=None):
        if uid != self.host_uid or self.phase not in ("lobby", "finished"):
            raise ValueError("Only the host can change settings before the game.")
        if category is not None:
            if category not in CATEGORY_CHOICES:
                raise ValueError("Unknown category.")
            self.settings["category"] = category
        if count is not None:
            count = int(count)
            if count not in COUNT_CHOICES:
                raise ValueError("Unknown question count.")
            self.settings["count"] = count
        self._touch()

    def start(self, uid, now):
        if uid != self.host_uid:
            raise ValueError("Only the host can start the game.")
        if self.phase not in ("lobby", "finished"):
            raise ValueError("The game has already started.")
        # people who left during the previous game are dropped now
        self.players = {u: p for u, p in self.players.items() if p["connected"]}
        for p in self.players.values():
            p.update(score=0, correct=0, wrong=0)
        self.questions = pick_questions(self.settings["category"], self.settings["count"], self.rng)
        self.qi = -1
        self.event = None
        self.phase = "countdown"
        self.next_at = now + COUNTDOWN
        self._touch()

    def _next_question(self, now):
        self.qi += 1
        if self.qi >= len(self.questions):
            self.phase = "finished"
            self.event = None
            self._touch()
            return
        q = self.questions[self.qi]
        self.words = q["q"].split()
        self.shown = 1
        self.locked = set()
        self.buzzer = None
        self.event = None
        self.phase = "reading"
        self.next_at = now + WORD_INTERVAL
        self._touch()

    def current(self):
        if 0 <= self.qi < len(self.questions):
            return self.questions[self.qi]
        return None

    # ---------- buzz & answer ----------
    def buzz(self, uid, now):
        if self.phase != "reading":
            return False
        p = self.players.get(uid)
        if not p or not p["connected"] or uid in self.locked:
            return False
        q = self.current()
        self.buzzer = uid
        self.pos = 0
        slots = answer_slots(q["a"])
        self.options = make_options(q["a"][slots[0]], self.rng)
        self.answer_deadline = now + ANSWER_BASE + ANSWER_PER_CHAR * len(slots)
        self.phase = "answering"
        self.event = {"type": "buzz", "uid": uid, "name": p["name"]}
        self._touch()
        return True

    def pick(self, uid, ch, now):
        if self.phase != "answering" or uid != self.buzzer:
            return None
        q = self.current()
        slots = answer_slots(q["a"])
        ch = str(ch or "").upper()[:1]
        if ch not in self.options:
            return None
        if ch != q["a"][slots[self.pos]]:
            self._wrong(uid, now, reason="wrong", picked=self.pos)
            return "wrong"
        self.pos += 1
        if self.pos >= len(slots):
            p = self.players[uid]
            p["score"] += POINTS_CORRECT
            p["correct"] += 1
            self.phase = "reveal"
            self.shown = len(self.words)
            self.event = {"type": "correct", "uid": uid, "name": p["name"]}
            self.next_at = now + REVEAL_TIME
            self._touch()
            return "correct"
        self.options = make_options(q["a"][slots[self.pos]], self.rng)
        self._touch()
        return "ok"

    def _wrong(self, uid, now, reason, picked=None):
        p = self.players[uid]
        p["score"] += POINTS_WRONG
        p["wrong"] += 1
        self.locked.add(uid)
        self.buzzer = None
        self.options = []
        self.event = {"type": reason, "uid": uid, "name": p["name"]}
        remaining = [u for u in self.connected_uids() if u not in self.locked]
        if not remaining:
            self._reveal_nobody(now)
            return
        self.phase = "reading"
        if self.shown >= len(self.words):
            self.next_at = now + BUZZ_WINDOW
        else:
            self.next_at = now + WORD_INTERVAL
        self._touch()

    def _reveal_nobody(self, now):
        self.phase = "reveal"
        self.shown = len(self.words)
        self.buzzer = None
        self.event = {"type": "nobody"}
        self.next_at = now + REVEAL_TIME
        self._touch()

    # ---------- clock ----------
    def tick(self, now):
        """Advance timers. Returns True if the state changed."""
        before = self.version
        if self.phase == "countdown" and now >= self.next_at:
            self._next_question(now)
        elif self.phase == "reading" and now >= self.next_at:
            if self.shown < len(self.words):
                self.shown += 1
                self.next_at = now + (BUZZ_WINDOW if self.shown >= len(self.words) else WORD_INTERVAL)
                self._touch()
            else:
                self._reveal_nobody(now)
        elif self.phase == "answering" and now >= self.answer_deadline:
            self._wrong(self.buzzer, now, reason="timeout")
        elif self.phase == "reveal" and now >= self.next_at:
            self._next_question(now)
        if self.phase in ("reading", "answering", "countdown") and self.is_empty():
            # nobody left: stop the game quietly
            self.phase = "finished"
            self._touch()
        return self.version != before

    def _touch(self):
        self.version += 1
        self.last_active = time.time()

    # ---------- views ----------
    def public_state(self, now):
        q = self.current()
        state = {
            "code": self.code,
            "host": self.host_uid,
            "phase": self.phase,
            "settings": dict(self.settings),
            "categories": CATEGORIES,
            "players": [
                {k: p[k] for k in ("uid", "name", "score", "correct", "wrong", "connected", "guest")}
                for p in self.players.values()
            ],
            "event": self.event,
            "total": len(self.questions),
            "index": self.qi,
            "locked": sorted(self.locked),
            "buzzer": self.buzzer,
        }
        if self.phase == "countdown":
            state["remaining"] = max(0.0, self.next_at - now)
        if q and self.phase in ("reading", "answering", "reveal"):
            state["category"] = CATEGORIES[q["cat"]]
            state["text"] = " ".join(self.words[: self.shown])
            state["complete"] = self.shown >= len(self.words)
            ans = q["a"]
            if self.phase == "reveal":
                state["answer"] = ans
            else:
                slots = answer_slots(ans)
                filled = set(slots[: self.pos]) if self.phase == "answering" else set()
                state["mask"] = "".join(
                    ch if (not ch.isalnum() or i in filled) else "_" for i, ch in enumerate(ans)
                )
            if self.phase == "answering":
                state["answer_left"] = max(0.0, self.answer_deadline - now)
                state["answer_total"] = ANSWER_BASE + ANSWER_PER_CHAR * len(answer_slots(ans))
            if self.phase == "reading" and state["complete"]:
                state["buzz_left"] = max(0.0, self.next_at - now)
        if self.phase == "finished":
            ranking = sorted(self.players.values(), key=lambda p: (-p["score"], -p["correct"], p["wrong"]))
            state["ranking"] = [{"uid": p["uid"], "name": p["name"], "score": p["score"]} for p in ranking]
        return state

    def private_state(self, uid):
        if self.phase == "answering" and uid == self.buzzer:
            return {"options": self.options}
        return {"options": []}

    def results(self):
        """Per-player results of a finished game (for stats)."""
        if not self.players:
            return []
        top = max(p["score"] for p in self.players.values())
        multi = len(self.players) > 1
        return [
            {"uid": p["uid"], "guest": p["guest"], "correct": p["correct"],
             "win": multi and p["score"] == top and top > 0}
            for p in self.players.values()
        ]


def new_code(existing, rng=random):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(rng.choice(alphabet) for _ in range(5))
        if code not in existing:
            return code
