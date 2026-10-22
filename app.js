(() => {
  'use strict';

  const APP_VERSION = 'v8';
  const API = 'https://api.put.io/v2';
  const KEY_TOKEN = 'resume.token';
  const KEY_PENDING = 'resume.pending';
  const KEY_AUTOPLAY = 'resume.autoplay';
  const SAVE_EVERY_MS = 10000;
  const MIN_SAVE_SECONDS = 5;

  const $ = (s) => document.querySelector(s);
  const el = {
    title: $('#title'), back: $('#back'), signout: $('#signout'),
    login: $('#login'), loginForm: $('#login-form'), tokenInput: $('#token-input'), loginMsg: $('#login-msg'),
    browser: $('#browser'), crumbs: $('#crumbs'), list: $('#list'),
    player: $('#player'), video: $('#video'), ptitle: $('#ptitle'),
    restart: $('#restart'), download: $('#download'), mp4: $('#mp4'), vlc: $('#vlc'), status: $('#status'),
    autoplay: $('#autoplay'),
    subs: $('#subs'), subsel: $('#subsel'), subdl: $('#subdl'),
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  let token = store.get(KEY_TOKEN);
  if ($('#ver')) $('#ver').textContent = APP_VERSION;
  // Auto-start playback when a file opens. On unless switched off; remembered per device.
  el.autoplay.checked = store.get(KEY_AUTOPLAY) !== 'off';
  el.autoplay.addEventListener('change', () => store.set(KEY_AUTOPLAY, el.autoplay.checked ? 'on' : 'off'));
  let pending = {};
  try { pending = JSON.parse(store.get(KEY_PENDING) || '{}') || {}; } catch (e) { pending = {}; }

  let stack = [{ id: 0, name: 'Files' }];
  let files = [];
  let current = null;       // file open in the player
  let lastSaveAt = 0;
  let lastSavedSecs = -1;
  let playerOpen = false;

  /* ---------- helpers ---------- */
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function fmtSize(b) {
    if (!b) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
  }
  function kindLabel(t) {
    return ({ FOLDER: 'DIR', VIDEO: 'VID', AUDIO: 'AUD', IMAGE: 'IMG', PDF: 'PDF', TEXT: 'TXT', ARCHIVE: 'ZIP' })[t] || 'FILE';
  }
  const isPlayable = (f) => f.file_type === 'VIDEO' || f.file_type === 'AUDIO';
  function savePending() { store.set(KEY_PENDING, JSON.stringify(pending)); }
  function setStatus(msg, cls) { el.status.textContent = msg; el.status.className = 'status' + (cls ? ' ' + cls : ''); }
  function show(view) {
    el.login.hidden = view !== 'login';
    el.browser.hidden = view !== 'browser';
    el.player.hidden = view !== 'player';
    el.signout.hidden = view === 'login';
    el.back.hidden = view !== 'player' && stack.length < 2;
  }

  /* ---------- put.io API ---------- */
  async function api(path, opts = {}) {
    const { method = 'GET', params = {}, keepalive = false } = opts;
    const url = new URL(API + path);
    url.searchParams.set('oauth_token', token);
    const init = { method, keepalive };
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    } else {
      init.body = new URLSearchParams(params);
    }
    let res = await fetch(url, init);
    if (res.status === 401 || res.status === 403) {
      // Retry once with the token in an Authorization header instead of the URL.
      url.searchParams.delete('oauth_token');
      res = await fetch(url, { ...init, headers: { Authorization: 'token ' + token } });
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Token rejected'); e.auth = true; e.status = res.status; throw e;
    }
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : null;
  }

  // Position endpoints. If put.io ever changes these, this is the only place to edit.
  const position = {
    set: (id, secs, keepalive) => api(`/files/${id}/start-from`, { method: 'POST', params: { time: secs }, keepalive }),
    reset: (id, keepalive) => api(`/files/${id}/start-from/delete`, { method: 'POST', keepalive }),
  };

  async function pushPosition(id, secs, keepalive) {
    secs = Math.floor(secs);
    try {
      await position.set(id, secs, keepalive);
      delete pending[id]; savePending();
      lastSavedSecs = secs;
      if (current && current.id === id) {
        current.start_from = secs;
        setStatus(`Saved at ${fmtTime(secs)}`);
      }
      return true;
    } catch (e) {
      if (e.auth) { logout('Your token was rejected. Connect again.'); return false; }
      pending[id] = secs; savePending();
      if (current && current.id === id) setStatus(`Not synced yet (${e.message}). Will retry.`, 'warn');
      return false;
    }
  }

  async function flushPending() {
    if (!token) return;
    for (const [id, secs] of Object.entries(pending)) {
      if (current && String(current.id) === id) continue;
      await pushPosition(Number(id), secs, false);
    }
  }

  // Original file, served by put.io as an attachment, so an MKV stays an MKV.
  function dlUrl(f) {
    const u = new URL(`${API}/files/${f.id}/download`);
    u.searchParams.set('oauth_token', token);
    return u.toString();
  }

  /* ---------- browsing ---------- */
  async function loadFolder(id) {
    el.list.innerHTML = '<div class="empty">Loading&hellip;</div>';
    try {
      const r = await api('/files/list', { params: { parent_id: id, per_page: 1000 } });
      files = (r.files || []).slice().sort((a, b) => {
        const fa = a.file_type === 'FOLDER' ? 0 : 1, fb = b.file_type === 'FOLDER' ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      renderList();
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      el.list.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'empty err'; d.textContent = `Could not load this folder (${e.message}).`;
      el.list.appendChild(d);
    }
  }

  function renderCrumbs() {
    el.crumbs.innerHTML = '';
    stack.forEach((c, i) => {
      if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; el.crumbs.appendChild(s); }
      if (i === stack.length - 1) {
        const h = document.createElement('span'); h.className = 'here'; h.textContent = c.name; el.crumbs.appendChild(h);
      } else {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.dataset.depth = String(i + 1);
        el.crumbs.appendChild(b);
      }
    });
    el.title.textContent = stack.length > 1 ? stack[stack.length - 1].name : '';
    el.back.hidden = stack.length < 2;
  }

  function renderList() {
    renderCrumbs();
    el.list.innerHTML = '';
    if (!files.length) {
      const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'This folder is empty.';
      el.list.appendChild(d); return;
    }
    files.forEach((f, i) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'row'; row.dataset.index = String(i);
      const k = document.createElement('span'); k.className = 'kind' + (f.file_type === 'VIDEO' ? ' vid' : ''); k.textContent = kindLabel(f.file_type);
      const n = document.createElement('span'); n.className = 'name'; n.textContent = f.name;
      const m = document.createElement('span'); m.className = 'meta';
      m.textContent = f.file_type === 'FOLDER' ? '' : fmtSize(f.size);
      const pos = pending[f.id] != null ? pending[f.id] : f.start_from;
      if (isPlayable(f) && pos > 0) {
        const r = document.createElement('span'); r.className = 'resume'; r.textContent = 'at ' + fmtTime(pos); m.prepend(r);
      }
      row.append(k, n, m);
      if (f.file_type !== 'FOLDER') {
        const d = document.createElement('span');
        d.className = 'dl'; d.setAttribute('role', 'button'); d.tabIndex = 0;
        d.setAttribute('aria-label', 'Download ' + f.name); d.title = 'Download original file';
        d.textContent = '↓';
        const x = document.createElement('span');
        x.className = 'del'; x.setAttribute('role', 'button'); x.tabIndex = 0;
        x.setAttribute('aria-label', 'Delete ' + f.name); x.title = 'Delete from put.io';
        x.textContent = '✕';
        row.append(d, x);
      }
      el.list.appendChild(row);
    });
  }

  function enterFolder(f) {
    stack.push({ id: f.id, name: f.name });
    history.pushState({ d: stack.length }, '');
    loadFolder(f.id);
    renderCrumbs();
  }

  /* ---------- player ---------- */
  async function openFile(f) {
    current = f;
    lastSaveAt = 0; lastSavedSecs = -1;
    playerOpen = true;
    history.pushState({ d: stack.length, p: 1 }, '');
    show('player');
    el.title.textContent = 'Now playing';
    el.ptitle.textContent = f.name;
    el.mp4.hidden = true;
    destroyHls();
    clearSubtitles();
    setStatus('Loading…');

    let start = pending[f.id] != null ? pending[f.id] : (f.start_from || 0);
    try {
      const fresh = await api(`/files/${f.id}`);
      if (fresh && fresh.file && pending[f.id] == null) start = fresh.file.start_from || 0;
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
    }
    f.start_from = start;

    try {
      const r = await api(`/files/${f.id}/url`);
      f.direct = r.url;
      el.download.href = dlUrl(f);
      el.vlc.hidden = !/Android/i.test(navigator.userAgent);
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      setStatus(`Could not get a stream link (${e.message}).`, 'bad');
      return;
    }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const native = ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'].includes(ext);
    const mp4 = f.is_mp4_available ? ['mp4'] : [];
    // Audio always tries the original file first; put.io's MP4 conversion is video-only.
    kinds = (native || f.file_type === 'AUDIO') ? ['direct', ...mp4, 'hls'] : [...mp4, 'hls', 'direct'];
    playKind(0, start > MIN_SAVE_SECONDS ? `Resuming at ${fmtTime(start)}` : 'Ready');
    if (f.file_type === 'VIDEO') loadSubtitles(f);
  }

  /* ---------- subtitles ---------- */
  // put.io lists subtitles per file and serves them as WebVTT. They're fetched here
  // and attached as blob: tracks, so the video's own CC menu can turn them on.
  let subUrls = [];
  let subList = [];   // [{ key, label, track }] for the open file
  function clearSubtitles() {
    el.video.querySelectorAll('track').forEach((t) => t.remove());
    subUrls.forEach((u) => URL.revokeObjectURL(u)); subUrls = [];
    subList = []; el.subsel.innerHTML = ''; el.subs.hidden = true;
  }
  function subUrl(f, key, format) {
    const u = new URL(`${API}/files/${f.id}/subtitles/${encodeURIComponent(key)}`);
    u.searchParams.set('format', format);
    u.searchParams.set('oauth_token', token);
    return u.toString();
  }
  // The subtitle the picker points at; it follows whatever is switched on in the player.
  function chosenSub() {
    const showing = subList.find((s) => s.track && s.track.track.mode === 'showing');
    return showing || subList[Number(el.subsel.value)] || null;
  }
  async function fetchText(url) {
    let res = await fetch(url);
    if (res.status === 401 || res.status === 403) {
      const u = new URL(url); u.searchParams.delete('oauth_token');
      res = await fetch(u, { headers: { Authorization: 'token ' + token } });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }
  async function loadSubtitles(f) {
    clearSubtitles();
    let list = [];
    try { list = ((await api(`/files/${f.id}/subtitles`)) || {}).subtitles || []; } catch (e) { return; }
    for (const s of list) {
      if (!current || current.id !== f.id) return; // moved on to another file
      try {
        const vtt = await fetchText(subUrl(f, s.key, 'webvtt'));
        const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        subUrls.push(blobUrl);
        const t = document.createElement('track');
        t.kind = 'subtitles'; t.src = blobUrl;
        t.label = s.name || s.language || 'Subtitles';
        if (s.language_code && /^[a-z]{2,3}$/i.test(s.language_code)) t.srclang = s.language_code;
        el.video.appendChild(t);
        const idx = subList.push({ key: s.key, label: t.label, track: t }) - 1;
        const o = document.createElement('option'); o.value = String(idx); o.textContent = t.label;
        el.subsel.appendChild(o);
        el.subs.hidden = false;
      } catch (e) { /* skip this track */ }
    }
  }
  el.video.textTracks.addEventListener('change', () => {
    const i = subList.findIndex((s) => s.track && s.track.track.mode === 'showing');
    if (i >= 0) el.subsel.value = String(i);
  });
  el.subdl.addEventListener('click', async () => {
    const s = chosenSub(); if (!current || !s) return;
    try {
      const srt = await fetchText(subUrl(current, s.key, 'srt'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([srt], { type: 'application/x-subrip' }));
      const base = current.name.replace(/\.[^.]+$/, '');
      const lang = (s.track && s.track.srclang) ? '.' + s.track.srclang : '';
      a.download = `${base}${lang}.srt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { setStatus(`Could not download the subtitles (${e.message}).`, 'warn'); }
  });

  /* ---------- formats: direct file, put.io MP4 conversion, or HLS stream ---------- */
  let hls = null, kinds = [], kindIdx = 0;
  const KIND_LABEL = { direct: 'original file', mp4: 'put.io MP4', hls: 'put.io stream' };
  function destroyHls() { if (hls) { hls.destroy(); hls = null; } }
  function srcFor(kind) {
    if (kind === 'direct') return current.direct;
    const u = new URL(`${API}/files/${current.id}/${kind === 'mp4' ? 'mp4/stream' : 'hls/media.m3u8'}`);
    u.searchParams.set('oauth_token', token);
    return u.toString();
  }
  function playKind(i, note) {
    if (!current) return;
    kindIdx = i; const kind = kinds[i];
    const v = el.video, src = srcFor(kind);
    // Keep playing across a format switch even when auto-start is off.
    const wasPlaying = !v.paused && !v.ended;
    destroyHls();
    if (kind === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
      if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls();
        hls.on(window.Hls.Events.ERROR, (ev, d) => { if (d && d.fatal) nextKind('The stream failed'); });
        hls.loadSource(src);
        hls.attachMedia(v);
      } else { nextKind('This browser cannot play the stream'); return; }
    } else {
      v.src = src;
    }
    el.mp4.hidden = kinds.length < 2;
    el.mp4.textContent = `Format: ${KIND_LABEL[kind]}. Switch`;
    if (el.autoplay.checked || wasPlaying) {
      setStatus(`${note ? note + '. ' : ''}Playing ${KIND_LABEL[kind]}`);
      v.play().catch(() => { /* needs a tap */ });
    } else {
      setStatus(`${note ? note + '. ' : ''}Ready: ${KIND_LABEL[kind]}. Press play to start`);
    }
  }
  function nextKind(why) {
    if (kindIdx + 1 < kinds.length) {
      const t = el.video.currentTime;
      if (t > MIN_SAVE_SECONDS) current.start_from = Math.floor(t);
      playKind(kindIdx + 1, `${why}, trying ${KIND_LABEL[kinds[kindIdx + 1]]}`);
    } else {
      setStatus(`${why}. No other format is available for this file.`, 'bad');
    }
  }
  el.video.addEventListener('error', () => { if (current && playerOpen) nextKind('Could not play this format'); });

  el.video.addEventListener('loadedmetadata', () => {
    if (!current) return;
    const s = current.start_from || 0, d = el.video.duration;
    if (s > MIN_SAVE_SECONDS && (!isFinite(d) || s < d - 10)) el.video.currentTime = s;
  });

  el.video.addEventListener('timeupdate', () => {
    if (!current || el.video.seeking) return;
    const now = Date.now();
    if (now - lastSaveAt >= SAVE_EVERY_MS && el.video.currentTime >= MIN_SAVE_SECONDS) {
      lastSaveAt = now;
      pushPosition(current.id, el.video.currentTime, false);
    }
  });

  function saveNow(keepalive) {
    if (!current || !playerOpen) return Promise.resolve();
    const t = el.video.currentTime;
    if (t < MIN_SAVE_SECONDS || Math.floor(t) === lastSavedSecs) return Promise.resolve();
    lastSaveAt = Date.now();
    return pushPosition(current.id, t, keepalive);
  }

  el.video.addEventListener('pause', () => { if (!el.video.ended) saveNow(false); });
  el.video.addEventListener('ended', async () => {
    if (!current) return;
    const id = current.id;
    try { await position.reset(id, false); } catch (e) { /* leave saved position */ }
    delete pending[id]; savePending();
    current.start_from = 0; lastSavedSecs = -1;
    setStatus('Finished. Position cleared.');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(true); });
  window.addEventListener('pagehide', () => saveNow(true));
  window.addEventListener('online', flushPending);

  el.restart.addEventListener('click', async () => {
    if (!current) return;
    el.video.currentTime = 0; el.video.play().catch(() => {});
    try { await position.reset(current.id, false); current.start_from = 0; lastSavedSecs = -1; setStatus('Started over. Saved position cleared.'); }
    catch (e) { setStatus(`Could not clear the saved position (${e.message}).`, 'warn'); }
  });

  // Hand the original file to VLC for Android. VLC does not report its position back,
  // so this saves where you are first and the next resume starts from there.
  el.vlc.addEventListener('click', async () => {
    if (!current || !current.direct) return;
    const t = Math.floor(el.video.currentTime || 0);
    const startSecs = t > MIN_SAVE_SECONDS ? t : (current.start_from || 0);
    await saveNow(false);
    el.video.pause();
    const u = new URL(current.direct);
    const intent = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.slice(0, -1)};` +
      `package=org.videolan.vlc;type=video/*;l.position=${startSecs * 1000};` +
      `S.title=${encodeURIComponent(current.name)};` +
      (chosenSub() ? `S.subtitles_location=${encodeURIComponent(subUrl(current, chosenSub().key, 'srt'))};` : '') +
      'end';
    setStatus('Opening VLC. If nothing happens, VLC may not be installed.');
    location.href = intent;
  });

  el.mp4.addEventListener('click', () => {
    if (!current || kinds.length < 2) return;
    const t = el.video.currentTime;
    if (t > MIN_SAVE_SECONDS) current.start_from = Math.floor(t);
    playKind((kindIdx + 1) % kinds.length, 'Switched format');
  });

  async function closePlayer() {
    if (!playerOpen) return;
    await saveNow(false);
    el.video.pause(); destroyHls(); clearSubtitles();
    el.video.removeAttribute('src'); el.video.load();
    const f = files.find((x) => current && x.id === current.id);
    if (f && current) f.start_from = current.start_from;
    playerOpen = false; current = null;
    show('browser'); renderList();
  }

  /* ---------- navigation and auth ---------- */
  function startDownload(f) {
    const a = document.createElement('a');
    a.href = dlUrl(f); a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function deleteFile(f) {
    if (!confirm(`Delete "${f.name}" from put.io?`)) return;
    try {
      await api('/files/delete', { method: 'POST', params: { file_ids: String(f.id) } });
      delete pending[f.id]; savePending();
      files = files.filter((x) => x.id !== f.id);
      renderList();
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      alert(`Could not delete "${f.name}" (${e.message}).`);
    }
  }
  el.list.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && (e.target.classList.contains('dl') || e.target.classList.contains('del'))) {
      e.preventDefault(); e.stopPropagation();
      const f = files[Number(e.target.closest('.row').dataset.index)]; if (!f) return;
      if (e.target.classList.contains('del')) deleteFile(f); else startDownload(f);
    }
  });
  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.row'); if (!row) return;
    const f = files[Number(row.dataset.index)]; if (!f) return;
    if (e.target.closest('.dl')) { e.stopPropagation(); startDownload(f); return; }
    if (e.target.closest('.del')) { e.stopPropagation(); deleteFile(f); return; }
    if (f.file_type === 'FOLDER') enterFolder(f);
    else if (isPlayable(f)) openFile(f);
    else api(`/files/${f.id}/url`).then((r) => { window.open(r.url, '_blank', 'noopener'); }).catch(() => {});
  });

  el.crumbs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-depth]'); if (!b) return;
    const depth = Number(b.dataset.depth);
    stack.length = depth;
    history.pushState({ d: stack.length }, '');
    loadFolder(stack[depth - 1].id); renderCrumbs();
  });

  el.back.addEventListener('click', () => history.back());

  window.addEventListener('popstate', (e) => {
    if (!token) return;
    if (playerOpen && !(e.state && e.state.p)) { closePlayer(); return; }
    const target = (e.state && e.state.d) || 1;
    if (target !== stack.length) { stack.length = Math.max(1, Math.min(target, stack.length)); loadFolder(stack[stack.length - 1].id); renderCrumbs(); }
  });

  function logout(msg) {
    token = null; store.del(KEY_TOKEN);
    if (playerOpen) { el.video.pause(); el.video.removeAttribute('src'); el.video.load(); playerOpen = false; current = null; }
    stack = [{ id: 0, name: 'Files' }];
    el.title.textContent = '';
    el.loginMsg.textContent = msg || '';
    show('login');
  }
  el.signout.addEventListener('click', () => logout(''));

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.loginMsg.textContent = '';
    const t = el.tokenInput.value.trim(); if (!t) return;
    token = t;
    try {
      await api('/account/info');
      store.set(KEY_TOKEN, token); el.tokenInput.value = '';
      start();
    } catch (err) {
      token = null;
      el.loginMsg.textContent = err.auth
        ? `put.io rejected that token (HTTP ${err.status}). Paste the OAuth token itself, not the app's client ID or client secret.`
        : `Could not reach put.io (${err.message}).`;
    }
  });

  function start() {
    show('browser');
    history.replaceState({ d: 1 }, '');
    loadFolder(stack[stack.length - 1].id); renderCrumbs();
    flushPending();
  }

  if ('serviceWorker' in navigator) {
    // When an updated service worker takes over, reload once so the new version shows
    // straight away. Skipped on first install (no previous controller) and mid-playback.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || playerOpen) return;
      reloaded = true; location.reload();
    });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }

  /* ---------- Connect with put.io (implicit OAuth flow) ---------- */
  const KEY_CLIENT = 'resume.clientid';
  const redirectUri = () => location.origin + location.pathname;
  const redirEl = document.querySelector('#redir');
  const clientEl = document.querySelector('#client-input');
  redirEl.textContent = redirectUri();
  clientEl.value = store.get(KEY_CLIENT) || '';

  document.querySelector('#connect-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = clientEl.value.trim(); if (!id) return;
    store.set(KEY_CLIENT, id);
    const u = new URL(API + '/oauth2/authenticate');
    u.searchParams.set('client_id', id);
    u.searchParams.set('response_type', 'token');
    u.searchParams.set('redirect_uri', redirectUri());
    location.href = u.toString();
  });

  const fromHash = /[#&]access_token=([^&]+)/.exec(location.hash);
  if (fromHash) {
    token = decodeURIComponent(fromHash[1]);
    store.set(KEY_TOKEN, token);
    history.replaceState(null, '', location.pathname + location.search);
  }

  if (token) start(); else show('login');
})();
