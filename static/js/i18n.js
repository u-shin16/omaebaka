'use strict';
/* UI text in Japanese and English. The chosen language is kept per browser. */
var I18N = (function () {
  var DICT = {
    en: {
      hero_title: 'Think fast.<br>Buzz first.',
      hero_lead: 'A real-time buzzer quiz for friends, in Japanese or English. Questions appear bit by bit — hit <b>BUZZ</b> the moment you know it, then spell the answer before time runs out.',
      sign_in_to_play: 'Sign in to play', google: 'Continue with Google', or_email: 'or use email',
      email: 'Email', password: 'Password', display_name: 'Display name',
      sign_in: 'Sign in', create_account: 'Create account',
      to_register: 'New here? Create an account', to_login: 'Have an account? Sign in', forgot: 'Forgot password?',
      how_title: 'How to play',
      how_list: '<li><b>Create a room</b> and choose the question language (Japanese or English) and a category: General Knowledge, History, Geography, Music, IT, or a mix.</li>' +
        '<li><b>Share the room code</b> (or the invite link) with up to 7 friends.</li>' +
        '<li>The question appears little by little. <b>Buzz</b> (or press <kbd>Space</kbd>) as soon as you know the answer.</li>' +
        '<li><b>Spell the answer</b> by choosing the right character from four options, one at a time (keys <kbd>1</kbd>–<kbd>4</kbd>).</li>' +
        '<li>Correct: <b>+10</b>. Wrong or too slow: <b>−5</b>, and you\'re out for that question — the others can still buzz.</li>',
      hi: 'Hi,', edit_name: 'Change name', save: 'Save', cancel: 'Cancel', name_saved: 'Name updated.', games: 'games', wins: 'wins', correct: 'correct', guest_stats: 'Guest stats are not saved.',
      create_room: 'Create a room', question_lang: 'Question language', category: 'Category', questions: 'Questions',
      create_btn: 'Create room', join_room: 'Join a room', room_code: 'Room code', join_btn: 'Join',
      copy_link: 'Send invite link', copied: 'Invite link copied. Paste it to your friends.', players: 'Players', settings: 'Settings',
      wait_host: 'Waiting for the host to start…', start: 'Start game', leave_room: 'Leave room', leave_game: 'Leave game',
      results: 'Results', host_again: 'The host can start another round.', play_again: 'Play again',
      terms: 'Terms', privacy: 'Privacy', play_link: 'Play', sign_out: 'Sign out', host: 'host', you: 'you', offline: 'offline',
      get_ready: 'Get ready', q_num: 'Question {n}', progress: 'Q{n} of {t}', skip: 'Skip to content', name_title: 'Choose your name', name_desc: 'This is what other players see. You can change it later.', name_start: 'Start with this name', err_bad_name: 'Enter a name (up to 16 characters).', signing_in: 'Signing in…', stamp_ok: 'Correct!', stamp_ng: 'Omae baka?!', stamp_none: 'Time\'s up', code_hint: 'Send this code to your friends. Up to 8 players.', option_label: 'Choice {i}: {c}', answer_label: 'Answer: {a}', buzz: 'BUZZ', locked: 'LOCKED',
      you_buzzed: 'You buzzed! Spell the answer.', buzzed_in: '{n} buzzed in…', got_it: '{n} got it! +10', you_got_it: 'You got it! +10',
      times_up: 'Time\'s up!', missed: '{n} missed! −5', you_missed: 'You missed! −5', ran_out: '{n} ran out of time. −5',
      you_ran_out: 'You ran out of time. −5', left: '{n} left.', reconnecting: 'Connection lost. Reconnecting…',
      enter_code: 'Enter the 5-character room code.', choose_name: 'Please choose a display name.',
      check_inbox: 'Check your inbox and click the link to verify your email, then sign in.',
      verify_first: 'Please verify your email first.', resend: 'Resend email', verification_sent: 'Verification email sent.',
      enter_email_first: 'Enter your email above first.', reset_sent: 'Password reset email sent.',
      share_text: 'Join my quiz room: {c}',
      lang_en: 'English', lang_ja: '日本語',
      cat_mix: 'Mix (all categories)', cat_general: 'General Knowledge', cat_history: 'History', cat_geography: 'Geography', cat_music: 'Music', cat_it: 'IT',
      err_room_full: 'This room is full (max 8 players).', err_host_only_settings: 'Only the host can change settings.',
      err_host_only_start: 'Only the host can start the game.', err_already_started: 'The game has already started.',
      err_bad_category: 'Unknown category.', err_bad_count: 'Unknown question count.', err_bad_lang: 'Unknown language.',
      err_sign_in_first: 'Please sign in first.', err_room_not_found: 'Room not found. Check the code.',
      err_not_in_room: 'You are not in a room.', err_sign_in_again: 'Please sign in again.',
      'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found': 'No account with that email.', 'auth/email-already-in-use': 'That email is already registered. Try signing in.',
      'auth/weak-password': 'Password must be at least 6 characters.', 'auth/invalid-email': 'That email address looks wrong.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled.', 'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
      auth_other: 'Something went wrong.'
    },
    ja: {
      hero_title: 'わかったら、<br>すぐ押せ。',
      hero_lead: '友だちと遊ぶリアルタイム早押しクイズ。問題は日本語か英語から選べます。少しずつ出てくる問題を読んで、わかった瞬間に<b>BUZZ</b>。時間内に答えを1文字ずつ選んで完成させよう。',
      sign_in_to_play: 'ログインして遊ぶ', google: 'Googleでログイン', or_email: 'またはメールアドレスで',
      email: 'メールアドレス', password: 'パスワード', display_name: '表示名',
      sign_in: 'ログイン', create_account: 'アカウントを作る',
      to_register: 'はじめての方はアカウントを作成', to_login: 'アカウントをお持ちの方はログイン', forgot: 'パスワードを忘れた方',
      how_title: '遊び方',
      how_list: '<li><b>部屋を作り</b>、問題の言語（日本語・英語）とジャンル（常識・歴史・地理・音楽・IT・ミックス）を選びます。</li>' +
        '<li><b>部屋コード</b>（または招待リンク）を最大7人の友だちに送ります。</li>' +
        '<li>問題は少しずつ表示されます。わかったらすぐ<b>BUZZ</b>（<kbd>スペース</kbd>キーでも可）。</li>' +
        '<li>4つの候補から正しい文字を選び、<b>答えを1文字ずつ完成</b>させます（<kbd>1</kbd>〜<kbd>4</kbd>キーでも可）。</li>' +
        '<li>正解は<b>+10点</b>。まちがい・時間切れは<b>−5点</b>で、その問題ではもう押せません。ほかの人は続けて押せます。</li>',
      hi: 'こんにちは、', edit_name: '名前を変える', save: '保存', cancel: 'やめる', name_saved: '名前を変更しました。', games: '試合', wins: '勝利', correct: '正解', guest_stats: 'ゲストの記録は保存されません。',
      create_room: '部屋を作る', question_lang: '問題の言語', category: 'ジャンル', questions: '問題数',
      create_btn: '部屋を作る', join_room: '部屋に入る', room_code: '部屋コード', join_btn: '入る',
      copy_link: '招待リンクを送る', copied: '招待リンクをコピーしました。友だちに貼り付けて送ってください', players: '参加者', settings: '設定',
      wait_host: 'ホストが始めるのを待っています…', start: 'ゲーム開始', leave_room: '部屋を出る', leave_game: 'ゲームをやめる',
      results: '結果', host_again: 'ホストはもう一度始められます。', play_again: 'もう一度遊ぶ',
      terms: '利用規約', privacy: 'プライバシーポリシー', play_link: '遊ぶ', sign_out: 'ログアウト', host: 'ホスト', you: 'あなた', offline: 'オフライン',
      get_ready: '準備中', q_num: '第{n}問', progress: '第{n}問 / 全{t}問', skip: '本文へ移動', name_title: '名前を決めよう', name_desc: '対戦相手に表示される名前です。あとから変えられます。', name_start: 'この名前ではじめる', err_bad_name: '名前を入力してください（16文字まで）。', signing_in: 'ログインしています…', stamp_ok: 'ピンポーン!', stamp_ng: 'おまえばか?', stamp_none: '時間切れ', code_hint: 'このコードを友だちに送ろう。最大8人まで。', option_label: '候補{i}：{c}', answer_label: '答え：{a}', buzz: 'BUZZ', locked: 'おてつき',
      you_buzzed: '押しました! 答えを選んでください', buzzed_in: '{n}さんが押しました…', got_it: '{n}さん正解! +10', you_got_it: '正解! +10',
      times_up: '時間切れ!', missed: '{n}さん、おてつき −5', you_missed: 'おてつき −5', ran_out: '{n}さん時間切れ −5',
      you_ran_out: '時間切れ −5', left: '{n}さんが抜けました', reconnecting: '接続が切れました。再接続しています…',
      enter_code: '5文字の部屋コードを入力してください。', choose_name: '表示名を入力してください。',
      check_inbox: '確認メールを送りました。メール内のリンクを押してから、ログインしてください。',
      verify_first: '先にメールアドレスの確認をしてください。', resend: '確認メールを再送', verification_sent: '確認メールを送りました。',
      enter_email_first: '上の欄にメールアドレスを入力してください。', reset_sent: 'パスワード再設定のメールを送りました。',
      share_text: '早押しクイズの部屋に入って! コード：{c}',
      lang_en: 'English（英語）', lang_ja: '日本語',
      cat_mix: 'ミックス（全ジャンル）', cat_general: '常識', cat_history: '歴史', cat_geography: '地理', cat_music: '音楽', cat_it: 'IT',
      err_room_full: 'この部屋は満員です（最大8人）。', err_host_only_settings: '設定を変えられるのはホストだけです。',
      err_host_only_start: 'ゲームを始められるのはホストだけです。', err_already_started: 'ゲームはもう始まっています。',
      err_bad_category: 'ジャンルが正しくありません。', err_bad_count: '問題数が正しくありません。', err_bad_lang: '言語が正しくありません。',
      err_sign_in_first: '先にログインしてください。', err_room_not_found: '部屋が見つかりません。コードを確認してください。',
      err_not_in_room: '部屋に入っていません。', err_sign_in_again: 'もう一度ログインしてください。',
      'auth/invalid-credential': 'メールアドレスかパスワードがちがいます。', 'auth/wrong-password': 'メールアドレスかパスワードがちがいます。',
      'auth/user-not-found': 'そのメールアドレスのアカウントはありません。', 'auth/email-already-in-use': 'そのメールアドレスは登録済みです。ログインしてください。',
      'auth/weak-password': 'パスワードは6文字以上にしてください。', 'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
      'auth/popup-closed-by-user': 'ログインがキャンセルされました。', 'auth/too-many-requests': '試行回数が多すぎます。少し待ってください。',
      auth_other: 'エラーが発生しました。'
    }
  };
  var lang;
  try { lang = localStorage.getItem('uiLang'); } catch (e) { lang = null; }
  if (lang !== 'ja' && lang !== 'en') lang = 'ja';   // 日本のアプリなので日本語が初期表示
  var listeners = [];

  function t(key, vars) {
    var s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-html]'), function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-lang]'), function (el) { el.hidden = el.getAttribute('data-lang') !== lang; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ui-lang]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-ui-lang') === lang);
      b.setAttribute('aria-pressed', b.getAttribute('data-ui-lang') === lang);
    });
  }
  function set(l) {
    lang = l;
    try { localStorage.setItem('uiLang', l); } catch (e) {}
    apply();
    listeners.forEach(function (cb) { try { cb(l); } catch (e) {} });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-ui-lang]');
    if (b) set(b.getAttribute('data-ui-lang'));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
  return { t: t, lang: function () { return lang; }, set: set, apply: apply, onChange: function (cb) { listeners.push(cb); } };
})();
