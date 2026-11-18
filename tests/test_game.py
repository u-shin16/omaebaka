import random
import game


def make_room():
    r = game.Room("ABCDE", {"uid": "a", "name": "Alice"}, now=0, rng=random.Random(1))
    r.add_player({"uid": "b", "name": "Bob"})
    return r


def spell(r, uid, now):
    q = r.current()
    for i in game.answer_slots(q["a"]):
        res = r.pick(uid, q["a"][i], now)
    return res


def start_and_read(r):
    r.update_settings("a", "history", 5, "en")
    r.start("a", 0)
    r.tick(game.COUNTDOWN + 0.01)
    assert r.phase == "intro" and r.qi == 0 and r.public_state(game.COUNTDOWN)["index"] == 0
    r.tick(game.COUNTDOWN + game.INTRO_TIME + 0.02)
    assert r.phase == "reading" and r.qi == 0


def test_bank_has_100_each():
    for lang in game.LANGS:
        for k, v in game.QUESTIONS[lang].items():
            assert len(v) == 100, (lang, k)
            assert len({q["a"] for q in v}) == 100, (lang, k)
            for q in v:
                assert game.answer_slots(q["a"]), q


def test_kana_options_use_same_script():
    rng = random.Random(3)
    for ch in "あガ7Q":
        opts = game.make_options(ch, rng)
        assert ch in opts and len(set(opts)) == 4
        assert all(game.char_pool(o) is game.char_pool(ch) for o in opts)


def test_japanese_game_reveals_by_characters_and_accepts_kana():
    r = make_room()
    r.update_settings("a", "geography", 5, "ja")
    r.start("a", 0); r.tick(game.COUNTDOWN + 0.01); r.tick(game.COUNTDOWN + game.INTRO_TIME + 0.02)
    q = r.current()
    assert q["lang"] == "ja" and r.text_shown() == q["q"][:1]
    r.tick(game.COUNTDOWN + game.INTRO_TIME + 0.02 + game.JA_INTERVAL * 3 + 0.001)
    assert r.text_shown() == q["q"][:4]
    r.buzz("a", 5)
    assert spell(r, "a", 5.5) == "correct"


def test_correct_answer_scores_and_reveals():
    r = make_room(); start_and_read(r)
    assert r.buzz("a", 5)
    assert not r.buzz("b", 5)           # second buzz ignored
    assert spell(r, "a", 5.5) == "correct"
    assert r.players["a"]["score"] == 10 and r.phase == "reveal"
    r.tick(5.5 + game.REVEAL_TIME + 0.01)
    assert r.qi == 1 and r.phase == "intro"


def test_wrong_locks_out_and_other_can_buzz():
    r = make_room(); start_and_read(r)
    r.buzz("a", 5)
    q = r.current(); correct = q["a"][game.answer_slots(q["a"])[0]]
    wrong = next(c for c in r.options if c != correct)
    assert r.pick("a", wrong, 5.2) == "wrong"
    assert r.players["a"]["score"] == -5 and r.phase == "reading"
    assert not r.buzz("a", 5.3)
    assert r.buzz("b", 5.3)


def test_everyone_wrong_reveals():
    r = make_room(); start_and_read(r)
    for uid in ("a", "b"):
        r.buzz(uid, 5)
        r.tick(5 + 100)                 # answer timeout
    assert r.phase == "reveal" and r.event["type"] == "nobody"


def test_nobody_buzzes_reveals_after_window():
    r = make_room(); start_and_read(r)
    t = 4
    while r.phase == "reading":
        t += 0.1; r.tick(t)
    assert r.phase == "reveal"


def test_full_game_finishes_with_ranking():
    r = make_room(); start_and_read(r)
    t = 5
    while r.phase != "finished":
        if r.phase == "reading":
            r.buzz("b", t); spell(r, "b", t)
        t += 0.5; r.tick(t)
    s = r.public_state(t)
    assert s["ranking"][0]["uid"] == "b" and s["ranking"][0]["score"] == 50
    assert [x["win"] for x in r.results() if x["uid"] == "b"] == [True]


def test_answer_hidden_until_reveal():
    r = make_room(); start_and_read(r)
    s = r.public_state(4)
    assert "answer" not in s and all(c == "_" or game.char_pool(c) is None for c in s["mask"])
    assert r.current()["q"] != s["text"] or len(r.words) == 1


def test_only_host_starts():
    r = make_room()
    try:
        r.start("b", 0); assert False
    except ValueError:
        pass


def test_english_questions_have_japanese_translation():
    for k, v in game.QUESTIONS["en"].items():
        for q in v:
            assert q.get("q_ja") and q.get("a_ja"), (k, q["a"])


def test_results_include_review_of_played_questions():
    r = make_room(); start_and_read(r)   # English history, 5 questions
    t = 5
    while r.phase != "finished":
        t += 0.5; r.tick(t)
    rev = r.public_state(t)["review"]
    assert len(rev) == 5 and all(x["q_ja"] and x["a_ja"] for x in rev)


def test_timer_resets_after_each_correct_character():
    r = make_room(); start_and_read(r)
    # pick a question whose answer has at least 2 characters to choose
    while len(game.answer_slots(r.current()["a"])) < 2:
        r.questions[r.qi] = next(q for q in game.QUESTIONS["en"]["history"] if len(game.answer_slots(q["a"])) >= 2)
    r.buzz("a", 10)
    q = r.current(); first = q["a"][game.answer_slots(q["a"])[0]]
    assert r.pick("a", first, 10 + game.PICK_TIME - 0.5) == "ok"
    # well past the first deadline, but still within the new one
    r.tick(10 + game.PICK_TIME + 1)
    assert r.phase == "answering"
    r.tick(10 + game.PICK_TIME - 0.5 + game.PICK_TIME + 0.01)
    assert r.phase != "answering"
