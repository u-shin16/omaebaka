'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var t = I18N.t;
  var CAT_KEYS = ['mix', 'general', 'history', 'geography', 'music', 'it', 'anime', 'sports', 'science', 'food'];
  var COUNTS = [5, 10, 15, 20];
  var QLANGS = ['ja', 'en'];

  var me = null;            // {uid, name, guest}
  var stats = null;
  var room = null;          // latest public room state
  var options = [];         // my character options while answering
  var receivedAt = 0;
  var authMode = 'login';   // or 'register'
  var fbReady = false;

  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function local(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  function show(name) {
    ['login', 'name', 'home', 'lobby', 'game', 'result'].forEach(function (s) { $('screen-' + s).hidden = (s !== name); });
  }
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fillSelect(sel, items, value) {
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + it[0] + '"' + (String(it[0]) === String(value) ? ' selected' : '') + '>' + esc(it[1]) + '</option>';
    }).join('');
  }
  function catItems() { return CAT_KEYS.map(function (k) { return [k, t('cat_' + k)]; }); }
  function langItems() { return QLANGS.map(function (k) { return [k, t('lang_' + k)]; }); }
  function countItems() { return COUNTS.map(function (n) { return [n, n]; }); }

  // ---------------- socket ----------------
  var socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', function () { hello(); });
  socket.on('welcome', function (d) {
    me = d.user; stats = d.stats;
    renderAccount(); renderHome();
    if (d.named === false) {           // first sign-in: choose a name before anything else
      $('in-firstname').value = ''; $('name-msg').textContent = '';
      show('name'); $('in-firstname').focus();
      return;
    }
    enterApp();
  });
  function enterApp() {
    var want = (new URLSearchParams(location.search).get('room') || store('room') || '').toUpperCase();
    if (want) socket.emit('join_room', { code: want });
    else if (!room) show('home');
  }
  socket.on('name_set', function (d) {
    if (me) me.name = d.name;
    renderAccount(); renderHome();
    $('name-view').hidden = false; $('name-edit').hidden = true;
    if (!$('screen-name').hidden) enterApp();
    else toast(t('name_saved'));
  });
  $('form-name').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = $('in-firstname').value.trim().slice(0, 16);
    if (!n) { $('name-msg').textContent = t('err_bad_name'); $('in-firstname').setAttribute('aria-invalid', 'true'); $('in-firstname').focus(); return; }
    $('in-firstname').removeAttribute('aria-invalid');
    socket.emit('set_name', { name: n });
  });
  socket.on('auth_failed', function (d) {
    me = null; renderAccount(); show('login');
    if (d && d.code && fbReady && firebase.auth().currentUser) $('login-msg').textContent = t('err_' + d.code);
  });
  socket.on('error_msg', function (d) {
    toast(t('err_' + d.code));
    if (!$('screen-name').hidden) $('name-msg').textContent = t('err_' + d.code);
    if (!$('screen-home').hidden) { $('join-msg').textContent = t('err_' + d.code); $('in-code').setAttribute('aria-invalid', 'true'); }
    if (d.code === 'room_not_found') { store('room', null); clearRoomParam(); if (!room) show('home'); }
  });
  socket.on('left', function () { room = null; store('room', null); clearRoomParam(); show('home'); });
  socket.on('room', function (s) { room = s; receivedAt = performance.now(); store('room', s.code); render(); });
  socket.on('private', function (p) { options = p.options || []; pickPending = false; renderOptions(); });
  socket.on('disconnect', function () { toast(t('reconnecting')); });

  function clearRoomParam() { if (location.search) history.replaceState(null, '', location.pathname); }

  // Until Firebase has restored the saved sign-in, show nothing:
  // showing the sign-in screen first made it flash on every reload for signed-in players.
  var authResolved = false;

  function hello() {
    if (fbReady && !authResolved) return;      // onAuthStateChanged calls hello() when ready
    if (fbReady && firebase.auth().currentUser) {
      var u = firebase.auth().currentUser;
      u.getIdToken().then(function (token) {
        socket.emit('hello', { token: token });
      });
    } else if (local('guestName') && $('form-guest')) {
      socket.emit('hello', { guest: true, name: local('guestName'), guestId: guestId() });
    } else {
      show('login');
    }
  }
  function guestId() {
    var g = local('guestId');
    if (!g) { g = Math.random().toString(36).slice(2) + Date.now().toString(36); local('guestId', g); }
    return g;
  }

  // ---------------- auth ----------------
  if (typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey) {
    firebase.initializeApp(FIREBASE_CONFIG);
    fbReady = true;
    firebase.auth().onAuthStateChanged(function (u) {
      authResolved = true;
      if (u && !u.emailVerified && !u.providerData.some(function (p) { return p.providerId === 'google.com'; })) { show('login'); return; }
      if (u) { if (socket.connected) hello(); }
      else if (local('guestName') && $('form-guest')) { if (socket.connected) hello(); }
      else { me = null; renderAccount(); show('login'); }
    });
  } else {
    show('login');
    $('btn-google').disabled = true;
    $('btn-email').disabled = true;
  }
  function authError(e) { return (e && e.code && I18N.t(e.code) !== e.code) ? t(e.code) : t('auth_other'); }

  function renderAuthMode() {
    $('btn-email').textContent = authMode === 'login' ? t('sign_in') : t('create_account');
    $('in-pass').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    $('link-toggle').textContent = authMode === 'login' ? t('to_register') : t('to_login');
  }
  renderAuthMode();

  $('btn-google').addEventListener('click', function () {
    if (!fbReady) return;
    $('login-msg').textContent = '';
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(function (e) { $('login-msg').textContent = authError(e); });
  });
  $('link-toggle').addEventListener('click', function (ev) {
    ev.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    renderAuthMode(); $('login-msg').textContent = '';
  });
  $('link-reset').addEventListener('click', function (ev) {
    ev.preventDefault();
    var email = $('in-email').value.trim();
    if (!email) { $('login-msg').textContent = t('enter_email_first'); return; }
    if (!fbReady) return;
    firebase.auth().sendPasswordResetEmail(email)
      .then(function () { $('login-msg').textContent = t('reset_sent'); })
      .catch(function (e) { $('login-msg').textContent = authError(e); });
  });
  $('form-email').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!fbReady) return;
    var email = $('in-email').value.trim(), pass = $('in-pass').value, auth = firebase.auth();
    var btn = $('btn-email');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = t('signing_in');
    var release = function () { btn.disabled = false; renderAuthMode(); };
    $('login-msg').textContent = '';
    if (authMode === 'register') {
      auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
        return cred.user.sendEmailVerification();
      }).then(function () {
        release(); $('login-msg').textContent = t('check_inbox');
        return auth.signOut();
      }).catch(function (e) { release(); $('login-msg').textContent = authError(e); });
    } else {
      auth.signInWithEmailAndPassword(email, pass).then(function (cred) {
        release();
        if (!cred.user.emailVerified) {
          $('login-msg').innerHTML = esc(t('verify_first')) + ' <a href="#" id="link-resend">' + esc(t('resend')) + '</a>';
          $('link-resend').onclick = function (e2) {
            e2.preventDefault();
            cred.user.sendEmailVerification().then(function () { $('login-msg').textContent = t('verification_sent'); auth.signOut(); });
          };
          return;
        }
      }).catch(function (e) { release(); $('login-msg').textContent = authError(e); });
    }
  });
  if ($('form-guest')) {
    $('form-guest').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = $('in-guest').value.trim() || 'Guest';
      local('guestName', n);
      socket.emit('hello', { guest: true, name: n, guestId: guestId() });
    });
  }

  function renderAccount() {
    var el = $('account');
    if (!me) { el.innerHTML = ''; return; }
    el.innerHTML = '<span class="me">' + esc(me.name) + '</span><button class="btn btn-small" id="btn-logout" type="button">' + esc(t('sign_out')) + '</button>';
    $('btn-logout').onclick = function () {
      if (room) socket.emit('leave_room');
      local('guestName', null); local('displayName', null); store('room', null);
      me = null; room = null; renderAccount(); show('login');
      if (fbReady) firebase.auth().signOut();
      socket.disconnect(); socket.connect();
    };
  }

  // ---------------- home ----------------
  function renderHome() {
    if (!me) return;
    $('home-name').textContent = me.name;
    $('home-stats').innerHTML = stats
      ? '<div><b>' + stats.games + '</b><span>' + esc(t('games')) + '</span></div><div><b>' + stats.wins + '</b><span>' + esc(t('wins')) + '</span></div><div><b>' + stats.correct + '</b><span>' + esc(t('correct')) + '</span></div>'
      : '<p class="small muted">' + esc(t('guest_stats')) + '</p>';
    fillSelect($('sel-qlang'), langItems(), $('sel-qlang').value || local('lastQlang') || 'ja');
    fillSelect($('sel-cat'), catItems(), $('sel-cat').value || local('lastCat') || 'mix');
    fillSelect($('sel-count'), countItems(), $('sel-count').value || local('lastCount') || 10);
  }
  $('btn-create').addEventListener('click', function () {
    local('lastQlang', $('sel-qlang').value); local('lastCat', $('sel-cat').value); local('lastCount', $('sel-count').value);
    socket.emit('create_room', { lang: $('sel-qlang').value, category: $('sel-cat').value, count: Number($('sel-count').value) });
  });
  $('form-join').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var code = $('in-code').value.trim().toUpperCase();
    $('join-msg').textContent = ''; $('in-code').removeAttribute('aria-invalid');
    if (code.length < 5) { $('join-msg').textContent = t('enter_code'); $('in-code').setAttribute('aria-invalid', 'true'); $('in-code').focus(); return; }
    socket.emit('join_room', { code: code });
  });
  $('in-code').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  // change display name
  $('btn-edit-name').addEventListener('click', function () {
    $('name-view').hidden = true; $('name-edit').hidden = false;
    $('in-newname').setAttribute('aria-label', t('display_name'));
    $('in-newname').value = me ? me.name : ''; $('in-newname').focus();
  });
  $('btn-name-cancel').addEventListener('click', function () { $('name-view').hidden = false; $('name-edit').hidden = true; });
  $('name-edit').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = $('in-newname').value.trim().slice(0, 16);
    if (!n) { toast(t('choose_name')); return; }
    if (me && me.guest) local('guestName', n);
    socket.emit('set_name', { name: n });
  });

  // ---------------- lobby ----------------
  $('btn-copy').addEventListener('click', function () {
    var url = location.origin + '/?room=' + room.code;
    if (navigator.share && /Mobi/.test(navigator.userAgent)) {
      navigator.share({ title: 'おまえばか?', text: t('share_text', { c: room.code }), url: url }).catch(function () {});
      return;
    }
    navigator.clipboard.writeText(url).then(function () { toast(t('copied')); }, function () { toast(url); });
  });
  $('lobby-qlang').addEventListener('change', function () { socket.emit('settings', { lang: this.value }); });
  $('lobby-cat').addEventListener('change', function () { socket.emit('settings', { category: this.value }); });
  $('lobby-count-sel').addEventListener('change', function () { socket.emit('settings', { count: Number(this.value) }); });
  $('btn-start').addEventListener('click', function () { socket.emit('start'); });
  $('btn-again').addEventListener('click', function () { socket.emit('start'); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-leave]'), function (b) {
    b.addEventListener('click', function () { socket.emit('leave_room'); });
  });

  // ---------------- game ----------------
  $('btn-buzz').addEventListener('click', buzz);
  function buzz() {
    if (!room || room.phase !== 'reading' || !me || room.locked.indexOf(me.uid) >= 0) return;
    socket.emit('buzz');
  }
  document.addEventListener('keydown', function (e) {
    if (!room || $('screen-game').hidden) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); buzz(); return; }
    var n = Number(e.key);
    if (n >= 1 && n <= 4 && options[n - 1] && !e.repeat) pick(options[n - 1]);
    else if (/^[a-z]$/i.test(e.key) && options.indexOf(e.key.toUpperCase()) >= 0) pick(e.key.toUpperCase());
  });
  // Keep the four buttons on screen while waiting for the next letters.
  // Removing them made the layout jump, which looked like the screen flashing.
  var pickPending = false;
  function pick(ch) {
    if (pickPending) return;
    pickPending = true;
    socket.emit('pick', { ch: ch });
    Array.prototype.forEach.call($('g-options').querySelectorAll('.opt'), function (b) { b.disabled = true; });
  }

  function nameTag(p) {
    return esc(p.name) + (me && p.uid === me.uid ? ' <span class="tag tag-me">' + esc(t('you')) + '</span>' : '');
  }

  function render() {
    if (!room) return;
    var isHost = me && room.host === me.uid;
    if (room.phase === 'lobby') {
      show('lobby');
      $('lobby-code').textContent = room.code;
      $('lobby-count').textContent = room.players.length + ' / 8';
      $('lobby-players').innerHTML = room.players.map(function (p) {
        return '<li>' + nameTag(p) + (p.uid === room.host ? ' <span class="tag">' + esc(t('host')) + '</span>' : '') + '</li>';
      }).join('');
      fillSelect($('lobby-qlang'), langItems(), room.settings.lang);
      fillSelect($('lobby-cat'), catItems(), room.settings.category);
      fillSelect($('lobby-count-sel'), countItems(), room.settings.count);
      $('lobby-qlang').disabled = $('lobby-cat').disabled = $('lobby-count-sel').disabled = !isHost;
      $('btn-start').hidden = !isHost;
      $('lobby-wait').hidden = isHost;
      return;
    }
    if (room.phase === 'finished') {
      show('result');
      $('r-ranking').innerHTML = (room.ranking || []).map(function (p, i) {
        return '<li class="' + (i === 0 ? 'first' : '') + '"><span class="rank">' + (i + 1) + '</span><span class="nm">' + nameTag(p) + '</span><span class="pt">' + p.score + '</span></li>';
      }).join('');
      $('btn-again').hidden = !isHost;
      $('r-wait').hidden = isHost;
      return;
    }
    show('game');
    $('g-progress').textContent = room.index >= 0 ? t('progress', { n: room.index + 1, t: room.total }) : t('get_ready');
    $('g-category').textContent = room.cat ? t('cat_' + room.cat) : '';
    $('g-category').hidden = !room.cat;
    var cd = $('g-countdown');
    cd.hidden = room.phase !== 'countdown' && room.phase !== 'intro';
    cd.classList.toggle('intro', room.phase === 'intro');
    if (room.phase === 'intro') cd.textContent = t('q_num', { n: room.index + 1 });
    var qt = $('g-text');
    if (room.phase === 'countdown' || room.phase === 'intro') qt.textContent = '';
    if (room.text !== undefined) qt.textContent = room.text + (room.complete ? '' : (room.qlang === 'ja' ? '…' : ' …'));
    qt.lang = room.qlang || 'ja';

    // banner
    var ev = room.event, b = $('g-banner'), mine = !!(ev && me && ev.uid === me.uid);
    var n = ev && ev.name ? ev.name : '';
    var msg = '', cls = '';
    if (room.phase === 'answering') { msg = mine ? t('you_buzzed') : t('buzzed_in', { n: n }); cls = 'b-buzz'; }
    else if (room.phase === 'reveal') {
      if (ev && ev.type === 'correct') { msg = mine ? t('you_got_it') : t('got_it', { n: n }); cls = 'b-ok'; }
      else { msg = t('times_up'); cls = 'b-ng'; }
    } else if (room.phase === 'reading' && ev) {
      if (ev.type === 'wrong') msg = mine ? t('you_missed') : t('missed', { n: n });
      else if (ev.type === 'timeout') msg = mine ? t('you_ran_out') : t('ran_out', { n: n });
      else if (ev.type === 'left') msg = t('left', { n: n });
      if (msg) cls = 'b-ng';
    }
    b.textContent = msg; b.className = 'banner ' + cls;
    stampFor(room);

    // answer slots
    var m = $('g-mask');
    var chars = room.phase === 'reveal' ? Array.from(room.answer || '') : (room.phase === 'answering' ? room.mask : []);
    m.innerHTML = (chars || []).map(function (c) {
      if (c === ' ') return '<span class="gap"></span>';
      return '<span class="slot' + (c === '_' ? '' : ' filled') + '">' + (c === '_' ? '' : esc(c)) + '</span>';
    }).join('');
    m.className = 'mask' + (room.phase === 'reveal' ? ' reveal' : '');
    m.setAttribute('aria-label', room.phase === 'reveal' ? t('answer_label', { a: room.answer }) : (chars || []).join(''));

    // buzz button
    var locked = me && room.locked.indexOf(me.uid) >= 0;
    var bz = $('btn-buzz');
    bz.hidden = !(room.phase === 'reading' || room.phase === 'countdown' || room.phase === 'intro');
    bz.disabled = room.phase !== 'reading' || locked;
    bz.textContent = locked ? t('locked') : t('buzz');

    // scores
    $('g-scores').innerHTML = room.players.slice().sort(function (a, c) { return c.score - a.score; }).map(function (p) {
      var c = [];
      if (p.uid === room.buzzer) c.push('active');
      if (room.locked.indexOf(p.uid) >= 0) c.push('out');
      if (!p.connected) c.push('off');
      return '<li class="' + c.join(' ') + '"><span class="nm">' + nameTag(p) + (p.connected ? '' : ' <span class="muted small">(' + esc(t('offline')) + ')</span>') + '</span><span class="pt">' + p.score + '</span></li>';
    }).join('');
    if (room.phase !== 'answering') { options = []; pickPending = false; }
    renderOptions();
  }

  // one big stamp for each result: "おまえばか?" on a miss, "ピンポーン!" on a correct answer
  var lastStamp = '';
  function stampFor(r) {
    var ev = r.event, key = ev ? r.index + ':' + ev.type + ':' + (ev.uid || '') + ':' + r.locked.length : '';
    if (!ev || key === lastStamp) return;
    var text = '', cls = '';
    if (ev.type === 'correct') { text = t('stamp_ok'); cls = 'ok'; }
    else if (ev.type === 'wrong' || ev.type === 'timeout') { text = t('stamp_ng'); cls = 'ng'; }
    else if (ev.type === 'nobody') { text = t('stamp_none'); cls = 'none'; }
    if (!text) return;
    lastStamp = key;
    var el = $('g-stamp');
    el.textContent = text; el.className = 'stamp';
    void el.offsetWidth;            // restart the animation
    el.className = 'stamp show ' + cls;
    clearTimeout(stampFor._t); stampFor._t = setTimeout(function () { el.className = 'stamp'; }, 1400);
  }

  function renderOptions() {
    var box = $('g-options');
    if (!options.length) { box.innerHTML = ''; return; }
    var btns = box.querySelectorAll('.opt');
    if (btns.length !== options.length) {
      box.innerHTML = options.map(function (c, i) { return '<button type="button" class="opt"><small aria-hidden="true">' + (i + 1) + '</small><span></span></button>'; }).join('');
      btns = box.querySelectorAll('.opt');
      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener('click', function () { pick(btn.getAttribute('data-ch')); });
      });
    }
    // update the letters in place so the buttons never disappear
    options.forEach(function (c, i) {
      var b = btns[i];
      b.setAttribute('data-ch', c);
      b.setAttribute('aria-label', t('option_label', { i: i + 1, c: c }));
      b.querySelector('span').textContent = c;
      b.disabled = pickPending;
    });
  }

  // timers drawn locally between server updates
  function frame() {
    if (room && !$('screen-game').hidden) {
      var dt = (performance.now() - receivedAt) / 1000, bar = $('g-timer-bar'), wrap = $('g-timer');
      if (room.phase === 'answering' && room.answer_total) {
        wrap.style.visibility = 'visible'; bar.style.width = (100 * Math.max(0, room.answer_left - dt) / room.answer_total) + '%'; bar.className = 'warn';
      } else if (room.phase === 'reading' && room.buzz_left !== undefined) {
        wrap.style.visibility = 'visible'; bar.style.width = (100 * Math.max(0, room.buzz_left - dt) / 6) + '%'; bar.className = '';
      } else wrap.style.visibility = 'hidden';
      if (room.phase === 'countdown') $('g-countdown').textContent = Math.max(1, Math.ceil(room.remaining - dt));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // language switch re-draws dynamic parts
  I18N.onChange(function () { renderAuthMode(); renderAccount(); renderHome(); render(); });

  var q = new URLSearchParams(location.search).get('room');
  if (q) $('in-code').value = q.toUpperCase();
})();
