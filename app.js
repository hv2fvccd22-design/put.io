(() => {
  'use strict';

  const APP_VERSION = 'v50';
  const API = 'https://api.put.io/v2';
  const KEY_TOKEN = 'resume.token';
  const KEY_PENDING = 'resume.pending';
  const KEY_AUTOPLAY = 'resume.autoplay';
  const KEY_BUFFER = 'resume.buffer';
  const KEY_ROOTDIRS = 'resume.rootdirs';
  const KEY_HIDENP = 'resume.hidenp';
  const KEY_PLAYNEXT = 'resume.playnext';
  const KEY_GRID = 'resume.grid';
  const KEY_FLATTEN = 'resume.flatten';
  const KEY_AUTOFS = 'resume.autofs';
  const KEY_FILLFS = 'resume.fillfs';
  const KEY_OMDB = 'resume.omdbkey';
  const KEY_OMDB_CACHE = 'resume.omdbcache';
  const BUFFER_AHEAD_SECS = 300;
  const SAVE_EVERY_MS = 10000;
  const MIN_SAVE_SECONDS = 5;

  const $ = (s) => document.querySelector(s);
  const el = {
    title: $('#title'), logo: $('#logo'), back: $('#back'), signout: $('#signout'),
    login: $('#login'), loginForm: $('#login-form'), tokenInput: $('#token-input'), loginMsg: $('#login-msg'),
    browser: $('#browser'), crumbs: $('#crumbs'), list: $('#list'),
    player: $('#player'), video: $('#video'), ptitle: $('#ptitle'),
    restart: $('#restart'), download: $('#download'), mp4: $('#mp4'), vlc: $('#vlc'), status: $('#status'),
    autoplay: $('#autoplay'), cog: $('#cog'), settings: $('#settings'),
    bufahead: $('#bufahead'), buf: $('#buf'), bufbar: $('#bufbar'),
    rootdirs: $('#rootdirs'), imdb: $('#imdb'), hidenp: $('#hidenp'), playnext: $('#playnext'), next: $('#next'),
    save: $('#save'), offlist: $('#offlist'), offspace: $('#offspace'), grid: $('#grid'),
    dlbtn: $('#dlbtn'), downloads: $('#downloads'), flatten: $('#flatten'),
    upcoming: $('#upcoming'), upList: $('#up-list'),
    home: $('#home'), homeRows: $('#home-rows'), tabs: $('#tabs'),
    menubtn: $('#menubtn'), menu: $('#menu'), searchbtn: $('#searchbtn'), searchbar: $('#searchbar'), q: $('#q'), autofs: $('#autofs'), fillfs: $('#fillfs'), omdbkey: $('#omdbkey'),
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
    if (open) { toggleDownloads(false); toggleMenu(false); }
    el.settings.hidden = !open;
    el.cog.setAttribute('aria-expanded', String(open));
  }
  // Poster grid for the shows/films inside Movies and TV Shows: on unless switched off.
  el.grid.checked = store.get(KEY_GRID) !== 'off';
  el.grid.addEventListener('change', () => {
    store.set(KEY_GRID, el.grid.checked ? 'on' : 'off');
    if (!playerOpen) renderList();
  });
  // Full screen: open videos full screen (on unless switched off); fill = crop to the
  // screen's shape (off unless switched on). Full screen also turns the phone landscape.
  el.autofs.checked = store.get(KEY_AUTOFS) !== 'off';
  el.autofs.addEventListener('change', () => store.set(KEY_AUTOFS, el.autofs.checked ? 'on' : 'off'));
  el.fillfs.checked = store.get(KEY_FILLFS) === 'on';
  document.body.classList.toggle('fillscreen', el.fillfs.checked);
  el.fillfs.addEventListener('change', () => {
    store.set(KEY_FILLFS, el.fillfs.checked ? 'on' : 'off');
    document.body.classList.toggle('fillscreen', el.fillfs.checked);
  });
  // Must run inside the tap that opened the video (browsers only allow full screen then).
  function goFullscreen() {
    const v = el.video;
    const req = v.requestFullscreen || v.webkitRequestFullscreen;
    if (!req || document.fullscreenElement) return;
    try { const p = req.call(v); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed here */ }
  }
  document.addEventListener('fullscreenchange', () => {
    const o = screen.orientation;
    if (!o) return;
    if (document.fullscreenElement === el.video) { if (o.lock) o.lock('landscape').catch(() => {}); }
    else if (o.unlock) { try { o.unlock(); } catch (e) { /* ignore */ } }
  });
  // One episode list per show instead of season folders: on unless switched off.
  el.flatten.checked = store.get(KEY_FLATTEN) !== 'off';
  el.flatten.addEventListener('change', () => {
    store.set(KEY_FLATTEN, el.flatten.checked ? 'on' : 'off');
    if (!playerOpen && stack.length > 1) loadFolder(stack[stack.length - 1].id);
  });
  // Play next: on unless switched off.
  el.playnext.checked = store.get(KEY_PLAYNEXT) !== 'off';
  el.playnext.addEventListener('change', () => store.set(KEY_PLAYNEXT, el.playnext.checked ? 'on' : 'off'));
  // Hide non-playable files in lists: on unless switched off.
  el.hidenp.checked = store.get(KEY_HIDENP) !== 'off';
  el.hidenp.addEventListener('change', () => {
    store.set(KEY_HIDENP, el.hidenp.checked ? 'on' : 'off');
    if (!playerOpen) renderList();
  });
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
  // Offline downloads have their own panel (header ⤓ button).
  function toggleDownloads(open) {
    if (open) { toggleSettings(false); toggleMenu(false); }
    el.downloads.hidden = !open;
    el.dlbtn.setAttribute('aria-expanded', String(open));
    if (open) renderOffline();
  }
  el.dlbtn.addEventListener('click', () => toggleDownloads(el.downloads.hidden));

  /* ---------- ☰ menu ---------- */
  function toggleMenu(open) {
    if (open) { toggleSettings(false); toggleDownloads(false); }
    el.menu.hidden = !open;
    el.menubtn.setAttribute('aria-expanded', String(open));
  }
  el.menubtn.addEventListener('click', () => toggleMenu(el.menu.hidden));
  el.menu.addEventListener('click', (e) => { if (e.target.closest('a.menuitem')) toggleMenu(false); });
  $('#m-settings').addEventListener('click', () => { toggleMenu(false); if (el.settings.hidden) el.cog.click(); });
  $('#m-signout').addEventListener('click', () => { toggleMenu(false); logout(''); });
  $('#m-home').addEventListener('click', async () => {
    toggleMenu(false);
    if (playerOpen) await closePlayer();
    goHome();
  });

  /* ---------- played / unplayed (per device; put.io only stores positions) ---------- */
  const KEY_PLAYED = 'resume.played';
  let playedSet = (() => { try { return new Set(JSON.parse(store.get(KEY_PLAYED) || '[]')); } catch (e) { return new Set(); } })();
  const isPlayed = (id) => playedSet.has(id);
  function setPlayed(id, on) {
    if (on) playedSet.add(id); else playedSet.delete(id);
    store.set(KEY_PLAYED, JSON.stringify([...playedSet].slice(-3000)));
  }

  /* ---------- watch history (for Continue watching / Up next) ---------- */
  // Per device: what you opened, where you got to, and the next episode when you finish one.
  // Positions also refresh from put.io, so progress from other devices shows up.
  const KEY_HISTORY = 'resume.history';
  const hist = () => { try { const h = JSON.parse(store.get(KEY_HISTORY) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } };
  const saveHist = (h) => store.set(KEY_HISTORY, JSON.stringify(h.slice(0, 40)));
  function upsertHist(item) {
    const h = hist(), i = h.findIndex((x) => x.id === item.id);
    const merged = { ...(i >= 0 ? h[i] : {}), ...item };
    if (i >= 0) h.splice(i, 1);
    h.unshift(merged); saveHist(h);
  }
  function recordHistory(f) {
    if (!isPlayable(f)) return;
    upsertHist({ id: f.id, name: f.name, file_type: f.file_type, path: stack.map((s) => ({ id: s.id, name: s.name })),
      img: f.screenshot || (hist().find((x) => x.id === f.id) || {}).img || '', at: Date.now(), finished: false, upnext: false });
  }
  function historyPos(id, secs) {
    const h = hist(), it = h.find((x) => x.id === id); if (!it) return;
    it.pos = secs; if (isFinite(el.video.duration) && current && current.id === id) it.dur = Math.floor(el.video.duration);
    it.upnext = false; saveHist(h);
  }
  function historyArt(id, url) {
    const h = hist(), it = h.find((x) => x.id === id);
    if (it && !it.art) { it.art = url; saveHist(h); }
  }
  function historyFinished(id, next) {
    const h = hist(), it = h.find((x) => x.id === id);
    if (it) { it.finished = true; it.pos = 0; saveHist(h); }
    if (next && isPlayable(next) && it) upsertHist({ id: next.id, name: next.name, file_type: next.file_type, path: it.path, img: next.screenshot || '', art: it.art, at: Date.now(), pos: 0, finished: false, upnext: true });
  }

  // Pick up things in progress that weren't started in this app on this device (older plays,
  // put.io's own apps): look at the most recently updated folders in each library for files
  // with a saved position. At most every 30 minutes.
  const KEY_SCAN = 'resume.progscan';
  async function scanProgress(libs) {
    if (Date.now() - Number(store.get(KEY_SCAN) || 0) < 30 * 60000) return false;
    store.set(KEY_SCAN, String(Date.now()));
    const known = new Set(hist().map((x) => x.id)), found = [];
    const take = (list, path) => list.forEach((f) => {
      if (isPlayable(f) && (f.start_from || 0) > MIN_SAVE_SECONDS && !known.has(f.id)) {
        known.add(f.id);
        found.push({ id: f.id, name: f.name, file_type: f.file_type, path, img: f.screenshot || '', pos: f.start_from,
          at: Date.parse((f.updated_at || f.created_at || '') + 'Z') || 0, finished: false, upnext: false });
      }
    });
    const lst = async (id) => ((await api('/files/list', { params: { parent_id: id, per_page: 1000 } })).files) || [];
    await pool(libs, 2, async (lib) => {
      const kids = await lst(lib.id);
      const folders = kids.filter((f) => f.file_type === 'FOLDER' && f.name !== 'to_sort')
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 8);
      take(kids, [{ id: 0, name: 'Files' }, { id: lib.id, name: lib.name }]);
      await pool(folders, 3, async (fd) => {
        const base = [{ id: 0, name: 'Files' }, { id: lib.id, name: lib.name }, { id: fd.id, name: fd.name }];
        const inside = await lst(fd.id);
        take(inside, base);
        // one level further (season folders / albums)
        const subs = inside.filter((f) => f.file_type === 'FOLDER').slice(0, 6);
        await pool(subs, 2, async (sd) => take(await lst(sd.id), [...base, { id: sd.id, name: sd.name }]));
      });
    });
    if (!found.length) return false;
    const h = hist(); found.forEach((x) => h.push(x)); saveHist(h.sort((a, b) => (b.at || 0) - (a.at || 0)));
    return true;
  }

  /* ---------- Home (Plex-style): Continue watching + Recently added rows ---------- */
  function goHome(push = true) {
    toggleMenu(false); toggleDownloads(false); toggleSettings(false); closeSearch();
    if (push) history.pushState({ home: 1 }, '');
    show('home'); setTitle('');
    loadHome();
  }
  function goLibrary() {
    toggleDownloads(false); closeSearch();
    stack = [{ id: 0, name: 'Files' }];
    history.pushState({ d: 1 }, '');
    show('browser'); loadFolder(0); renderCrumbs();
  }
  el.tabs.addEventListener('click', async (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    if (playerOpen) await closePlayer();
    if (t.dataset.tab === 'home') goHome();
    else if (t.dataset.tab === 'library') goLibrary();
    else if (t.dataset.tab === 'upcoming') openUpcoming();
    else if (t.dataset.tab === 'downloads') toggleDownloads(el.downloads.hidden);
  });
  const continueItems = () => hist().filter((x) => !x.finished && (x.upnext || ((x.pos || 0) > MIN_SAVE_SECONDS && (!x.dur || x.pos < x.dur - 30))))
    .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 24);
  // Progress card: poster (IMDb for TV/films, cover for audio), how far, and ✓ to mark played.
  function cwCard(it) {
    const card = document.createElement('div'); card.className = 'pc';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tile'; b.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:none;border:0;padding:0;text-align:left';
    const p = parseRelease(it.name), showName = (it.path[2] && it.path[2].name) || '';
    const isEp = p.season != null;
    const label = isEp ? (parseRelease(showName).title || p.title)
      : it.file_type === 'AUDIO' ? it.name.replace(/\.[a-z0-9]{2,4}$/i, '') : (p.title || it.name);
    const box = document.createElement('div'); box.className = 'pimg'; box.textContent = label;
    const art = it.art || (it.file_type === 'AUDIO' ? '' : '');
    if (art && posterOk(art)) box.appendChild(Object.assign(document.createElement('img'), { src: art, alt: '', loading: 'lazy' }));
    else if (it.file_type === 'AUDIO' && navigator.onLine) {
      (async () => {
        try {
          const dirs = it.path.slice(2).reverse(); // album/CD folder first, then its parent
          for (const d of dirs) {
            const cover = folderCover(((await api('/files/list', { params: { parent_id: d.id, per_page: 200 } })).files) || []);
            if (cover) { if (box.isConnected) box.appendChild(Object.assign(document.createElement('img'), { src: cover, alt: '' })); historyArt(it.id, cover); break; }
          }
        } catch (e) { /* no cover */ }
      })();
    } else if (it.file_type !== 'AUDIO' && store.get(KEY_OMDB)) {
      // look up the show/film poster (cached by omdb())
      const q = parseRelease(isEp ? showName || it.name : (it.path.length > 2 ? it.path[it.path.length - 1].name : it.name));
      (async () => {
        try {
          const r = await omdb({ t: q.title, y: q.year, type: isEp ? 'series' : 'movie' }) || await omdb({ t: q.title, y: q.year });
          const url = r && na(r.Poster);
          if (posterOk(url) && box.isConnected) { box.appendChild(Object.assign(document.createElement('img'), { src: url, alt: '' })); historyArt(it.id, url); }
        } catch (e) { /* no poster */ }
      })();
    }
    if (it.upnext) box.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'UP NEXT' }));
    else if (it.dur || it.pos) {
      const bar = document.createElement('div'); bar.className = 'pbar'; const fill = document.createElement('i');
      fill.style.width = `${it.dur ? Math.min(100, Math.round((it.pos / it.dur) * 100)) : 8}%`;
      bar.appendChild(fill); box.appendChild(bar);
    }
    const nm = document.createElement('div'); nm.className = 'tname'; nm.textContent = label;
    const meta = document.createElement('div'); meta.className = 'tmeta';
    const far = it.upnext ? 'Up next' : it.dur ? `${Math.min(100, Math.round((it.pos / it.dur) * 100))}%` : it.pos ? `at ${fmtTime(it.pos)}` : '';
    meta.textContent = isEp ? `S${p.season}E${p.episode}${far ? ' · ' + far : ''}` : far;
    b.append(box, nm, meta);
    b.addEventListener('click', () => resumeItem(it));
    const mk = document.createElement('button'); mk.type = 'button'; mk.className = 'mark';
    mk.textContent = '✓'; mk.title = it.upnext ? 'Dismiss' : 'Mark played'; mk.setAttribute('aria-label', `${mk.title}: ${label}`);
    mk.addEventListener('click', (e) => { e.stopPropagation(); markPlayed(it.id); });
    card.append(b, mk);
    return card;
  }
  // Mark played: clear the saved position on put.io (so it's done everywhere) and drop it from the rows.
  async function markPlayed(id) {
    const h = hist(), it = h.find((x) => x.id === id);
    if (it && !it.upnext) setPlayed(id, true);
    if (it) { it.finished = true; it.upnext = false; it.pos = 0; saveHist(h); }
    else setPlayed(id, true);
    delete pending[id]; savePending();
    if (!el.home.hidden) renderHome();
    try { await position.reset(id, false); } catch (e) { if (e.auth) logout('Your token was rejected. Connect again.'); }
    const f = files.find((x) => x.id === id); if (f) f.start_from = 0;
    refreshPlayedUi();
  }
  // Mark unplayed: not played, no saved position: starts fresh from the beginning.
  async function markUnplayed(id) {
    setPlayed(id, false);
    saveHist(hist().filter((x) => x.id !== id));
    delete pending[id]; savePending();
    const f = files.find((x) => x.id === id); if (f) f.start_from = 0;
    refreshPlayedUi();
    try { await position.reset(id, false); } catch (e) { if (e.auth) logout('Your token was rejected. Connect again.'); }
  }
  function refreshPlayedUi() {
    if (current) el.markplayed.textContent = isPlayed(current.id) ? 'Mark unplayed' : 'Mark played';
    if (!playerOpen && !el.browser.hidden && !searching) renderList();
    if (!el.home.hidden) renderHome();
  }
  // Open a history item where it lives (so Next / covers work), then play it.
  async function resumeItem(it) {
    stack = it.path.map((s) => ({ ...s }));
    await loadFolder(stack[stack.length - 1].id);
    const g = files.find((x) => x.id === it.id);
    if (g) openFile(g, { from: 'home' });
    else { show('browser'); renderCrumbs(); setStatus('That file is no longer in its folder.', 'warn'); }
  }
  let homeObs = null;
  // Home = just Now playing: everything part-way through (films, TV, music, podcasts), newest first.
  let homeLoaded = false;
  function renderHome() {
    el.homeRows.innerHTML = '';
    const cw = continueItems();
    if (cw.length) {
      const sec = document.createElement('section'); sec.className = 'hrow';
      const h = document.createElement('h2'); h.textContent = 'Now playing';
      const g = document.createElement('div'); g.className = 'hgrid';
      cw.forEach((it) => g.appendChild(cwCard(it)));
      sec.append(h, g); el.homeRows.appendChild(sec);
      return;
    }
    const d = document.createElement('div'); d.className = 'empty';
    if (!navigator.onLine) d.innerHTML = '<strong>You\'re offline</strong><br><span class="small">Saved items are in Downloads.</span>';
    else if (!homeLoaded) d.innerHTML = 'Checking what you\'re part-way through&hellip;';
    else {
      d.innerHTML = '<strong>Nothing playing</strong><br><span class="small">Anything you start (films, TV, music or podcasts) shows here until it\'s finished.</span><br>';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.style.marginTop = '12px'; b.textContent = 'Go to Library';
      b.addEventListener('click', goLibrary); d.appendChild(b);
    }
    el.homeRows.appendChild(d);
  }
  async function loadHome() {
    if (homeObs) homeObs.disconnect();
    homeObs = store.get(KEY_OMDB) && 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) { homeObs.unobserve(en.target); posterQueue.push(en.target); } });
      pumpPosters();
    }, { rootMargin: '200px' }) : null;
    renderHome();
    try {
      const root = await api('/files/list', { params: { parent_id: 0, per_page: 1000 } });
      const picked = rootPicks();
      const scanLibs = (root.files || []).filter((f) => f.file_type === 'FOLDER' && (!picked.size || picked.has(f.id))
        && /^(tv( shows?)?|series|movies?|films?)$|podcast|music|audio ?books?/i.test(f.name.trim()))
        .map((f) => ({ id: f.id, name: f.name }));
      try { await scanProgress(scanLibs); } catch (e) { if (e.auth) throw e; }
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
    }
    homeLoaded = true;
    if (el.home.hidden) return;
    renderHome();
    // Refresh positions from put.io (progress made on other devices), then redraw.
    const cw = continueItems();
    if (cw.length && navigator.onLine) {
      let changed = false;
      await pool(cw, 3, async (it) => {
        try {
          const r = await api(`/files/${it.id}`);
          if (r && r.file) {
            const sf = r.file.start_from || 0, h = hist(), x = h.find((y) => y.id === it.id);
            if (x && !x.upnext && sf && sf !== x.pos) { x.pos = sf; saveHist(h); changed = true; }
            if (x && !x.img && r.file.screenshot) { x.img = r.file.screenshot; saveHist(h); changed = true; }
          }
        } catch (e) {
          if (e.status === 404) { saveHist(hist().filter((y) => y.id !== it.id)); changed = true; }
        }
      });
      if (changed && !el.home.hidden) renderHome();
    }
  }

  /* ---------- upcoming episodes (TVmaze: free, no key, allows web apps) ---------- */
  // Followed = every show folder in your TV Shows folder (matched by name + year), plus any
  // you follow by search, minus any you unfollow. Stored per device; lookups cached.
  const TVM = 'https://api.tvmaze.com';
  const KEY_FOLLOW = 'resume.follow';     // { extra: [{id, name}], muted: [id] }
  const KEY_TVM = 'resume.tvmaze2';       // { m: {query: {id, t}}, s: {id: {d, t}} }
  const DAY = 86400000;
  const followState = () => { try { const f = JSON.parse(store.get(KEY_FOLLOW) || '{}') || {}; return { extra: f.extra || [], muted: f.muted || [] }; } catch (e) { return { extra: [], muted: [] }; } };
  const saveFollow = (f) => store.set(KEY_FOLLOW, JSON.stringify(f));
  const tvmCache = () => { try { const c = JSON.parse(store.get(KEY_TVM) || '{}') || {}; return { m: c.m || {}, s: c.s || {} }; } catch (e) { return { m: {}, s: {} }; } };
  function saveTvm(c) {
    const ids = Object.keys(c.s);
    if (ids.length > 150) ids.sort((a, b) => c.s[a].t - c.s[b].t).slice(0, ids.length - 150).forEach((k) => delete c.s[k]);
    try { store.set(KEY_TVM, JSON.stringify(c)); } catch (e) { /* storage full: skip caching */ }
  }
  async function tvm(path) {
    const r = await fetch(TVM + path);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('TVmaze HTTP ' + r.status);
    return r.json();
  }
  // Library folder name -> TVmaze show id (cached for 30 days, including "no match").
  async function matchShow(folderName) {
    const p = parseRelease(folderName), key = `${p.title}|${p.year}`.toLowerCase(), c = tvmCache();
    if (c.m[key] && Date.now() - c.m[key].t < 30 * DAY) return c.m[key].id;
    const res = (await tvm(`/search/shows?q=${encodeURIComponent(p.title)}`)) || [];
    const pick = (p.year && res.find((x) => (x.show.premiered || '').startsWith(p.year))) || res[0];
    const id = pick ? pick.show.id : null;
    const c2 = tvmCache(); c2.m[key] = { id, t: Date.now() }; saveTvm(c2);
    return id;
  }
  // Show + all its episodes (cached 12 h, so the page is quick and works offline).
  async function showEpisodes(id) {
    const c = tvmCache(), hit = c.s[id];
    if (hit && (Date.now() - hit.t < 12 * 3600000 || !navigator.onLine)) return hit.d;
    try {
      const s = await tvm(`/shows/${id}?embed=episodes`);
      if (!s) return null;
      // Streaming shows have no air time: TVmaze then fills in 12:00 UTC, which isn't real,
      // so keep `timed` to show the time only when it's known.
      const eps = ((s._embedded && s._embedded.episodes) || []).map((e) => ({ s: e.season, n: e.number, name: e.name, at: e.airstamp || (e.airdate ? e.airdate + 'T12:00:00Z' : ''), timed: !!e.airtime })).filter((e) => e.at);
      const d = { id: s.id, name: s.name, status: s.status, img: s.image && (s.image.medium || s.image.original), eps };
      const c2 = tvmCache(); c2.s[id] = { d, t: Date.now() }; saveTvm(c2);
      return d;
    } catch (e) { return hit ? hit.d : null; }
  }
  // Show folders inside the TV Shows top-level folder: [{id, name}].
  async function libraryShows() {
    const root = await api('/files/list', { params: { parent_id: 0, per_page: 1000 } });
    const tv = (root.files || []).filter((f) => f.file_type === 'FOLDER' && /^(tv( shows?)?|series)$/i.test(f.name.trim()));
    const out = [];
    for (const t of tv) {
      const r = await api('/files/list', { params: { parent_id: t.id, per_page: 1000 } });
      (r.files || []).filter((f) => f.file_type === 'FOLDER').forEach((f) => out.push({ id: f.id, name: f.name, parent: t }));
    }
    return out;
  }
  async function pool(items, n, fn) {
    const out = []; let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  }
  let upShows = []; // [{tv, folder}] currently followed, for the manage list
  async function openUpcoming() {
    toggleMenu(false); closeSearch();
    if (playerOpen) await closePlayer();
    history.pushState({ d: stack.length, up: 1 }, '');
    show('upcoming'); setTitle('Upcoming');
    loadUpcoming();
  }
  $('#m-upcoming').addEventListener('click', openUpcoming);
  async function loadUpcoming() {
    el.upList.innerHTML = '<div class="empty">Checking your shows&hellip;</div>';
    const fol = followState();
    let lib = [];
    try { lib = await libraryShows(); } catch (e) { if (e.auth) return logout('Your token was rejected. Connect again.'); }
    const ids = await pool(lib, 3, async (f) => { try { return await matchShow(f.name); } catch (e) { return null; } });
    const map = new Map(); // tvmaze id -> {folder}
    lib.forEach((f, i) => { if (ids[i] && !map.has(ids[i])) map.set(ids[i], { folder: f }); });
    fol.extra.forEach((x) => { if (!map.has(x.id)) map.set(x.id, { folder: null }); });
    fol.muted.forEach((id) => map.delete(id));
    const entries = [...map.entries()];
    const shows = await pool(entries, 3, async ([id]) => showEpisodes(id));
    upShows = entries.map(([, v], i) => ({ tv: shows[i], folder: v.folder })).filter((x) => x.tv);
    renderUpcoming();
    renderFollowing();
  }
  function whenText(d) {
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
    return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : days > 0 ? `in ${days} days` : `${-days} days ago`;
  }
  function dayLabel(d) {
    const w = whenText(d);
    if (w === 'today' || w === 'tomorrow' || w === 'yesterday') return w[0].toUpperCase() + w.slice(1);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function renderUpcoming() {
    const now = Date.now(), start = new Date().setHours(0, 0, 0, 0);
    const up = [], recent = [], noDate = [];
    upShows.forEach(({ tv, folder }) => {
      const future = tv.eps.filter((e) => Date.parse(e.at) >= start);
      future.slice(0, 6).forEach((e) => up.push({ tv, folder, e }));
      tv.eps.filter((e) => { const t = Date.parse(e.at); return t < start && t >= start - 7 * DAY; }).forEach((e) => recent.push({ tv, folder, e }));
      if (!future.length && /running|in development/i.test(tv.status || '')) noDate.push({ tv, folder });
    });
    up.sort((a, b) => Date.parse(a.e.at) - Date.parse(b.e.at));
    recent.sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at));
    el.upList.innerHTML = '';
    if (!upShows.length) { el.upList.innerHTML = '<div class="empty">No followed shows yet. Shows in your TV Shows folder appear here automatically, or follow one below.</div>'; return; }
    const head = (t) => { const h = document.createElement('div'); h.className = 'up-day'; h.textContent = t; el.upList.appendChild(h); };
    const item = ({ tv, folder, e }, past) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'up-item' + (past ? ' past' : '');
      const img = tv.img && posterOk(tv.img) ? Object.assign(document.createElement('img'), { src: tv.img, alt: '', loading: 'lazy' }) : Object.assign(document.createElement('div'), { className: 'noimg' });
      const mid = document.createElement('div');
      const s1 = document.createElement('div'); s1.className = 'ushow'; s1.textContent = tv.name;
      const s2 = document.createElement('div'); s2.className = 'uep'; s2.textContent = e ? `S${e.s}E${e.n}${e.name && !/^episode \d+$/i.test(e.name) ? ' · ' + e.name : ''}` : (tv.status || '');
      mid.append(s1, s2);
      const w = document.createElement('div'); w.className = 'uwhen';
      if (e) {
        const d = new Date(e.at);
        w.innerHTML = `<b>${e.timed ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : (past ? 'Out' : 'Release day')}</b>`;
        w.append(whenText(d));
      }
      b.append(img, mid, w);
      if (folder) b.addEventListener('click', () => openLibraryShow(folder));
      else b.style.cursor = 'default';
      el.upList.appendChild(b);
    };
    let last = '';
    if (!up.length) head('Nothing scheduled yet');
    up.forEach((x) => { const lbl = dayLabel(new Date(x.e.at)); if (lbl !== last) { head(lbl); last = lbl; } item(x); });
    if (recent.length) { head('Aired this week'); recent.forEach((x) => item(x, true)); }
    if (noDate.length) { head('No date yet'); noDate.forEach((x) => item({ ...x, e: null }, true)); }
  }
  function openLibraryShow(folder) {
    stack = [{ id: 0, name: 'Files' }, { id: folder.parent.id, name: folder.parent.name }, { id: folder.id, name: folder.name }];
    history.pushState({ d: stack.length }, '');
    show('browser'); loadFolder(folder.id); renderCrumbs();
  }
  // Manage: unfollow / re-follow, and follow by search.
  function renderFollowing() {
    const box = $('#up-following'), fol = followState();
    box.innerHTML = '';
    const rows = upShows.map((x) => ({ id: x.tv.id, name: x.tv.name, on: true }))
      .concat(fol.muted.map((id) => { const c = tvmCache().s[id]; return { id, name: c ? c.d.name : `Show ${id}`, on: false }; }))
      .sort((a, b) => a.name.localeCompare(b.name));
    rows.forEach((r) => {
      const row = document.createElement('div'); row.className = 'up-row';
      const n = document.createElement('span'); n.className = 'small'; n.textContent = r.name + (r.on ? '' : ' (unfollowed)');
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ghost small';
      btn.textContent = r.on ? 'Unfollow' : 'Follow'; btn.dataset.id = String(r.id); btn.dataset.name = r.name; btn.dataset.act = r.on ? 'mute' : 'unmute';
      row.append(n, btn); box.appendChild(row);
    });
  }
  function setFollow(id, name, act) {
    const f = followState();
    f.muted = f.muted.filter((x) => x !== id);
    if (act === 'mute') { f.muted.push(id); f.extra = f.extra.filter((x) => x.id !== id); }
    if (act === 'follow' && !f.extra.some((x) => x.id === id)) f.extra.push({ id, name });
    saveFollow(f);
    loadUpcoming();
  }
  $('#up-following').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) setFollow(Number(b.dataset.id), b.dataset.name, b.dataset.act); });
  let upSearchTimer = null;
  $('#up-q').addEventListener('input', () => {
    clearTimeout(upSearchTimer);
    upSearchTimer = setTimeout(async () => {
      const q = $('#up-q').value.trim(), box = $('#up-results');
      if (q.length < 2) { box.innerHTML = ''; return; }
      try {
        const res = (await tvm(`/search/shows?q=${encodeURIComponent(q)}`)) || [];
        box.innerHTML = '';
        res.slice(0, 8).forEach(({ show: s }) => {
          const row = document.createElement('div'); row.className = 'up-row';
          const n = document.createElement('span'); n.className = 'small';
          n.textContent = `${s.name}${s.premiered ? ` (${s.premiered.slice(0, 4)})` : ''}${s.status ? ' · ' + s.status : ''}`;
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'small'; btn.textContent = 'Follow';
          btn.addEventListener('click', () => { $('#up-q').value = ''; box.innerHTML = ''; setFollow(s.id, s.name, 'follow'); });
          row.append(n, btn); box.appendChild(row);
        });
        if (!res.length) box.innerHTML = '<span class="small muted">No shows found.</span>';
      } catch (e) { box.innerHTML = `<span class="small err">Search failed (${e.message}).</span>`; }
    }, 350);
  });

  /* ---------- episode titles for TV files ("S2 E8 · The Basic Oneness of Everything") ---------- */
  let epNames = { show: null, map: null }; // map "s-e" -> title for the show on screen
  function epLabel(f) {
    if (f.file_type !== 'VIDEO' || !isTvSection() || stack.length < 3) return null;
    const p = parseRelease(f.name);
    if (p.season == null || p.episode == null) return null;
    const t = epNames.show === showFolderTitle() && epNames.map ? epNames.map.get(`${p.season}-${p.episode}`) : null;
    return `S${p.season} E${p.episode} · ${t || 'Episode ' + p.episode}`;
  }
  async function loadEpNames() {
    const show = showFolderTitle();
    if (!show || !isTvSection() || (epNames.show === show && epNames.map)) return false;
    epNames = { show, map: null };
    try {
      const id = await matchShow(show); if (!id) return false;
      const s = await showEpisodes(id); if (!s) return false;
      if (epNames.show !== show) return false;
      epNames.map = new Map(s.eps.filter((e) => e.name && !/^episode \d+$/i.test(e.name)).map((e) => [`${e.s}-${e.n}`, e.name]));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- search (whole put.io account) ---------- */
  let searching = false, results = [], searchSeq = 0, searchTimer = null;
  function openSearch() {
    toggleMenu(false); toggleSettings(false); toggleDownloads(false);
    if (playerOpen) return; // search from the folder screens
    if (el.browser.hidden) show('browser'); // results show in the folder view
    searching = true;
    $('#addbar').hidden = true; $('#playbar').hidden = true;
    el.searchbar.hidden = false; el.searchbtn.setAttribute('aria-expanded', 'true');
    el.q.focus();
    if (el.q.value.trim().length >= 2) runSearch();
  }
  function closeSearch() {
    if (!searching && el.searchbar.hidden) return;
    searching = false; results = [];
    el.searchbar.hidden = true; el.searchbtn.setAttribute('aria-expanded', 'false');
    if (!playerOpen && token) renderList();
  }
  el.searchbtn.addEventListener('click', () => (searching ? closeSearch() : openSearch()));
  el.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 350);
  });
  el.q.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
  async function runSearch() {
    const q = el.q.value.trim(), seq = ++searchSeq;
    if (q.length < 2) { results = []; if (searching) renderResults('Type at least 2 letters.'); return; }
    renderResults('Searching…');
    try {
      const r = await api('/files/search', { params: { query: q, per_page: 100 } });
      if (seq !== searchSeq || !searching) return;
      const hide = el.hidenp.checked;
      results = (r.files || []).filter((f) => !hide || f.file_type === 'FOLDER' || isPlayable(f))
        .sort((a, b) => (a.file_type === 'FOLDER' ? 0 : 1) - (b.file_type === 'FOLDER' ? 0 : 1));
      renderResults(results.length ? '' : 'Nothing found.');
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      if (seq === searchSeq) renderResults(`Search failed (${e.message}).`);
    }
  }
  function renderResults(msg) {
    el.list.innerHTML = ''; el.list.classList.remove('grid');
    el.crumbs.innerHTML = '<span class="here">Search results</span>';
    if (el.finfo) el.finfo.hidden = true;
    if (msg) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = msg; el.list.appendChild(d); return; }
    results.forEach((f, i) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'row'; row.dataset.result = String(i);
      const k = kindIcon(f);
      const n = document.createElement('span'); n.className = 'name'; n.textContent = f.name;
      const m = document.createElement('span'); m.className = 'meta'; m.textContent = f.file_type === 'FOLDER' ? '' : fmtSize(f.size);
      row.append(k, n, m);
      el.list.appendChild(row);
    });
  }
  // Open a result where it lives: rebuild its folder path, then open the folder (or play the file).
  async function openResult(f) {
    const folderId = f.file_type === 'FOLDER' ? f.id : f.parent_id;
    const chain = [];
    try {
      let id = folderId;
      while (id && chain.length < 12) {
        const r = await api(`/files/${id}`);
        chain.unshift({ id, name: r.file.name });
        id = r.file.parent_id;
      }
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      setStatus(`Could not open that (${e.message}).`, 'bad'); return;
    }
    closeSearch();
    stack = [{ id: 0, name: 'Files' }, ...chain];
    history.pushState({ d: stack.length }, '');
    await loadFolder(folderId); renderCrumbs();
    if (f.file_type !== 'FOLDER') {
      const g = files.find((x) => x.id === f.id);
      if (g && isPlayable(g)) openFile(g);
    }
  }

  // Which top-level folders the main screen shows, by put.io folder id.
  // Ticked top-level folders, in the order the main screen shows them (put.io folder ids).
  function rootOrder() {
    try { const a = JSON.parse(store.get(KEY_ROOTDIRS) || '[]'); return Array.isArray(a) ? a.map(Number) : []; } catch (e) { return []; }
  }
  function rootPicks() { return new Set(rootOrder()); }
  function saveRootOrder(ids) {
    store.set(KEY_ROOTDIRS, JSON.stringify(ids));
    renderRootDirs();
    if (stack.length === 1 && !playerOpen) loadFolder(0);
  }
  let rootDirs = [];
  async function loadRootDirs() {
    if (!token) return;
    try {
      const r = await api('/files/list', { params: { parent_id: 0, per_page: 1000 } });
      rootDirs = (r.files || []).filter((f) => f.file_type === 'FOLDER');
      renderRootDirs();
    } catch (e) {
      el.rootdirs.innerHTML = '';
      const s = document.createElement('span'); s.className = 'small err'; s.textContent = `Could not load folders (${e.message}).`;
      el.rootdirs.appendChild(s);
    }
  }
  // Ticked folders first in their chosen order (with up/down), then the rest A-Z.
  function renderRootDirs() {
    el.rootdirs.innerHTML = '';
    if (!rootDirs.length) { el.rootdirs.innerHTML = '<span class="small muted">No folders found.</span>'; return; }
    const order = rootOrder().filter((id) => rootDirs.some((d) => d.id === id));
    const byId = new Map(rootDirs.map((d) => [d.id, d]));
    const rest = rootDirs.filter((d) => !order.includes(d.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    [...order.map((id) => byId.get(id)), ...rest].forEach((d) => {
      const pos = order.indexOf(d.id);
      const row = document.createElement('div'); row.className = 'dirrow';
      const l = document.createElement('label'); l.className = 'toggle';
      const c = document.createElement('input'); c.type = 'checkbox'; c.value = String(d.id); c.checked = pos >= 0;
      l.append(c, ' ' + d.name);
      row.appendChild(l);
      if (pos >= 0) {
        [['up', '▲', pos === 0], ['down', '▼', pos === order.length - 1]].forEach(([dir, txt, off]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost small mv';
          b.textContent = txt; b.dataset.move = dir; b.dataset.id = String(d.id); b.disabled = off;
          b.setAttribute('aria-label', `Move ${d.name} ${dir}`);
          row.appendChild(b);
        });
      }
      el.rootdirs.appendChild(row);
    });
  }
  el.rootdirs.addEventListener('change', (e) => {
    const id = Number(e.target.value); if (!id) return;
    const order = rootOrder().filter((x) => x !== id);
    if (e.target.checked) order.push(id); // newly ticked goes last
    saveRootOrder(order);
  });
  el.rootdirs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-move]'); if (!b) return;
    const order = rootOrder(), id = Number(b.dataset.id), i = order.indexOf(id), j = b.dataset.move === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveRootOrder(order);
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
  // Line icons instead of DIR / VID / AUD badges (stroke = currentColor, so they follow the theme).
  const ICONS = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m9 3 3 3 3-3M8 21h8"/>',
    popcorn: '<path d="M6 10h12l-1.6 11H7.6z"/><path d="M10 10l.4 11M14 10l-.4 11"/><path d="M6 10a2.4 2.4 0 0 1 .8-4.6 3 3 0 0 1 5.2-1.8 3 3 0 0 1 5.2 1.8A2.4 2.4 0 0 1 18 10"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    play: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    doc: '<path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    file: '<path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/>',
  };
  function iconName(f) {
    if (f.file_type === 'FOLDER') {
      const n = f.name.trim();
      if (/^(tv( shows?)?|series)$/i.test(n)) return 'tv';
      if (/^(movies?|films?)$/i.test(n)) return 'popcorn';
      if (/audio ?books?/i.test(n)) return 'headphones';
      if (/music|podcast|soundcloud|tracks/i.test(n)) return 'music';
      return 'folder';
    }
    return ({ VIDEO: 'play', AUDIO: 'music', IMAGE: 'image', PDF: 'doc', TEXT: 'doc', ARCHIVE: 'box' })[f.file_type] || 'file';
  }
  function kindIcon(f) {
    const k = document.createElement('span'), name = iconName(f);
    k.className = 'kind' + (f.file_type === 'VIDEO' ? ' vid' : '') + (f.file_type === 'FOLDER' ? ' folder' : '');
    k.setAttribute('aria-label', kindLabel(f.file_type)); k.title = kindLabel(f.file_type);
    k.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return k;
  }
  function kindLabel(t) {
    return ({ FOLDER: 'DIR', VIDEO: 'VID', AUDIO: 'AUD', IMAGE: 'IMG', PDF: 'PDF', TEXT: 'TXT', ARCHIVE: 'ZIP' })[t] || 'FILE';
  }
  const isPlayable = (f) => f.file_type === 'VIDEO' || f.file_type === 'AUDIO';
  function savePending() { store.set(KEY_PENDING, JSON.stringify(pending)); }
  function setStatus(msg, cls) { el.status.textContent = msg; el.status.className = 'status' + (cls ? ' ' + cls : ''); }
  // Header: a folder name inside folders; the app icon on the main screen and in the player.
  function setTitle(text) {
    el.title.textContent = text;
    el.logo.hidden = !!text;
  }
  function show(view) {
    el.login.hidden = view !== 'login';
    el.browser.hidden = view !== 'browser';
    el.player.hidden = view !== 'player';
    el.upcoming.hidden = view !== 'upcoming';
    el.home.hidden = view !== 'home';
    // Bottom tabs: hidden on sign-in and in the player (like Plex).
    const tabsOn = view !== 'login' && view !== 'player';
    el.tabs.hidden = !tabsOn; document.body.classList.toggle('has-tabs', tabsOn);
    const active = view === 'home' ? 'home' : view === 'upcoming' ? 'upcoming' : view === 'browser' ? 'library' : '';
    el.tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === active));
    // Settings and Sign out live in the ☰ menu now; their old header buttons stay hidden.
    el.signout.hidden = true;
    el.cog.hidden = true;
    el.menubtn.hidden = view === 'login';
    el.searchbtn.hidden = view === 'login';
    el.dlbtn.hidden = view === 'login' || !offSupported;
    if (view === 'login') { toggleSettings(false); toggleDownloads(false); toggleMenu(false); closeSearch(); }
    el.back.hidden = view === 'home' || (view !== 'player' && view !== 'upcoming' && stack.length < 2);
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
      historyPos(id, secs);
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
  // A show folder in TV Shows (Files / TV Shows / <show>): pull the episodes out of its season
  // folders and bulk-season packs into one list, sorted by season and episode, each tagged with
  // a season heading. Subtitle/sample/extras folders are skipped. Returns true if it flattened.
  const isTvSection = () => stack.length > 1 && /^(tv( shows?)?|series)$/i.test(stack[1].name.trim());
  async function flattenShow(id) {
    if (!el.flatten.checked || stack.length !== 3 || !isTvSection() || stack[2].id !== id) return false;
    const subs = files.filter((f) => f.file_type === 'FOLDER' && !/^(subs?|subtitles?|samples?|extras?|featurettes?|bonus)$/i.test(f.name.trim()));
    if (!subs.length) return false;
    const lists = await pool(subs, 3, async (d) => {
      try { return ((await api('/files/list', { params: { parent_id: d.id, per_page: 1000 } })).files || []).map((f) => ({ ...f, _from: d.name })); }
      catch (e) { return []; }
    });
    const loose = files.filter((f) => f.file_type !== 'FOLDER');
    const eps = lists.flat().filter((f) => f.file_type !== 'FOLDER');
    const seasonOf = (f) => { const p = parseRelease(f.name); if (p.season != null) return p.season; const m = /season\s*(\d+)|\bS(\d{1,2})\b/i.exec(f._from || ''); return m ? Number(m[1] || m[2]) : null; };
    const all = [...loose, ...eps].map((f) => { const s = seasonOf(f); return { ...f, _season: s, _group: s != null ? `Season ${s}` : (f._from || '') }; });
    all.sort((a, b) => ((a._season ?? 999) - (b._season ?? 999)) || ((parseRelease(a.name).episode ?? 999) - (parseRelease(b.name).episode ?? 999))
      || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    files = all;
    return true;
  }

  async function loadFolder(id) {
    el.list.innerHTML = '<div class="empty">Loading&hellip;</div>';
    try {
      const r = await api('/files/list', { params: { parent_id: id, per_page: 1000 } });
      files = (r.files || []).slice().sort((a, b) => {
        const fa = a.file_type === 'FOLDER' ? 0 : 1, fb = b.file_type === 'FOLDER' ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      if (await flattenShow(id)) { if (stack[stack.length - 1].id !== id) return; }
      // Main screen only: keep just the folders ticked in Settings (none ticked = show all).
      const picked = rootPicks();
      if (id === 0 && picked.size) {
        const order = rootOrder();
        files = files.filter((f) => picked.has(f.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      renderList();
      loadFolderInfo();
      if (isTvSection() && stack.length >= 3) loadEpNames().then((ok) => {
        if (!ok) return;
        if (!playerOpen && !searching && stack[stack.length - 1].id === id) renderList();
        if (playerOpen && current) { // the player opened before the titles arrived
          const lbl = epLabel(current), showT = parseRelease(showFolderTitle() || '').title;
          if (lbl) { el.ptitle.textContent = `${showT} · ${lbl}`; setMediaSession({ title: lbl, artist: showT }); }
        }
      });
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
      el.list.innerHTML = ''; el.list.classList.remove('grid');
      const d = document.createElement('div');
      // No connection (aeroplane mode etc.): point to what still works, the saved downloads.
      if (!navigator.onLine || e instanceof TypeError) {
        d.className = 'empty';
        d.innerHTML = '<strong>You\'re offline</strong><br><span class="small">Folders need a connection. Anything you saved is in Offline downloads.</span><br>';
        if (offSupported) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.style.marginTop = '12px';
          b.textContent = 'Open offline downloads'; b.addEventListener('click', () => toggleDownloads(true));
          d.appendChild(b);
        }
      } else {
        d.className = 'empty err'; d.textContent = `Could not load this folder (${e.message}).`;
      }
      el.list.appendChild(d);
    }
  }
  // Back online: reload the folder that failed.
  window.addEventListener('online', () => { if (token && !playerOpen && !searching && !el.list.querySelector('.row')) loadFolder(stack[stack.length - 1].id); });

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
    setTitle(stack.length > 1 ? stack[stack.length - 1].name : '');
    el.back.hidden = stack.length < 2;
    updateAddBar();
  }

  /* ---------- add a download (magnet / .torrent link) into this folder ---------- */
  // Shown in Movies / TV Shows and every folder below them (a show, a season...), which save
  // into the folder you're in; and in the podcasts folder, which always saves into its
  // "to_sort" folder so the server's sorter converts and files it.
  const isPodcastSection = () => stack.length > 1 && /podcast/i.test(stack[1].name);
  let addFor = null;
  function updateAddBar() {
    const bar = $('#addbar'); if (!bar) return;
    const show = !!token && !searching && stack.length >= 2 && (isFilmTvSection() || isPodcastSection());
    bar.hidden = !show;
    const here = stack[stack.length - 1];
    if (addFor !== here.id) { addFor = here.id; $('#addform').hidden = true; $('#addmsg').textContent = ''; }
    $('#addwhere').textContent = isPodcastSection()
      ? `Saves into: ${stack[1].name} / to_sort (the sorter converts and files it)`
      : `Saves into: ${stack.slice(1).map((s) => s.name).join(' / ')}`;
  }
  // Where a pasted link goes: the podcasts "to_sort" folder, else the folder you're in.
  async function addTarget() {
    const here = stack[stack.length - 1];
    if (!isPodcastSection()) return here;
    if (here.name === 'to_sort') return here;
    const r = await api('/files/list', { params: { parent_id: stack[1].id, per_page: 1000 } });
    const ts = (r.files || []).find((f) => f.file_type === 'FOLDER' && f.name.toLowerCase() === 'to_sort');
    return ts ? { id: ts.id, name: `${stack[1].name} / to_sort` } : here;
  }
  $('#addbtn').addEventListener('click', () => {
    const f = $('#addform'); f.hidden = !f.hidden;
    if (!f.hidden) { $('#addurl').value = ''; $('#addmsg').textContent = ''; $('#addurl').focus(); }
  });
  $('#addcancel').addEventListener('click', () => { $('#addform').hidden = true; });
  $('#addform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('#addurl').value.trim(), msg = $('#addmsg');
    if (!/^magnet:\?/i.test(url) && !/^https?:\/\//i.test(url)) { msg.className = 'bad'; msg.textContent = 'Paste a magnet link (magnet:?…) or a link to a .torrent file.'; return; }
    msg.className = ''; msg.textContent = 'Sending to put.io…';
    try {
      const folder = await addTarget();
      const r = await api('/transfers/add', { method: 'POST', params: { url, save_parent_id: folder.id } });
      const t = (r && r.transfer) || {};
      const name = t.name || (/[?&]dn=([^&]+)/i.exec(url) ? decodeURIComponent(/[?&]dn=([^&]+)/i.exec(url)[1].replace(/\+/g, ' ')) : 'Download');
      msg.className = 'ok';
      msg.textContent = `Added to put.io: ${name}${t.status ? ` (${t.status.toLowerCase().replace(/_/g, ' ')})` : ''}. It will appear in ${folder.name} when it finishes.`;
      $('#addform').hidden = true;
    } catch (err) {
      if (err.auth) return logout('Your token was rejected. Connect again.');
      msg.className = 'bad'; msg.textContent = `put.io didn't accept that link (${err.message}).`;
    }
  });

  // Poster grid: the shows/films directly inside a Movies or TV Shows folder.
  const gridMode = () => el.grid.checked && stack.length === 2 && isFilmTvSection();
  let posterObs = null, posterQueue = [], postersBusy = 0;
  function renderGrid(hide) {
    el.list.classList.add('grid');
    const hasKey = !!store.get(KEY_OMDB);
    if (posterObs) posterObs.disconnect();
    posterQueue = [];
    posterObs = hasKey && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { posterObs.unobserve(en.target); posterQueue.push(en.target); } });
      pumpPosters();
    }, { rootMargin: '300px' }) : null;
    files.forEach((f, i) => {
      if (hide && f.file_type !== 'FOLDER' && !isPlayable(f)) return;
      const p = parseRelease(f.name);
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'row tile'; t.dataset.index = String(i);
      const box = document.createElement('div'); box.className = 'pimg'; box.textContent = p.title || f.name;
      const nm = document.createElement('div'); nm.className = 'tname'; nm.textContent = p.title || f.name;
      const meta = document.createElement('div'); meta.className = 'tmeta'; meta.textContent = p.year || '';
      const sv = offSupported && offMeta()[f.id];
      if (sv) { const s = document.createElement('span'); s.className = 'saved'; s.textContent = sv.done ? '⤓' : '⤓…'; meta.appendChild(s); }
      t.append(box, nm, meta);
      el.list.appendChild(t);
      if (posterObs && p.title) { t.dataset.title = p.title; t.dataset.year = p.year; posterObs.observe(t); }
    });
  }
  // A few OMDb lookups at a time, for tiles that are on (or near) the screen.
  function pumpPosters() {
    while (postersBusy < 3 && posterQueue.length) {
      const t = posterQueue.shift();
      if (!t.isConnected) continue;
      postersBusy++;
      const { title, year } = t.dataset;
      (async () => {
        try {
          const r = await omdb({ t: title, y: year, type: 'series' }) || await omdb({ t: title, y: year, type: 'movie' });
          if (!r || !t.isConnected) return;
          const url = na(r.Poster);
          if (posterOk(url)) { const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = url; t.querySelector('.pimg').appendChild(img); }
          const meta = t.querySelector('.tmeta'), keep = meta.querySelector('.saved');
          meta.textContent = na(r.Year) || year || '';
          if (na(r.imdbRating)) { const st = document.createElement('span'); st.className = 'star'; st.textContent = ` ★ ${r.imdbRating}`; meta.appendChild(st); }
          if (keep) meta.appendChild(keep);
        } catch (e) { /* leave the plain tile */ } finally { postersBusy--; pumpPosters(); }
      })();
    }
  }

  function renderList() {
    if ($('#playbar')) updatePlaybar();
    // While search is open the list shows results; background refreshes mustn't replace them.
    if (searching) { renderResults(results.length ? '' : (el.q.value.trim().length >= 2 ? 'Nothing found.' : 'Type to search.')); return; }
    renderCrumbs();
    el.list.innerHTML = '';
    el.list.classList.remove('grid');
    const hide = el.hidenp.checked;
    const visible = files.filter((f) => !hide || f.file_type === 'FOLDER' || isPlayable(f));
    if (!visible.length) {
      const d = document.createElement('div'); d.className = 'empty';
      d.textContent = files.length ? 'No playable files here.' : 'This folder is empty.';
      el.list.appendChild(d); return;
    }
    if (gridMode()) { renderGrid(hide); return; }
    let lastGroup = null;
    const groups = new Set(files.filter((f) => !hide || isPlayable(f)).map((f) => f._group || ''));
    files.forEach((f, i) => {
      if (hide && f.file_type !== 'FOLDER' && !isPlayable(f)) return;
      // Season headings in a flattened show (only when there's more than one group).
      if (f._group !== undefined && groups.size > 1 && f._group !== lastGroup) {
        lastGroup = f._group;
        const g = document.createElement('div'); g.className = 'grouphdr'; g.textContent = f._group || 'Other';
        el.list.appendChild(g);
      }
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'row'; row.dataset.index = String(i);
      const k = kindIcon(f);
      const n = document.createElement('span'); n.className = 'name';
      const lbl = epLabel(f);
      n.textContent = lbl || f.name;
      if (lbl) { n.title = f.name; n.classList.add('ep'); }
      const sv = offSupported && offMeta()[f.id];
      if (sv) { const s = document.createElement('span'); s.className = 'saved'; s.textContent = sv.done ? '⤓ saved' : '⤓ saving'; n.appendChild(s); }
      const m = document.createElement('span'); m.className = 'meta';
      m.textContent = f.file_type === 'FOLDER' ? '' : fmtSize(f.size);
      const pos = pending[f.id] != null ? pending[f.id] : f.start_from;
      if (isPlayable(f) && pos > 0) {
        const r = document.createElement('span'); r.className = 'resume'; r.textContent = 'at ' + fmtTime(pos); m.prepend(r);
      }
      row.append(k, n, m);
      if (isPlayable(f) && isPlayed(f.id)) n.classList.add('played');
      if (isPlayable(f)) {
        const pl = document.createElement('span');
        pl.className = 'pl' + (isPlayed(f.id) ? ' on' : ''); pl.setAttribute('role', 'button'); pl.tabIndex = 0;
        pl.title = isPlayed(f.id) ? 'Played (tap to mark unplayed)' : 'Mark played';
        pl.setAttribute('aria-label', (isPlayed(f.id) ? 'Mark unplayed: ' : 'Mark played: ') + f.name);
        pl.textContent = '✓';
        row.appendChild(pl);
      }
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
    if (keys.length > 1500) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 1500).forEach((k) => delete cache[k]);
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
  const posterOk = (url) => !!url && (url.startsWith('https://m.media-amazon.com/') || url.startsWith('https://api.put.io/') || url.startsWith('https://static.tvmaze.com/'));
  function setPoster(img, url) {
    if (posterOk(url)) { img.src = url; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    // The player's own poster too: stays up for audio, shows until a video starts.
    if (img === el.poster) {
      if (posterOk(url)) el.video.poster = url; else el.video.removeAttribute('poster');
      if (posterOk(url) && current) historyArt(current.id, url);
      if (posterOk(url) && current && offSupported) { const m = offMeta(); if (m[current.id] && !m[current.id].poster) { m[current.id].poster = url; offSaveMeta(m); } }
      setMediaSession({ art: posterOk(url) ? url : '' });
    }
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
      setMediaSession({ title: ep ? `S${p.season}E${p.episode} ${na(ep.Title)}`.trim() : main.Title, artist: ep ? main.Title : na(main.Year) });
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
  // The next playable file after the current one, in the folder's list order.
  function nextFile() {
    const i = current ? files.indexOf(current) : -1;
    if (i < 0) return null;
    if (shuffleActive()) {
      const q = shuffleQueue.indexOf(current.id);
      for (let k = q + 1; k > 0 && k < shuffleQueue.length; k++) { const f = files.find((x) => x.id === shuffleQueue[k]); if (f) return f; }
      return null;
    }
    return files.slice(i + 1).find(isPlayable) || null;
  }

  /* ---------- shuffle (audio) ---------- */
  // Remembered per device. The queue is the folder's tracks in random order, current first.
  const KEY_SHUFFLE = 'resume.shuffle';
  const KEY_MUSICOFF = 'resume.musicoff';
  // Global: keep every music track you play on the phone (podcasts excluded). Off unless switched on.
  const musicOffEl = $('#musicoff');
  musicOffEl.checked = store.get(KEY_MUSICOFF) === 'on';
  musicOffEl.addEventListener('change', () => store.set(KEY_MUSICOFF, musicOffEl.checked ? 'on' : 'off'));
  const isMusicTrack = (f) => f && f.file_type === 'AUDIO' && !isPodcastSection();
  const KEY_PODOFF = 'resume.podoff';
  const podOffEl = $('#podoff');
  podOffEl.checked = store.get(KEY_PODOFF) === 'on';
  podOffEl.addEventListener('change', () => store.set(KEY_PODOFF, podOffEl.checked ? 'on' : 'off'));
  // Keep this track permanently? (music or podcast, per its own setting)
  const keepOffline = (f) => f && f.file_type === 'AUDIO' && (isPodcastSection() ? podOffEl.checked : musicOffEl.checked);
  // Folder button: save every track here for offline (queued, one at a time).
  $('#saveall').addEventListener('click', () => {
    const tracks = files.filter((f) => f.file_type === 'AUDIO' && offSource(f) && !offMeta()[f.id]);
    const b = $('#saveall');
    if (!offSupported) { b.textContent = 'Offline saving not supported here'; return; }
    if (!tracks.length) { b.textContent = '⤓ All saved'; return; }
    tracks.forEach((f) => saveOffline(f));
    b.textContent = `⤓ Saving ${tracks.length}…`;
  });
  let shuffleOn = store.get(KEY_SHUFFLE) === 'on', shuffleQueue = [];
  const shuffleActive = () => shuffleOn && current && current.file_type === 'AUDIO' && shuffleQueue.includes(current.id);
  function buildShuffle(firstId) {
    const ids = files.filter((f) => f.file_type === 'AUDIO').map((f) => f.id).filter((id) => id !== firstId);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    shuffleQueue = firstId != null ? [firstId, ...ids] : ids;
  }
  function setShuffle(on) {
    shuffleOn = on; store.set(KEY_SHUFFLE, on ? 'on' : 'off');
    if (on && current) buildShuffle(current.id);
    updateShuffleBtn();
  }
  function updateShuffleBtn() {
    const b = $('#shuffle'); if (!b) return;
    b.hidden = !current || current.file_type !== 'AUDIO';
    b.setAttribute('aria-pressed', String(!!shuffleOn));
    el.next.hidden = !nextFile();
  }
  $('#shuffle').addEventListener('click', () => setShuffle(!shuffleOn));
  // Folder buttons: Play all (in order) / Shuffle (random start, random order).
  function updatePlaybar() {
    const tracks = files.filter((f) => f.file_type === 'AUDIO');
    $('#playbar').hidden = searching || tracks.length < 2 || gridMode();
    const sb = $('#saveall');
    sb.hidden = !offSupported;
    const left = tracks.filter((f) => !(offMeta()[f.id] && offMeta()[f.id].done)).length;
    sb.textContent = left ? '⤓ Save all offline' : '⤓ All saved';
  }
  $('#playall').addEventListener('click', () => {
    const first = files.find((f) => f.file_type === 'AUDIO'); if (!first) return;
    shuffleOn = false; store.set(KEY_SHUFFLE, 'off');
    openFile(first, { next: true });
  });
  $('#shuffleall').addEventListener('click', () => {
    const tracks = files.filter((f) => f.file_type === 'AUDIO'); if (!tracks.length) return;
    const first = tracks[Math.floor(Math.random() * tracks.length)];
    shuffleOn = true; store.set(KEY_SHUFFLE, 'on');
    buildShuffle(first.id);
    openFile(first, { next: true });
  });

  let forcePlay = false; // playing on from the previous file: start even if Auto-start is off
  let playerFrom = 'browser'; // the screen Back returns to
  async function openFile(f, opts = {}) {
    if (!playerOpen) playerFrom = opts.from || (!el.home.hidden ? 'home' : !el.upcoming.hidden ? 'upcoming' : 'browser');
    current = f;
    recordHistory(f);
    lastSaveAt = 0; lastSavedSecs = -1;
    forcePlay = !!opts.next;
    // Moving on to the next file replaces the player entry, so Back still goes to the folder.
    if (playerOpen) history.replaceState({ d: stack.length, p: 1 }, '');
    else history.pushState({ d: stack.length, p: 1 }, '');
    playerOpen = true;
    show('player');
    setTitle('');
    if (f.file_type === 'AUDIO' && shuffleOn && !shuffleQueue.includes(f.id)) buildShuffle(f.id);
    updateShuffleBtn();
    if (el.markplayed) el.markplayed.textContent = isPlayed(f.id) ? 'Mark unplayed' : 'Mark played';
    const lbl = epLabel(f), showT = parseRelease(showFolderTitle() || '').title;
    setMediaSession({ title: lbl || f.name.replace(/\.[a-z0-9]{2,4}$/i, ''), artist: showT || showFolderTitle() || stack[stack.length - 1].name, art: '' });
    el.ptitle.textContent = lbl ? `${showT} · ${lbl}` : f.name;
    el.ptitle.title = f.name;
    el.mp4.hidden = true;
    destroyHls();
    clearSubtitles();
    el.video.removeAttribute('poster');
    setStatus('Loading…');

    let start = pending[f.id] != null ? pending[f.id] : (f.start_from || 0);
    try {
      const fresh = await api(`/files/${f.id}`);
      if (fresh && fresh.file && pending[f.id] == null) start = fresh.file.start_from || 0;
    } catch (e) {
      if (e.auth) return logout('Your token was rejected. Connect again.');
    }
    f.start_from = start;

    revokeLocal();
    const localUrl = await offlineUrl(f.id);
    updateSaveButton(f);
    if (localUrl) {
      // Saved for offline: play the phone's copy, no stream link needed.
      current.localUrl = localUrl;
      el.download.href = '#';
      const filmTv = isFilmTvSection();
      el.imdb.hidden = !filmTv;
      if (filmTv && navigator.onLine) { el.imdb.href = imdbSearchUrl(f); loadInfo(f); } else if (!filmTv) showCoverInfo();
      const pm = offMeta()[f.id];
      if (pm && pm.poster && !el.video.getAttribute('poster')) setPoster(el.poster, pm.poster);
      kinds = ['local'];
      playKind(0, start > MIN_SAVE_SECONDS ? `Resuming at ${fmtTime(start)} from the saved copy` : 'Playing the saved copy');
      if (f.file_type === 'VIDEO' && filmTv && navigator.onLine) loadSubtitles(f);
      return;
    }

    try {
      const r = await api(`/files/${f.id}/url`);
      f.direct = r.url;
      el.download.href = dlUrl(f);
      const filmTv = isFilmTvSection();
      el.imdb.hidden = !filmTv;
      if (filmTv) { el.imdb.href = imdbSearchUrl(f); loadInfo(f); } else showCoverInfo();
      el.vlc.hidden = true; // Open in VLC button turned off; formats fall back automatically instead
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
    // Buffer ahead for audio: save the whole file to the phone (kept for re-opens,
    // tidied up automatically); playback moves to it once it's complete.
    if (keepOffline(f) && offSupported && offSource(f)) saveOffline(f);
    else if (f.file_type === 'AUDIO' && el.bufahead.checked && offSupported && offSource(f)) saveOffline(f, { auto: true });
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
  const KIND_LABEL = { direct: 'original file', mp4: 'put.io MP4', hls: 'put.io stream', local: 'saved copy' };
  function destroyHls() { if (hls) { hls.destroy(); hls = null; } }
  function srcFor(kind) {
    if (kind === 'local') return current.localUrl;
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
    el.mp4.hidden = true; // format switch button turned off; nextKind() still falls back on errors
    el.mp4.textContent = `Format: ${KIND_LABEL[kind]}. Switch`;
    if (el.autoplay.checked || wasPlaying || forcePlay) {
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
    // Audio being saved to the phone (Buffer ahead or Save offline): show its progress.
    const sv = playerOpen && current && current.file_type === 'AUDIO' && offSupported ? offMeta()[current.id] : null;
    if (sv) {
      el.buf.hidden = false;
      const act = offActive && offActive.id === current.id && offActive.total;
      el.buf.textContent = sv.done ? 'Fully downloaded: safe without signal'
        : act ? `Downloading for offline: ${Math.floor((offActive.got / offActive.total) * 100)}%${offActive.waiting ? ' (waiting for signal)' : ''}`
        : 'Waiting to download…';
      return;
    }
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
    const om = offSupported && offMeta()[id];
    if (om && om.auto && om.done) deleteOffline(id);
    historyFinished(id, nextFile());
    setPlayed(id, true);
    const n = el.playnext.checked ? nextFile() : null;
    if (n && current.id === id) { openFile(n, { next: true }); return; }
    setStatus('Finished. Position cleared.');
  });
  async function playNext() {
    const n = nextFile(); if (!n) return;
    await saveNow(false);
    openFile(n, { next: true });
  }
  el.next.addEventListener('click', playNext);

  /* ---------- offline downloads (Movies / TV Shows) ---------- */
  // Saved into the app's private storage (OPFS) in ~32 MB parts, so a dropped signal or a
  // closed app loses at most one part; the download resumes from the last finished part.
  // Saves the version the browser can play: the original if it's MP4/WebM, else put.io's MP4.
  const KEY_OFFLINE = 'resume.offline';
  const PART = 32 * 1024 * 1024;
  const offSupported = !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemFileHandle && FileSystemFileHandle.prototype.createWritable);
  const offMeta = () => { try { return JSON.parse(store.get(KEY_OFFLINE) || '{}') || {}; } catch (e) { return {}; } };
  const offSaveMeta = (m) => store.set(KEY_OFFLINE, JSON.stringify(m));
  const partName = (id, i) => `ep-${id}.${String(i).padStart(4, '0')}`;
  let offQueue = [], offActive = null, localUrlNow = null;

  function revokeLocal() { if (localUrlNow) { URL.revokeObjectURL(localUrlNow); localUrlNow = null; } }
  async function partFiles(id) {
    const dir = await navigator.storage.getDirectory(), out = [];
    for await (const [name, handle] of dir.entries()) if (name.startsWith(`ep-${id}.`)) out.push([name, handle]);
    out.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
  }
  async function offlineUrl(id) {
    const it = offMeta()[id];
    if (!offSupported || !it || !it.done) return null;
    try {
      const files = await Promise.all((await partFiles(id)).map(([, h]) => h.getFile()));
      if (!files.length) return null;
      localUrlNow = URL.createObjectURL(new Blob(files, { type: it.mime || 'video/mp4' }));
      return localUrlNow;
    } catch (e) { return null; }
  }
  const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'];
  const AUTO_KEEP = 5; // automatic audio copies kept (Buffer ahead)
  function offSource(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (f.file_type === 'AUDIO') return AUDIO_EXT.includes(ext) ? 'direct' : null;
    if (['mp4', 'm4v', 'webm'].includes(ext)) return 'direct';
    if (f.is_mp4_available) return 'mp4';
    return null;
  }
  function updateSaveButton(f) {
    const show = f && offSupported && ((f.file_type === 'VIDEO' && isFilmTvSection()) || f.file_type === 'AUDIO');
    el.save.hidden = !show;
    if (!show) return;
    const it = offMeta()[f.id];
    el.save.disabled = false;
    if (it && it.auto) el.save.textContent = it.done ? 'Keep offline' : 'Keep offline (buffering)';
    else if (it && it.done) el.save.textContent = 'Saved offline ✓';
    else if (it) el.save.textContent = offActive && offActive.id === f.id && offActive.total
      ? `Saving ${Math.floor((offActive.got / offActive.total) * 100)}%${offActive.waiting ? ' (waiting for signal)' : ''}` : 'Queued…';
    else el.save.textContent = 'Save offline';
  }
  el.save.addEventListener('click', () => {
    if (!current) return;
    const m = offMeta(), it = m[current.id];
    if (it && it.auto) { it.auto = false; offSaveMeta(m); offRefresh(); return; } // keep a buffered copy
    if (it && it.done) { toggleDownloads(true); return; } // manage in the Downloads panel
    if (!it) saveOffline(current);
  });
  async function saveOffline(f, opts = {}) {
    const kind = offSource(f);
    if (!kind) { if (!opts.auto) setStatus("put.io hasn't made an MP4 of this file yet, so it can't be saved for offline.", 'warn'); return; }
    const m = offMeta();
    if (m[f.id]) { if (!opts.auto && m[f.id].auto) { m[f.id].auto = false; offSaveMeta(m); offRefresh(); } return; }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const mime = f.file_type === 'AUDIO' ? ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' })[ext] || 'audio/mpeg'
      : ext === 'webm' ? 'video/webm' : 'video/mp4';
    m[f.id] = { id: f.id, name: f.name, folder: showFolderTitle() || stack[stack.length - 1].name, kind, mime, file_type: f.file_type,
      total: f.size || 0, done: false, auto: !!opts.auto, poster: el.video.getAttribute('poster') || '', at: Date.now() };
    offSaveMeta(m);
    if (opts.auto) pruneAuto(f.id);
    try { if (navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* best effort */ }
    // The file you're playing goes to the front of the queue.
    offQueue = offQueue.filter((x) => x !== f.id);
    if (current && current.id === f.id) offQueue.unshift(f.id); else offQueue.push(f.id);
    offRefresh(); runOfflineQueue();
  }
  // Keep only the newest AUTO_KEEP automatic copies (never the one playing).
  function pruneAuto(keepId) {
    const autos = Object.values(offMeta()).filter((x) => x.auto).sort((a, b) => b.at - a.at);
    autos.slice(AUTO_KEEP).forEach((x) => { if (x.id !== keepId && !(current && current.id === x.id)) deleteOffline(x.id); });
  }
  // A download for the file on screen just finished: carry on from the phone's copy.
  async function swapToLocal(id) {
    if (!current || current.id !== id || !playerOpen || kinds[kindIdx] === 'local') return;
    const url = await offlineUrl(id); if (!url) return;
    const v = el.video, t = v.currentTime, wasPlaying = !v.paused && !v.ended;
    if (t > MIN_SAVE_SECONDS) current.start_from = Math.floor(t);
    current.localUrl = url;
    destroyHls();
    kinds = ['local']; kindIdx = 0;
    v.src = url;
    if (wasPlaying) v.play().catch(() => {});
    showBuffered();
  }
  // Resume unfinished downloads when the app opens.
  function resumeOffline() {
    if (!offSupported) return;
    Object.values(offMeta()).forEach((it) => { if (!it.done && !offQueue.includes(it.id)) offQueue.push(it.id); });
    runOfflineQueue();
  }
  async function runOfflineQueue() {
    if (offActive || !token) return;
    const id = offQueue.shift(); if (id == null) return;
    const it = offMeta()[id]; if (!it || it.done) { runOfflineQueue(); return; }
    const me = offActive = { id, got: 0, total: it.total || 0, ctrl: null, waiting: false };
    const dir = await navigator.storage.getDirectory();
    // Keep only whole parts; the unfinished last one is re-downloaded.
    let parts = await partFiles(id), got = 0, idx = 0;
    for (const [name, h] of parts) {
      const size = (await h.getFile()).size;
      if (size === PART) { got += PART; idx++; } else await dir.removeEntry(name);
    }
    me.got = got;
    let fails = 0, finished = false;
    while (offActive === me && !finished) {
      let w = null, inPart = 0;
      try {
        me.ctrl = new AbortController();
        const u = new URL(`${API}/files/${id}/${it.kind === 'mp4' ? 'mp4/stream' : 'download'}`);
        u.searchParams.set('oauth_token', token);
        const res = await fetch(u, { headers: got ? { Range: `bytes=${got}-` } : {}, signal: me.ctrl.signal });
        if (res.status === 416) { finished = true; break; }
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
        if (got && res.status !== 206) throw new Error('resume not supported');
        const range = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
        me.total = range ? Number(range[1]) : (Number(res.headers.get('content-length')) || 0) + got;
        me.waiting = false; fails = 0;
        const reader = res.body.getReader();
        let last = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let off = 0;
          while (off < value.length) {
            if (!w) { w = await (await dir.getFileHandle(partName(id, idx), { create: true })).createWritable(); inPart = 0; }
            const n = Math.min(PART - inPart, value.length - off);
            await w.write(value.subarray(off, off + n));
            off += n; inPart += n; got += n; me.got = got;
            if (inPart === PART) { await w.close(); w = null; idx++; }
          }
          if (Date.now() - last > 1000) { last = Date.now(); offProgress(); }
        }
        if (w) { await w.close(); w = null; }
        if (!me.total || got >= me.total) finished = true;
      } catch (e) {
        if (w) { try { await w.abort(); } catch (x) { /* ignore */ } }
        if (offActive !== me || e.name === 'AbortError') return;
        if (e.name === 'QuotaExceededError') { setStatus('Not enough space on the phone to save this episode.', 'warn'); break; }
        // Roll back to the last whole part, then wait and resume.
        got -= inPart; me.got = got;
        fails++; me.waiting = true; offProgress();
        await new Promise((r) => setTimeout(r, Math.min(30000, 3000 * fails)));
      }
    }
    if (offActive !== me) return;
    if (finished) { const m = offMeta(); if (m[id]) { m[id].done = true; m[id].total = got; offSaveMeta(m); } }
    offActive = null;
    offRefresh();
    if (finished) swapToLocal(id);
    runOfflineQueue();
  }
  async function deleteOffline(id) {
    if (offActive && offActive.id === id) { const a = offActive; offActive = null; if (a.ctrl) a.ctrl.abort(); }
    offQueue = offQueue.filter((x) => x !== id);
    const m = offMeta(); delete m[id]; offSaveMeta(m);
    try { const dir = await navigator.storage.getDirectory(); for (const [name] of await partFiles(id)) await dir.removeEntry(name); } catch (e) { /* ignore */ }
    offRefresh();
    runOfflineQueue();
  }
  function offProgress() {
    if (current) { updateSaveButton(current); showBuffered(); }
    if (!el.downloads.hidden) renderOffline();
    updateDlBadge();
  }
  function offRefresh() { offProgress(); if (!playerOpen) renderList(); renderOffline(); }
  // Header button shows how many items are saved or downloading.
  function updateDlBadge() {
    const n = offSupported ? Object.keys(offMeta()).length : 0;
    el.dlbtn.textContent = n ? `⤓ ${n}` : '⤓';
  }
  async function renderOffline() {
    updateDlBadge();
    if (!offSupported) { el.offlist.innerHTML = '<span class="small muted">This browser can\'t save files for offline.</span>'; el.offspace.textContent = ''; return; }
    const items = Object.values(offMeta()).sort((a, b) => a.at - b.at);
    el.offlist.innerHTML = '';
    if (!items.length) el.offlist.innerHTML = '<span class="small muted">Nothing saved. Use "Save offline" in the player for a film or episode.</span>';
    items.forEach((it) => {
      const row = document.createElement('div'); row.className = 'offrow';
      const n = document.createElement('span'); n.className = 'offname small';
      const pct = offActive && offActive.id === it.id && offActive.total ? Math.floor((offActive.got / offActive.total) * 100) : null;
      n.textContent = `${it.name} · ${it.done ? fmtSize(it.total) : pct != null ? `${pct}%${offActive.waiting ? ' (waiting for signal)' : ''}` : 'queued'}${it.auto ? ' · buffer' : ''}`;
      n.title = it.name;
      row.appendChild(n);
      if (it.done) { const p = document.createElement('button'); p.type = 'button'; p.className = 'small'; p.textContent = 'Play'; p.dataset.play = String(it.id); row.appendChild(p); }
      const d = document.createElement('button'); d.type = 'button'; d.className = 'ghost small'; d.textContent = 'Delete'; d.dataset.del = String(it.id);
      row.appendChild(d);
      el.offlist.appendChild(row);
    });
    try {
      const est = await navigator.storage.estimate();
      el.offspace.textContent = `Using ${fmtSize(est.usage) || '0 MB'} of about ${fmtSize(est.quota) || '0 MB'} available to the app.`;
    } catch (e) { el.offspace.textContent = ''; }
  }
  el.offlist.addEventListener('click', (e) => {
    const p = e.target.closest('button[data-play]'), d = e.target.closest('button[data-del]');
    if (d) { const it = offMeta()[Number(d.dataset.del)]; if (it && confirm(`Delete the saved copy of "${it.name}"?`)) deleteOffline(it.id); return; }
    if (p) {
      const it = offMeta()[Number(p.dataset.play)]; if (!it) return;
      toggleDownloads(false);
      openFile({ id: it.id, name: it.name, file_type: it.file_type || 'VIDEO', size: it.total, start_from: 0 });
      if ((it.file_type || 'VIDEO') === 'VIDEO' && el.autofs.checked) goFullscreen();
    }
  });

  /* ---------- lock screen / notification (Media Session) ---------- */
  // What the phone shows while playing: title, the folder or show as the second line,
  // and the cover/poster as the picture (the app icon until one is known).
  const ms = { title: '', artist: '', art: '' };
  function setMediaSession(p) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    Object.assign(ms, p);
    const artwork = ms.art
      ? [{ src: ms.art, sizes: '512x512', type: 'image/jpeg' }]
      : [{ src: new URL('icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }];
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: ms.title, artist: ms.artist, artwork }); } catch (e) { /* unsupported */ }
  }
  if ('mediaSession' in navigator) {
    const on = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* unsupported */ } };
    on('play', () => el.video.play().catch(() => {}));
    on('pause', () => el.video.pause());
    on('seekbackward', (d) => { el.video.currentTime = Math.max(0, el.video.currentTime - ((d && d.seekOffset) || 15)); });
    on('seekforward', (d) => { el.video.currentTime = Math.min(el.video.duration || Infinity, el.video.currentTime + ((d && d.seekOffset) || 30)); });
    on('seekto', (d) => { if (d && d.seekTime != null) el.video.currentTime = d.seekTime; });
    on('nexttrack', () => { if (nextFile()) playNext(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(true); });
  window.addEventListener('pagehide', () => saveNow(true));
  window.addEventListener('online', flushPending);

  el.markplayed = $('#markplayed');
  el.markplayed.addEventListener('click', async () => {
    if (!current) return;
    const id = current.id;
    if (isPlayed(id)) { await markUnplayed(id); setStatus('Marked as unplayed. It will start from the beginning.'); return; }
    lastSavedSecs = Math.floor(el.video.currentTime); // the pause below must not re-save it
    el.video.pause(); current.start_from = 0;
    await markPlayed(id);
    setStatus('Marked as played. Saved position cleared.');
  });
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
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    await saveNow(false);
    revokeLocal();
    el.video.pause(); destroyHls(); clearSubtitles();
    el.video.removeAttribute('src'); el.video.removeAttribute('poster'); el.video.load();
    const f = files.find((x) => current && x.id === current.id);
    if (f && current) f.start_from = current.start_from;
    playerOpen = false; current = null;
    if (playerFrom === 'home') { show('home'); renderHome(); }
    else if (playerFrom === 'upcoming') show('upcoming');
    else { show('browser'); renderList(); }
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
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && (e.target.classList.contains('dl') || e.target.classList.contains('del') || e.target.classList.contains('pl'))) {
      e.preventDefault(); e.stopPropagation();
      const f = files[Number(e.target.closest('.row').dataset.index)]; if (!f) return;
      if (e.target.classList.contains('pl')) { if (isPlayed(f.id)) markUnplayed(f.id); else markPlayed(f.id); return; }
      if (e.target.classList.contains('del')) deleteFile(f); else startDownload(f);
    }
  });
  el.list.addEventListener('click', (e) => {
    const res = e.target.closest('.row[data-result]');
    if (res) { const f = results[Number(res.dataset.result)]; if (f) openResult(f); return; }
    const row = e.target.closest('.row'); if (!row) return;
    const f = files[Number(row.dataset.index)]; if (!f) return;
    if (e.target.closest('.dl')) { e.stopPropagation(); startDownload(f); return; }
    if (e.target.closest('.del')) { e.stopPropagation(); deleteFile(f); return; }
    if (e.target.closest('.pl')) { e.stopPropagation(); if (isPlayed(f.id)) markUnplayed(f.id); else markPlayed(f.id); return; }
    if (f.file_type === 'FOLDER') enterFolder(f);
    else if (isPlayable(f)) { openFile(f); if (f.file_type === 'VIDEO' && el.autofs.checked) goFullscreen(); }
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
    if (searching) closeSearch();
    if (!token) return;
    const s = e.state || {};
    if (playerOpen && !s.p) { closePlayer(); return; }
    if (s.home) { if (el.home.hidden) goHome(false); return; }
    if (s.up) { show('upcoming'); return; }
    if (el.browser.hidden) { show('browser'); renderList(); }
    const target = (e.state && e.state.d) || 1;
    if (target !== stack.length) { stack.length = Math.max(1, Math.min(target, stack.length)); loadFolder(stack[stack.length - 1].id); renderCrumbs(); }
  });

  function logout(msg) {
    token = null; store.del(KEY_TOKEN);
    if (playerOpen) { el.video.pause(); el.video.removeAttribute('src'); el.video.removeAttribute('poster'); el.video.load(); playerOpen = false; current = null; }
    stack = [{ id: 0, name: 'Files' }];
    setTitle('');
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
    setTimeout(resumeOffline, 0);
    if (offSupported) updateDlBadge();
    history.replaceState({ home: 1 }, '');
    goHome(false);
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
  // Default put.io app (client ID 9924, callback = this page). Not a secret: it only names
  // the app; each person signs in with their own put.io account. Still editable.
  const DEFAULT_CLIENT_ID = '9924';
  clientEl.value = store.get(KEY_CLIENT) || DEFAULT_CLIENT_ID;

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
