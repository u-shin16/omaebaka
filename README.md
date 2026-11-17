# おまえばか?（Omae Baka?）

英語で遊ぶリアルタイム早押しクイズ。部屋を作ってコードを共有し、最大8人で対戦する。

- 問題文は1単語ずつ表示 → BUZZ（Space）→ 答えを1文字ずつ4択から選んで綴る（1〜4キー）
- 正解 +10、不正解・時間切れ −5（その問題はもう押せない）
- 問題：常識・歴史・地理・音楽・IT 各100問（`questions/*.txt`、`答え | 問題文`）
- ログイン：Firebase Authentication（Google／メール＋パスワード、メールは確認済みのみ）
- 戦績（試合数・勝利数・正解数）は `data/stats.db`（SQLite）

## 構成

- `app.py` … Flask＋Flask-SocketIO。ログイン確認（Firebase IDトークンを google-auth で検証、秘密鍵不要）と部屋の管理
- `game.py` … ゲーム進行（早押し判定・採点・タイマー）。答えはサーバーだけが持ち、回答者にだけ4択を送る
- 部屋はサーバーのメモリ上にある → **gunicornのworkerは必ず1つ**

## 手元で動かす

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # ALLOW_GUEST=1 にするとゲストで遊べる（開発用）
.venv/bin/python app.py   # http://127.0.0.1:8007
.venv/bin/python -m pytest -q tests
```

## 本番（予定・未構築）

- ドメイン：omaebaka.webtool-labs.com、ポート 8007
- 起動：`gunicorn -w 1 --threads 100 -b 127.0.0.1:8007 app:app`
- nginx は WebSocket を通す設定が必要（`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`）
- `.env`：`FIREBASE_PROJECT_ID`、`SECRET_KEY`、`ALLOW_GUEST=0`
- `static/js/firebase-config.js` に Firebase のウェブアプリ設定を貼る
- Firebase の「承認済みドメイン」に omaebaka.webtool-labs.com を追加
