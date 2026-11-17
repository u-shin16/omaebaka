'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var CATS = [
    ['mix', 'Mix (all categories)'], ['general', 'General Knowledge'], ['history', 'History'],
    ['geography', 'Geography'], ['music', 'Music'], ['it', 'IT']
  ];
  var COUNTS = [5, 10, 15, 20];

  var me = null;            // {uid, name, guest}
  var room = null;          // latest public room state
  var options = [];         // my letter options while answering
  var receivedAt = 0;
  var authMode = 'login';   // or 'register'
  var fbReady = false;

  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function local(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function show(name) {
    ['login', 'home', 'lobby', 'game', 'result'].forEach(function (s) { $('screen-' + s).hidden = (s !== name); });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fillSelect(sel, items, value) {
    sel.innerHTML = items.map(function (it) {
      var v = Array.isArray(it) ? it[0] : it, l = Array.isArray(it) ? it[1] : it;
      return '<option value="' + v + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + l + '</option>';
    }).join('');
  }

  // ---------------- socket ----------------
  var socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', function () { hello(); });
  socket.on('welcome', function (d) {
    me = d.user;
    renderAccount();
    $('home-name').textContent = me.name;
    var st = d.stats;
    $('home-stats').innerHTML = st
      ? '<div><b>' + st.games + '</b><span>games</span></div><div><b>' + st.wins + '</b><span>wins</span></div><div><b>' + st.correct + '</b><span>correct</span></div>'
      : '<p class="small muted">Guest stats are not saved.</p>';
    var want = (new URLSearchParams(location.search).get('room') || store('room') || '').toUpperCase();
    if (want) socket.emit('join_room', { code: want });
    else if (!room) show('home');
  });
  socket.on('auth_failed', function (d) {
    me = null; renderAccount(); show('login');
    if (d && d.message && fbReady && firebase.auth().currentUser) $('login-msg').textContent = d.message;
  });
  socket.on('error_msg', function (d) {
    toast(d.message);
    if (/not found/i.test(d.message)) { store('room', null); clearRoomParam(); if (!room) show('home'); }
  });
  socket.on('left', function () { room = null; store('room', null); clearRoomParam(); show('home'); });
  socket.on('room', function (s) { room = s; receivedAt = performance.now(); store('room', s.code); render(); });
  socket.on('private', function (p) { options = p.options || []; renderOptions(); });
  socket.on('disconnect', function () { toast('Connection lost. Reconnecting…'); });

  function clearRoomParam() {
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  function hello() {
    if (fbReady && firebase.auth().currentUser) {
      var u = firebase.auth().currentUser;
      u.getIdToken().then(function (token) {
        socket.emit('hello', { token: token, name: local('displayName') || u.displayName || '' });
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
  function firebaseConfigured() {
    return typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey;
  }
  if (firebaseConfigured()) {
    firebase.initializeApp(FIREBASE_CONFIG);
    fbReady = true;
    firebase.auth().onAuthStateChanged(function (u) {
      if (u && !u.emailVerified && !u.providerData.some(function (p) { return p.providerId === 'google.com'; })) {
        return; // waiting for email verification
      }
      if (u) { if (socket.connected) hello(); }
      else if (!local('guestName')) { me = null; renderAccount(); show('login'); }
    });
  } else {
    $('btn-google').disabled = true;
    $('btn-email').disabled = true;
  }

  function authError(e) {
    var map = {
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found': 'No account with that email.',
      'auth/email-already-in-use': 'That email is already registered. Try signing in.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'That email address looks wrong.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled.',
      'auth/too-many-requests': 'Too many attempts. Please wait a moment.'
    };
    return map[e && e.code] || (e && e.message) || 'Something went wrong.';
  }

  $('btn-google').addEventListener('click', function () {
    if (!fbReady) return;
    $('login-msg').textContent = '';
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(function (e) { $('login-msg').textContent = authError(e); });
  });

  $('link-toggle').addEventListener('click', function (ev) {
    ev.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    $('row-name').hidden = authMode !== 'register';
    $('btn-email').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    $('in-pass').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    this.textContent = authMode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in';
    $('login-msg').textContent = '';
  });

  $('link-reset').addEventListener('click', function (ev) {
    ev.preventDefault();
    var email = $('in-email').value.trim();
    if (!email) { $('login-msg').textContent = 'Enter your email above first.'; return; }
    if (!fbReady) return;
    firebase.auth().sendPasswordResetEmail(email)
      .then(function () { $('login-msg').textContent = 'Password reset email sent.'; })
      .catch(function (e) { $('login-msg').textContent = authError(e); });
  });

  $('form-email').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!fbReady) return;
    var email = $('in-email').value.trim(), pass = $('in-pass').value, auth = firebase.auth();
    $('login-msg').textContent = '';
    if (authMode === 'register') {
      var name = $('in-regname').value.trim();
      if (!name) { $('login-msg').textContent = 'Please choose a display name.'; return; }
      auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
        local('displayName', name);
        return cred.user.updateProfile({ displayName: name }).then(function () { return cred.user.sendEmailVerification(); });
      }).then(function () {
        $('login-msg').textContent = 'Check your inbox and click the link to verify your email, then sign in.';
        return auth.signOut();
      }).catch(function (e) { $('login-msg').textContent = authError(e); });
    } else {
      auth.signInWithEmailAndPassword(email, pass).then(function (cred) {
        if (!cred.user.emailVerified) {
          $('login-msg').innerHTML = 'Please verify your email first. <a href="#" id="link-resend">Resend email</a>';
          $('link-resend').onclick = function (e2) {
            e2.preventDefault();
            cred.user.sendEmailVerification().then(function () { $('login-msg').textContent = 'Verification email sent.'; auth.signOut(); });
          };
          return;
        }
        if (cred.user.displayName) local('displayName', cred.user.displayName);
      }).catch(function (e) { $('login-msg').textContent = authError(e); });
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
    el.innerHTML = '<span class="me">' + esc(me.name) + '</span><button class="btn btn-small" id="btn-logout" type="button">Sign out</button>';
    $('btn-logout').onclick = function () {
      if (room) socket.emit('leave_room');
      try { localStorage.removeItem('guestName'); localStorage.removeItem('displayName'); } catch (e) {}
      store('room', null);
      me = null; room = null; renderAccount(); show('login');
      if (fbReady) firebase.auth().signOut();
      socket.disconnect(); socket.connect();
    };
  }

  // ---------------- home ----------------
  fillSelect($('sel-cat'), CATS, local('lastCat') || 'mix');
  fillSelect($('sel-count'), COUNTS, local('lastCount') || 10);
  $('btn-create').addEventListener('click', function () {
    local('lastCat', $('sel-cat').value); local('lastCount', $('sel-count').value);
    socket.emit('create_room', { category: $('sel-cat').value, count: Number($('sel-count').value) });
  });
  $('form-join').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var code = $('in-code').value.trim().toUpperCase();
    if (code.length < 5) { toast('Enter the 5-character room code.'); return; }
    socket.emit('join_room', { code: code });
  });
  $('in-code').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  // ---------------- lobby ----------------
  $('btn-copy').addEventListener('click', function () {
    var url = location.origin + '/?room=' + room.code;
    if (navigator.share && /Mobi/.test(navigator.userAgent)) {
      navigator.share({ title: 'Omae Baka?', text: 'Join my quiz room: ' + room.code, url: url }).catch(function () {});
      return;
    }
    navigator.clipboard.writeText(url).then(function () { toast('Invite link copied!'); }, function () { toast(url); });
  });
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
    if (e.code === 'Space') { e.preventDefault(); buzz(); }
    var n = Number(e.key);
    if (n >= 1 && n <= 4 && options[n - 1]) pick(options[n - 1]);
    else if (/^[a-z0-9]$/i.test(e.key) && options.indexOf(e.key.toUpperCase()) >= 0) pick(e.key.toUpperCase());
  });
  function pick(ch) { socket.emit('pick', { ch: ch }); options = []; renderOptions(); }

  function render() {
    if (!room) return;
    var isHost = me && room.host === me.uid;
    if (room.phase === 'lobby') {
      show('lobby');
      $('lobby-code').textContent = room.code;
      $('lobby-count').textContent = '(' + room.players.length + '/8)';
      $('lobby-players').innerHTML = room.players.map(function (p) {
        return '<li>' + esc(p.name) + (p.uid === room.host ? ' <span class="tag">host</span>' : '') + (me && p.uid === me.uid ? ' <span class="tag tag-me">you</span>' : '') + '</li>';
      }).join('');
      fillSelect($('lobby-cat'), CATS, room.settings.category);
      fillSelect($('lobby-count-sel'), COUNTS, room.settings.count);
      $('lobby-cat').disabled = $('lobby-count-sel').disabled = !isHost;
      $('btn-start').hidden = !isHost;
      $('lobby-wait').hidden = isHost;
      return;
    }
    if (room.phase === 'finished') {
      show('result');
      $('r-ranking').innerHTML = (room.ranking || []).map(function (p, i) {
        return '<li class="' + (i === 0 ? 'first' : '') + '"><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(p.name) + (me && p.uid === me.uid ? ' <span class="tag tag-me">you</span>' : '') + '</span><span class="pt">' + p.score + '</span></li>';
      }).join('');
      $('btn-again').hidden = !isHost;
      $('r-wait').hidden = isHost;
      return;
    }
    show('game');
    $('g-progress').textContent = room.index >= 0 ? 'Q' + (room.index + 1) + ' / ' + room.total : 'Get ready';
    $('g-category').textContent = room.category || '';
    $('g-category').hidden = !room.category;
    var cd = $('g-countdown');
    if (room.phase === 'countdown') {
      cd.hidden = false; $('g-text').textContent = '';
    } else cd.hidden = true;
    if (room.text !== undefined) $('g-text').textContent = room.text + (room.complete ? '' : ' …');

    // banner
    var ev = room.event, b = $('g-banner'), mine = ev && me && ev.uid === me.uid;
    var who = ev && ev.name ? (mine ? 'You' : esc(ev.name)) : '';
    var html = '', cls = '';
    if (room.phase === 'answering') { html = who + (mine ? ' buzzed! Spell the answer.' : ' buzzed in…'); cls = 'b-buzz'; }
    else if (room.phase === 'reveal') {
      if (ev && ev.type === 'correct') { html = who + ' got it! +10'; cls = 'b-ok'; }
      else { html = 'Time\'s up!'; cls = 'b-ng'; }
    } else if (room.phase === 'reading' && ev && (ev.type === 'wrong' || ev.type === 'timeout' || ev.type === 'left')) {
      html = who + (ev.type === 'timeout' ? ' ran out of time. −5' : ev.type === 'left' ? ' left.' : ' missed! −5'); cls = 'b-ng';
    }
    b.innerHTML = html; b.className = 'banner ' + cls;

    // answer mask
    var m = $('g-mask');
    var word = room.phase === 'reveal' ? room.answer : (room.phase === 'answering' ? room.mask : '');
    m.innerHTML = word ? word.split('').map(function (c) {
      if (c === ' ') return '<span class="gap"></span>';
      return '<span class="slot' + (c === '_' ? '' : ' filled') + '">' + (c === '_' ? '' : esc(c)) + '</span>';
    }).join('') : '';
    m.className = 'mask' + (room.phase === 'reveal' ? ' reveal' : '');

    // buzz button
    var locked = me && room.locked.indexOf(me.uid) >= 0;
    var bz = $('btn-buzz');
    bz.hidden = !(room.phase === 'reading' || room.phase === 'countdown');
    bz.disabled = room.phase !== 'reading' || locked;
    bz.textContent = locked ? 'LOCKED' : 'BUZZ';

    // scores
    $('g-scores').innerHTML = room.players.slice().sort(function (a, c) { return c.score - a.score; }).map(function (p) {
      var c = [];
      if (p.uid === room.buzzer) c.push('active');
      if (room.locked.indexOf(p.uid) >= 0) c.push('out');
      if (!p.connected) c.push('off');
      return '<li class="' + c.join(' ') + '"><span class="nm">' + esc(p.name) + (me && p.uid === me.uid ? ' <span class="tag tag-me">you</span>' : '') + '</span><span class="pt">' + p.score + '</span></li>';
    }).join('');
    if (room.phase !== 'answering') { options = []; }
    renderOptions();
  }

  function renderOptions() {
    var box = $('g-options');
    if (!options.length) { box.innerHTML = ''; return; }
    box.innerHTML = options.map(function (c, i) { return '<button type="button" class="opt" data-ch="' + c + '"><small>' + (i + 1) + '</small>' + c + '</button>'; }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.opt'), function (btn) {
      btn.addEventListener('click', function () { pick(btn.getAttribute('data-ch')); });
    });
  }

  // timers drawn locally between server updates
  function frame() {
    if (room && !$('screen-game').hidden) {
      var dt = (performance.now() - receivedAt) / 1000, bar = $('g-timer-bar'), wrap = $('g-timer');
      if (room.phase === 'answering' && room.answer_total) {
        var left = Math.max(0, room.answer_left - dt);
        wrap.hidden = false; bar.style.width = (100 * left / room.answer_total) + '%'; bar.className = 'warn';
      } else if (room.phase === 'reading' && room.buzz_left !== undefined) {
        var l2 = Math.max(0, room.buzz_left - dt);
        wrap.hidden = false; bar.style.width = (100 * l2 / 6) + '%'; bar.className = '';
      } else wrap.hidden = true;
      if (room.phase === 'countdown') $('g-countdown').textContent = Math.max(1, Math.ceil(room.remaining - dt));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // join link prefill
  var q = new URLSearchParams(location.search).get('room');
  if (q) $('in-code').value = q.toUpperCase();
})();
