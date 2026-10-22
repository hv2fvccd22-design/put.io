(() => {
  'use strict';

  const APP_VERSION = 'v16';
  const API = 'https://api.put.io/v2';
  const KEY_TOKEN = 'resume.token';
  const KEY_PENDING = 'resume.pending';
  const KEY_AUTOPLAY = 'resume.autoplay';
  const KEY_BUFFER = 'resume.buffer';
  const KEY_ROOTDIRS = 'resume.rootdirs';
  const KEY_OMDB = 'resume.omdbkey';
  const KEY_OMDB_CACHE = 'resume.omdbcache';
  const BUFFER_AHEAD_SECS = 300;
  const SAVE_EVERY_MS = 10000;
  const MIN_SAVE_SECONDS = 5;

  const $ = (s) => document.querySelector(s);
  const el = {
    title: $('#title'), back: $('#back'), signout: $('#signout'),
    login: $('#login'), loginForm: $('#login-form'), tokenInput: $('#token-input'), loginMsg: $('#login-msg'),
    browser: $('#browser'), crumbs: $('#crumbs'), list: $('#list'),
    player: $('#player'), video: $('#video'), ptitle: $('#ptitle'),
    restart: $('#restart'), download: $('#download'), mp4: $('#mp4'), vlc: $('#vlc'), status: $('#status'),
    autoplay: $('#autoplay'), cog: $('#cog'), settings: $('#settings'),
    bufahead: $('#bufahead'), buf: $('#buf'), bufbar: $('#bufbar'),
    rootdirs: $('#rootdirs'), imdb: $('#imdb'), omdbkey: $('#omdbkey'),
    info: $('#info'), poster: $('#poster'), infoTitle: $('#info-title'), infoMeta: $('#info-meta'), infoPlot: $('#info-plot'),
    finfo: $('#finfo'), fposter: $('#fposter'), finfoTitle: $('#finfo-title'), finfoMeta: $('#finfo-meta'), finfoPlot: $('#finfo-plot'), finfoImdb: $('#finfo-imdb'),
    subs: $('#subs'), subsel: $('#subsel'), subdl: $('#subdl'),
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  let token = store.get(KEY_TOKEN);
  if ($('#ver')) $('#ver').textContent = APP_VERSION;
  // Settings (cog). Auto-start applies to every file; off unless switched on; remembered per device.
  el.autoplay.checked = store.get(KEY_AUTOPLAY) === 'on';
  el.autoplay.addEventListener('change', () => store.set(KEY_AUTOPLAY, el.autoplay.checked ? 'on' : 'off'));
  // Buffer ahead: off unless switched on. Only hls.js lets a page set how far ahead to load.
  el.bufahead.checked = store.get(KEY_BUFFER) === 'on';
  el.bufahead.addEventListener('change', () => store.set(KEY_BUFFER, el.bufahead.checked ? 'on' : 'off'));
  const canBufferAhead = () => el.bufahead.checked && !!(window.Hls && window.Hls.isSupported());
  function toggleSettings(open) {
    el.settings.hidden = !open;
    el.cog.setAttribute('aria-expanded', String(open));
  }
  el.omdbkey.value = store.get(KEY_OMDB) || '';
  el.omdbkey.addEventListener('change', () => {
    const k = el.omdbkey.value.trim();
    if (k) store.set(KEY_OMDB, k); else store.del(KEY_OMDB);
  });
  el.cog.addEventListener('click', () => {
    const open = el.settings.hidden;
    toggleSettings(open);
    if (open) loadRootDirs();
  });

  // Which top-level folders the main screen shows, by put.io folder id.
  function rootPicks() {
    try { return new Set(JSON.parse(store.get(KEY_ROOTDIRS) || '[]')); } catch (e) { return new Set(); }
  }
  async function loadRootDirs() {
    if (!token) return;
    try {
      const r = await api('/files/list', { params: { parent_id: 0, per_page: 1000 } });
      const dirs = (r.files || []).filter((f) => f.file_type === 'FOLDER')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      const picked = rootPicks();
      el.rootdirs.innerHTML = '';
      if (!dirs.length) { el.rootdirs.innerHTML = '<span class="small muted">No folders found.</span>'; return; }
      dirs.forEach((d) => {
        const l = document.createElement('label'); l.className = 'toggle';
        const c = document.createElement('input'); c.type = 'checkbox'; c.value = String(d.id); c.checked = picked.has(d.id);
        l.append(c, ' ' + d.name);
        el.rootdirs.appendChild(l);
      });
    } catch (e) {
      el.rootdirs.innerHTML = '';
      const s = document.createElement('span'); s.className = 'small err'; s.textContent = `Could not load folders (${e.message}).`;
      el.rootdirs.appendChild(s);
    }
  }
  el.rootdirs.addEventListener('change', () => {
    const ids = [...el.rootdirs.querySelectorAll('input:checked')].map((c) => Number(c.value));
    store.set(KEY_ROOTDIRS, JSON.stringify(ids));
    if (stack.length === 1 && !playerOpen) loadFolder(0);
  });
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
    el.cog.hidden = view === 'login';
    if (view === 'login') toggleSettings(false);
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
      // Main screen only: keep just the folders ticked in Settings (none ticked = show all).
      const picked = rootPicks();
      if (id === 0 && picked.size) files = files.filter((f) => picked.has(f.id));
      renderList();
      loadFolderInfo();
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

  /* ---------- IMDb ---------- */
  // Turn a release name into a search: "Mayor.of.Kingstown.S01E03.720p..." -> "Mayor of Kingstown".
  // Keeps a year for films ("Some.Film.2019.1080p" -> "Some Film 2019").
  function cleanTitle(name) {
    let s = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    const cut = /\b(S\d{1,2}(E\d{1,3})?|\d{1,2}x\d{2}|2160p|1080p|720p|480p|WEB(-?DL|Rip)?|HDTV|BluRay|BRRip|DVDRip|x26[45]|H ?26[45]|HEVC|PROPER|REPACK|COMPLETE)\b/i.exec(s);
    if (cut) s = s.slice(0, cut.index);
    const year = /\(?\b(19|20)\d{2}\b\)?/.exec(s);
    if (year) s = s.slice(0, year.index) + year[0].replace(/[()]/g, '');
    return s.replace(/\s+/g, ' ').replace(/[\s-]+$/, '').trim();
  }
  // Split a release name into show/film title, year, season and episode.
  function parseRelease(name) {
    const s = name.replace(/[._]+/g, ' ');
    const ep = /\bS(\d{1,2})E(\d{1,3})\b/i.exec(s) || /\b(\d{1,2})x(\d{2})\b/.exec(s);
    const year = /\b((?:19|20)\d{2})\b/.exec(s);
    return {
      title: cleanTitle(name).replace(/\s(19|20)\d{2}$/, ''),
      year: year ? year[1] : '',
      season: ep ? Number(ep[1]) : null,
      episode: ep ? Number(ep[2]) : null,
    };
  }

  // OMDb lookups (only with a key set in Settings), remembered on this device.
  function omdbCache() { try { return JSON.parse(store.get(KEY_OMDB_CACHE) || '{}') || {}; } catch (e) { return {}; } }
  async function omdb(params) {
    const key = store.get(KEY_OMDB); if (!key) return null;
    const id = JSON.stringify(params), cache = omdbCache();
    if (cache[id]) return cache[id].r;
    const u = new URL('https://www.omdbapi.com/');
    u.searchParams.set('apikey', key);
    for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
    const res = await fetch(u);
    if (res.status === 401) throw new Error('OMDb key rejected');
    const r = await res.json();
    if (r.Response === 'False' && /key/i.test(r.Error || '')) throw new Error(r.Error);
    const ok = r.Response === 'True' ? r : null;
    cache[id] = { r: ok, t: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > 400) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 400).forEach((k) => delete cache[k]);
    store.set(KEY_OMDB_CACHE, JSON.stringify(cache));
    return ok;
  }
  function showFolderTitle() {
    for (let i = stack.length - 1; i > 0; i--) if (!/^season\b/i.test(stack[i].name)) return stack[i].name;
    return '';
  }
  const na = (v) => (v && v !== 'N/A' ? v : '');
  function fillMeta(metaEl, rating, parts) {
    metaEl.innerHTML = '';
    if (rating) { const st = document.createElement('span'); st.className = 'star'; st.textContent = `★ ${rating}`; metaEl.append(st, parts.length ? ' · ' : ''); }
    metaEl.append(parts.join(' · '));
  }
  function setPoster(img, url) {
    if (url && (url.startsWith('https://m.media-amazon.com/') || url.startsWith('https://api.put.io/'))) { img.src = url; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
  }

  // IMDb and put.io subtitles only make sense under the Movies / TV Shows top-level
  // folders; podcasts, music etc. get their folder's own cover image instead.
  const isFilmTvSection = () => stack.length > 1 && /^(movies?|films?|tv( shows?)?|series)$/i.test(stack[1].name.trim());
  // put.io gives image files a token-free preview link ("screenshot").
  function folderCover(list) {
    const imgs = list.filter((f) => f.file_type === 'IMAGE' && (f.screenshot || f.icon));
    const pick = imgs.find((f) => /^(cover|folder|poster|artwork|front)\./i.test(f.name)) || imgs[0];
    return pick ? (pick.screenshot || pick.icon) : '';
  }

  // Card at the top of a folder: IMDb details for a show/film, or the cover image elsewhere.
  let folderInfoFor = null;
  async function loadFolderInfo() {
    const depth = stack.length;
    const name = showFolderTitle();
    if (depth >= 2 && !isFilmTvSection()) {
      folderInfoFor = null;
      const cover = folderCover(files);
      if (!cover) { el.finfo.hidden = true; return; }
      el.finfoTitle.textContent = stack[depth - 1].name;
      el.finfoMeta.textContent = ''; el.finfoPlot.textContent = '';
      el.finfoImdb.hidden = true;
      setPoster(el.fposter, cover);
      el.finfo.hidden = false;
      return;
    }
    el.finfoImdb.hidden = false;
    // Top-level folders (Movies, TV Shows...) are categories, not titles: start one level down.
    if (!store.get(KEY_OMDB) || depth < 3 || !name) { el.finfo.hidden = true; folderInfoFor = null; return; }
    if (folderInfoFor === name) return; // same show (e.g. moving into a Season folder): keep the card
    el.finfo.hidden = true; folderInfoFor = name;
    const p = parseRelease(name);
    if (!p.title) return;
    try {
      const r = await omdb({ t: p.title, y: p.year, type: 'series' }) || await omdb({ t: p.title, y: p.year, type: 'movie' });
      if (folderInfoFor !== name || !r) return;
      el.finfoTitle.textContent = `${r.Title}${na(r.Year) ? ` (${r.Year})` : ''}`;
      fillMeta(el.finfoMeta, na(r.imdbRating), [na(r.totalSeasons) && `${r.totalSeasons} season${r.totalSeasons === '1' ? '' : 's'}`, na(r.Runtime), na(r.Genre)].filter(Boolean));
      el.finfoPlot.textContent = na(r.Plot);
      setPoster(el.fposter, na(r.Poster));
      el.finfoImdb.href = `https://www.imdb.com/title/${encodeURIComponent(r.imdbID)}/`;
      el.finfo.hidden = false;
    } catch (e) { /* no card; the folder list still works */ }
  }

  // Podcasts, music...: the folder's cover image in the player, no IMDb lookup.
  function showCoverInfo() {
    const cover = folderCover(files);
    el.info.hidden = !cover;
    if (!cover) return;
    setPoster(el.poster, cover);
    el.infoTitle.textContent = stack[stack.length - 1].name;
    el.infoMeta.textContent = ''; el.infoPlot.textContent = '';
  }

  async function loadInfo(f) {
    el.info.hidden = true; el.poster.hidden = true; el.poster.removeAttribute('src');
    if (!store.get(KEY_OMDB) || f.file_type !== 'VIDEO') return;
    let p = parseRelease(f.name);
    if (p.title.length < 3) { const q = parseRelease(showFolderTitle()); p = { ...q, season: p.season, episode: p.episode }; }
    if (!p.title) return;
    try {
      const isEp = p.season != null;
      const main = await omdb({ t: p.title, y: p.year, type: isEp ? 'series' : 'movie' }) || await omdb({ t: p.title, y: p.year });
      if (!current || current.id !== f.id || !main) return;
      const ep = isEp ? await omdb({ i: main.imdbID, Season: p.season, Episode: p.episode }) : null;
      if (!current || current.id !== f.id) return;
      const src = ep || main;
      el.infoTitle.textContent = ep ? `${main.Title}: S${p.season}E${p.episode} ${na(ep.Title)}` : `${main.Title} (${na(main.Year)})`;
      fillMeta(el.infoMeta, na(src.imdbRating) || na(main.imdbRating), [na(src.Runtime), na(main.Genre)].filter(Boolean));
      el.infoPlot.textContent = na(src.Plot) || na(main.Plot);
      setPoster(el.poster, na(src.Poster) || na(main.Poster));
      el.imdb.href = `https://www.imdb.com/title/${encodeURIComponent(src.imdbID || main.imdbID)}/`;
      el.info.hidden = false;
    } catch (e) {
      setStatus(`IMDb info unavailable (${e.message}).`, 'warn');
    }
  }

  function imdbSearchUrl(f) {
    let q = cleanTitle(f.name);
    // Episode files named only "E03" or "Episode 3": use the show folder above instead.
    for (let i = stack.length - 1; q.length < 3 && i > 0; i--) {
      if (!/^season\b/i.test(stack[i].name)) q = cleanTitle(stack[i].name);
    }
    return 'https://www.imdb.com/find/?q=' + encodeURIComponent(q || f.name);
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
      const filmTv = isFilmTvSection();
      el.imdb.hidden = !filmTv;
      if (filmTv) { el.imdb.href = imdbSearchUrl(f); loadInfo(f); } else showCoverInfo();
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
    kinds = f.file_type === 'VIDEO' && canBufferAhead() ? ['hls', ...mp4, 'direct']
      : (native || f.file_type === 'AUDIO') ? ['direct', ...mp4, 'hls'] : [...mp4, 'hls', 'direct'];
    playKind(0, start > MIN_SAVE_SECONDS ? `Resuming at ${fmtTime(start)}` : 'Ready');
    if (f.file_type === 'VIDEO' && isFilmTvSection()) loadSubtitles(f);
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
    const bufferMode = kind === 'hls' && canBufferAhead();
    if (kind === 'hls' && (bufferMode || !v.canPlayType('application/vnd.apple.mpegurl'))) {
      if (window.Hls && window.Hls.isSupported()) {
        // Buffer-ahead keeps ~5 min loaded ahead and drops all but the last minute behind.
        // The byte cap is a ceiling; browsers may still hold less, and hls.js backs off if so.
        hls = new window.Hls(bufferMode ? {
          maxBufferLength: BUFFER_AHEAD_SECS,
          maxMaxBufferLength: BUFFER_AHEAD_SECS,
          maxBufferSize: 300 * 1000 * 1000,
          backBufferLength: 60,
        } : {});
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

  // Bar under the video: watched part in white, buffered ranges in yellow, so the
  // yellow past the white edge is what's loaded ahead of the current position.
  // Plus how much is loaded ahead, shown as text while buffer-ahead is in use.
  ['progress', 'timeupdate', 'seeking', 'durationchange', 'emptied'].forEach((ev) => el.video.addEventListener(ev, showBuffered));
  function drawBufBar() {
    const v = el.video, d = v.duration;
    el.bufbar.hidden = !playerOpen || !isFinite(d) || d <= 0;
    if (el.bufbar.hidden) return;
    const pct = (s) => `${Math.max(0, Math.min(100, (s / d) * 100))}%`;
    const box = el.bufbar.querySelector('.ranges');
    box.innerHTML = '';
    for (let i = 0; i < v.buffered.length; i++) {
      const r = document.createElement('div');
      r.style.left = pct(v.buffered.start(i));
      r.style.width = pct(v.buffered.end(i) - v.buffered.start(i));
      box.appendChild(r);
    }
    el.bufbar.querySelector('.played').style.width = pct(v.currentTime);
  }
  function showBuffered() {
    drawBufBar();
    const on = !!hls && el.bufahead.checked && playerOpen;
    el.buf.hidden = !on;
    if (!on) return;
    const v = el.video, t = v.currentTime;
    let ahead = 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= t + 0.5 && v.buffered.end(i) > t) ahead = v.buffered.end(i) - t;
    }
    el.buf.textContent = `Buffered ${fmtTime(ahead)} ahead`;
  }

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
