/**
 * Quick Client Switcher (Cmd+K / Ctrl+K)
 *
 * Drop <script src="/js/client-switcher.js"></script> on any coach page and
 * the switcher injects itself. Pressing Cmd+K (Mac) or Ctrl+K (anything
 * else) opens a search palette that:
 *
 *   • fuzzy-searches all of your clients by name/email
 *   • lets you jump to common pages for that client (Profile, Messages,
 *     Workouts, Diary, Stats, Add note) with one Enter press
 *   • supports keyboard arrows + Enter
 *   • caches the client list in sessionStorage so it opens instantly
 *
 * Solves the user-reported pain point: "Having to tap on client, search
 * client and click on client and then look for client info seems like a
 * chore being honest."
 *
 * Requires: a global `supabaseClient` (already initialised on every coach
 * page) and the coach to be authenticated.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'zique-client-switcher-cache-v1';
  const RECENT_KEY = 'zique-client-switcher-recents-v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Where Enter takes you for each verb
  const ACTIONS = [
    { id: 'profile',  label: 'Open profile',         emoji: '\u{1F464}', url: (c) => `/client-profile.html?clientId=${encodeURIComponent(c.id)}` },
    { id: 'messages', label: 'Message',              emoji: '\u{1F4AC}', url: (c) => `/coach-messages.html?clientId=${encodeURIComponent(c.id)}` },
    { id: 'workouts', label: 'View workouts',        emoji: '\u{1F4AA}', url: (c) => `/coach-workouts.html?clientId=${encodeURIComponent(c.id)}` },
    { id: 'diary',    label: 'View food diary',      emoji: '\u{1F37D}', url: (c) => `/client-feed.html?clientId=${encodeURIComponent(c.id)}` },
    { id: 'plan',     label: 'View plan',            emoji: '\u{1F4D6}', url: (c) => `/view-plan.html?clientId=${encodeURIComponent(c.id)}` },
    { id: 'stats',    label: 'View stats',           emoji: '\u{1F4CA}', url: (c) => `/coach-stats.html?clientId=${encodeURIComponent(c.id)}` }
  ];

  // ─── Inject styles ──
  function injectStyles() {
    if (document.getElementById('client-switcher-styles')) return;
    const s = document.createElement('style');
    s.id = 'client-switcher-styles';
    s.textContent = `
      .csw-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 99999; display: none; align-items: flex-start; justify-content: center; padding-top: 12vh; animation: csw-fade .15s ease-out; }
      .csw-overlay.open { display: flex; }
      .csw-panel { width: min(640px, 92vw); background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35), 0 4px 20px rgba(0,0,0,.18); overflow: hidden; font-family: 'Inter', system-ui, sans-serif; transform: translateY(-6px); animation: csw-pop .18s cubic-bezier(.2,1,.3,1) forwards; }
      [data-theme="dark"] .csw-panel { background: #1e293b; color: #f1f5f9; }
      .csw-input { width: 100%; padding: 18px 22px; font-size: 16px; border: 0; outline: none; border-bottom: 1px solid #e2e8f0; background: transparent; color: inherit; box-sizing: border-box; }
      [data-theme="dark"] .csw-input { border-bottom-color: #334155; }
      .csw-list { max-height: 56vh; overflow-y: auto; }
      .csw-item { padding: 12px 22px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
      [data-theme="dark"] .csw-item { border-bottom-color: #2a3850; }
      .csw-item:last-child { border-bottom: 0; }
      .csw-item.active { background: linear-gradient(90deg, rgba(13,148,136,.10), rgba(2,132,199,.06)); }
      .csw-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #2cb5a5, #0284c7); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; flex-shrink: 0; overflow: hidden; }
      .csw-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .csw-name { font-weight: 600; font-size: 15px; }
      .csw-meta { font-size: 12px; color: #64748b; }
      .csw-actions { padding: 8px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; flex-wrap: wrap; }
      [data-theme="dark"] .csw-actions { background: #0f172a; border-top-color: #334155; }
      .csw-action-btn { padding: 6px 10px; font-size: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: inherit; }
      [data-theme="dark"] .csw-action-btn { background: #1e293b; border-color: #334155; color: #f1f5f9; }
      .csw-action-btn:hover { background: rgba(13,148,136,.10); border-color: rgba(13,148,136,.4); }
      .csw-footer { padding: 10px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
      [data-theme="dark"] .csw-footer { background: #0f172a; border-top-color: #334155; color: #94a3b8; }
      .csw-kbd { background: #fff; border: 1px solid #e2e8f0; border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; font-family: 'SF Mono', Menlo, monospace; font-size: 10px; color: #475569; }
      [data-theme="dark"] .csw-kbd { background: #1e293b; border-color: #334155; color: #cbd5e1; }
      .csw-empty { padding: 40px 22px; text-align: center; color: #94a3b8; font-size: 14px; }
      @keyframes csw-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes csw-pop { from { transform: scale(.96) translateY(-12px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
    `;
    document.head.appendChild(s);
  }

  // ─── Build DOM ──
  function buildDOM() {
    if (document.getElementById('csw-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'csw-overlay';
    overlay.className = 'csw-overlay';
    overlay.innerHTML = `
      <div class="csw-panel" role="dialog" aria-label="Quick client switcher">
        <input id="csw-input" class="csw-input" type="text" placeholder="Jump to client — type a name, email, or 'msg fern'" autocomplete="off" spellcheck="false" />
        <div id="csw-list" class="csw-list"></div>
        <div id="csw-actions" class="csw-actions" style="display:none;"></div>
        <div class="csw-footer">
          <span><span class="csw-kbd">↑↓</span> navigate &middot; <span class="csw-kbd">Tab</span> action &middot; <span class="csw-kbd">Enter</span> open &middot; <span class="csw-kbd">Esc</span> close</span>
          <span>⌘K to open anywhere</span>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  // ─── Cache layer ──
  function loadCachedClients() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.cachedAt || (Date.now() - parsed.cachedAt) > CACHE_TTL_MS) return null;
      return parsed.clients;
    } catch { return null; }
  }

  function saveCachedClients(clients) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cachedAt: Date.now(), clients })); } catch {}
  }

  function pushRecent(clientId) {
    try {
      const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((id) => id !== clientId);
      arr.unshift(clientId);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 20)));
    } catch {}
  }

  function getRecentIds() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }

  // ─── Data fetch ──
  async function fetchClients() {
    const cached = loadCachedClients();
    if (cached) return cached;
    const sb = window.supabaseClient || window.supabase;
    if (!sb) return [];
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    // Resolve coach id
    const { data: coach } = await sb.from('coaches').select('id').eq('id', user.id).maybeSingle();
    if (!coach) return [];
    const { data: clients } = await sb.from('clients')
      .select('id, client_name, email, profile_photo_url, last_activity_at')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(500);
    const list = clients || [];
    saveCachedClients(list);
    return list;
  }

  // ─── Fuzzy match ──
  function score(haystack, needle) {
    if (!needle) return 1;
    const h = (haystack || '').toLowerCase();
    const n = needle.toLowerCase();
    if (h.includes(n)) return 100 - h.indexOf(n);
    let hi = 0, ni = 0, hits = 0;
    while (hi < h.length && ni < n.length) {
      if (h[hi] === n[ni]) { hits += 1; ni += 1; }
      hi += 1;
    }
    return ni === n.length ? hits : 0;
  }

  // ─── Render ──
  function avatarFor(c) {
    if (c.profile_photo_url) return `<div class="csw-avatar"><img src="${escapeHtml(c.profile_photo_url)}" alt=""></div>`;
    const initials = (c.client_name || '').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
    return `<div class="csw-avatar">${escapeHtml(initials)}</div>`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  let state = { clients: [], filtered: [], activeIdx: 0, verb: null, query: '' };

  function render() {
    const list = document.getElementById('csw-list');
    if (!list) return;
    if (!state.filtered.length) {
      list.innerHTML = `<div class="csw-empty">No clients match "${escapeHtml(state.query)}"</div>`;
      return;
    }
    list.innerHTML = state.filtered.map((c, i) => `
      <div class="csw-item ${i === state.activeIdx ? 'active' : ''}" data-id="${escapeHtml(c.id)}" data-idx="${i}">
        ${avatarFor(c)}
        <div style="flex:1; min-width:0;">
          <div class="csw-name">${escapeHtml(c.client_name || 'Unnamed client')}</div>
          <div class="csw-meta">${escapeHtml(c.email || '')}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.csw-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.activeIdx = parseInt(el.dataset.idx, 10);
        triggerEnter();
      });
      el.addEventListener('mouseenter', () => {
        state.activeIdx = parseInt(el.dataset.idx, 10);
        list.querySelectorAll('.csw-item').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
      });
    });
    renderActions();
  }

  function renderActions() {
    const wrap = document.getElementById('csw-actions');
    if (!wrap) return;
    const c = state.filtered[state.activeIdx];
    if (!c) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = ACTIONS.map((a) => `
      <button class="csw-action-btn" data-action="${a.id}">${a.emoji} ${escapeHtml(a.label)}</button>
    `).join('');
    wrap.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigate(c, btn.dataset.action);
      });
    });
  }

  // ─── Navigation ──
  function navigate(client, actionId) {
    pushRecent(client.id);
    const action = ACTIONS.find((a) => a.id === actionId) || ACTIONS[0];
    window.location.href = action.url(client);
    close();
  }

  function triggerEnter() {
    const c = state.filtered[state.activeIdx];
    if (!c) return;
    navigate(c, state.verb || 'profile');
  }

  // ─── Open / close ──
  let isOpen = false;
  async function open() {
    injectStyles();
    buildDOM();
    isOpen = true;
    const overlay = document.getElementById('csw-overlay');
    overlay.classList.add('open');
    const input = document.getElementById('csw-input');
    input.value = '';
    input.focus();

    if (!state.clients.length) state.clients = await fetchClients();
    applyFilter('');
  }

  function close() {
    isOpen = false;
    const overlay = document.getElementById('csw-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function applyFilter(q) {
    state.query = q;
    state.verb = null;
    let needle = q.trim();
    // Verb prefix support: "msg fern", "workouts fern", "stats john"
    const verbMap = { msg: 'messages', message: 'messages', workouts: 'workouts', workout: 'workouts', stats: 'stats', diary: 'diary', plan: 'plan', profile: 'profile' };
    const m = needle.match(/^(\S+)\s+(.*)$/);
    if (m && verbMap[m[1].toLowerCase()]) {
      state.verb = verbMap[m[1].toLowerCase()];
      needle = m[2];
    }
    if (!needle) {
      // Show recents first when query is empty
      const recentIds = getRecentIds();
      const ranked = state.clients.slice().sort((a, b) => {
        const ra = recentIds.indexOf(a.id);
        const rb = recentIds.indexOf(b.id);
        if (ra === -1 && rb === -1) return 0;
        if (ra === -1) return 1;
        if (rb === -1) return -1;
        return ra - rb;
      });
      state.filtered = ranked.slice(0, 25);
    } else {
      state.filtered = state.clients
        .map((c) => ({ c, s: Math.max(score(c.client_name, needle), score(c.email, needle)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 20)
        .map((x) => x.c);
    }
    state.activeIdx = 0;
    render();
  }

  // ─── Event wiring ──
  function onKeydown(e) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen ? close() : open();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.activeIdx = Math.min(state.activeIdx + 1, state.filtered.length - 1);
      render();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.activeIdx = Math.max(state.activeIdx - 1, 0);
      render();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      // Cycle through ACTIONS as the verb
      const idx = ACTIONS.findIndex((a) => a.id === (state.verb || 'profile'));
      state.verb = ACTIONS[(idx + 1) % ACTIONS.length].id;
      const input = document.getElementById('csw-input');
      if (input) input.placeholder = `Action: ${ACTIONS.find((a) => a.id === state.verb).label}`;
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); triggerEnter(); return; }
  }

  function onInput(e) { applyFilter(e.target.value); }

  function init() {
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'csw-input') onInput(e);
    });
    // Pre-warm cache after the page is idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { fetchClients().catch(() => {}); }, { timeout: 4000 });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.ClientSwitcher = { open, close };
})();
