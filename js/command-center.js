/**
 * Command Center page logic
 *
 * Orchestrates calls to:
 *   - /.netlify/functions/ai-daily-briefing
 *   - /.netlify/functions/ai-plateau-detector
 *   - /.netlify/functions/notification-health
 *   - /.netlify/functions/ai-message-drafter
 *
 * Renders the priorities list, plateau list, wins, and notification health
 * widget. Provides one-click drafter modal that lets the coach review and
 * send a check-in / nudge / recap message in 5 seconds.
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

    let supabaseClient;
    let coachId = null;
    let currentTab = 'all';
    let allPriorities = [];

    function init() {
        const { createClient } = supabase;
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = supabaseClient; // expose for switcher

        supabaseClient.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) {
                window.location.href = '/login.html';
                return;
            }
            const { data: coach } = await supabaseClient.from('coaches').select('id').eq('user_id', user.id).maybeSingle();
            if (!coach) {
                window.location.href = '/login.html';
                return;
            }
            coachId = coach.id;
            window.cccCoachId = coachId;
            wireTabs();
            cccRefresh(false);
        });
    }

    function wireTabs() {
        document.querySelectorAll('.ccc-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ccc-tab').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentTab = btn.dataset.tab;
                renderPriorities();
            });
        });
    }

    async function cccRefresh(force) {
        if (!coachId) return;
        try {
            await Promise.all([loadBriefing(force), loadPlateaus(false), loadNotifHealth()]);
        } catch (e) {
            console.error('refresh failed:', e);
        }
    }

    async function loadBriefing(force) {
        const url = `/.netlify/functions/ai-daily-briefing?coachId=${encodeURIComponent(coachId)}`;
        let resp;
        if (force) {
            resp = await fetch('/.netlify/functions/ai-daily-briefing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coachId, force: true })
            });
        } else {
            resp = await fetch(url);
        }
        if (!resp.ok) {
            document.getElementById('cccHeadline').textContent = 'Briefing unavailable';
            return;
        }
        const data = await resp.json();
        renderBriefing(data);
    }

    function renderBriefing(b) {
        document.getElementById('cccHeadline').textContent = b.headline || 'Today\'s briefing';
        document.getElementById('cccSummary').textContent = b.summary || '';
        const advice = document.getElementById('cccAdvice');
        if (b.coachAdvice) {
            advice.style.display = 'block';
            advice.textContent = '\u{1F4A1} ' + b.coachAdvice;
        }
        // Stats
        document.getElementById('statActive').textContent = b.stats?.activeClients ?? '—';
        document.getElementById('statCheckins').textContent = b.stats?.checkinsThisWeek ?? '—';
        document.getElementById('statInactive').textContent = b.stats?.missedWorkouts ?? '—';
        document.getElementById('statMsgs').textContent = b.stats?.pendingMessages ?? '—';

        allPriorities = b.priorities || [];
        document.getElementById('prioritiesCount').textContent = allPriorities.length;
        renderPriorities();
        renderWins(b.wins || []);
    }

    function priorityMatches(p) {
        if (currentTab === 'all') return true;
        if (currentTab === 'high') return p.severity === 'high';
        if (currentTab === 'message') return /unread|message/i.test(p.title);
        if (currentTab === 'inactive') return /inactive/i.test(p.title);
        if (currentTab === 'program') return /program/i.test(p.title);
        return true;
    }

    function renderPriorities() {
        const list = document.getElementById('prioritiesList');
        const filtered = allPriorities.filter(priorityMatches);
        if (filtered.length === 0) {
            list.innerHTML = '<div class="ccc-empty">Nothing in this lane right now. Nice work.</div>';
            return;
        }
        list.innerHTML = filtered.map((p) => `
            <div class="ccc-row">
                <div class="ccc-sev ccc-sev--${p.severity || 'low'}"></div>
                <div class="ccc-row-body">
                    <div class="ccc-row-line1">${esc(p.clientName || 'Client')}</div>
                    <div class="ccc-row-line2">${esc(p.title)} · ${esc(p.action)}</div>
                </div>
                <div class="ccc-row-actions">
                    ${p.clientId ? `<a class="ccc-tiny" href="/coach-messages.html?clientId=${encodeURIComponent(p.clientId)}">\u{1F4AC} Message</a>` : ''}
                    ${p.clientId ? `<button class="ccc-tiny" onclick="cccDraft('${esc(p.clientId)}', '${esc(p.clientName || '')}')">\u{1F58A} Draft</button>` : ''}
                    ${p.clientId ? `<a class="ccc-tiny" href="/client-profile.html?clientId=${encodeURIComponent(p.clientId)}">Profile</a>` : ''}
                </div>
            </div>
        `).join('');
    }

    function renderWins(wins) {
        const list = document.getElementById('winsList');
        document.getElementById('winsCount').textContent = wins.length;
        if (!wins.length) { list.innerHTML = '<div class="ccc-empty">No PRs in the last 7 days. Push someone today.</div>'; return; }
        list.innerHTML = wins.map((w) => `
            <div class="ccc-row">
                <div class="ccc-sev ccc-sev--low"></div>
                <div class="ccc-row-body">
                    <div class="ccc-row-line1">${esc(w.clientName)}</div>
                    <div class="ccc-row-line2">${esc(w.fact)}</div>
                </div>
            </div>
        `).join('');
    }

    async function loadPlateaus(force) {
        const list = document.getElementById('plateauList');
        list.innerHTML = '<div class="ccc-loading">Scanning…</div>';
        try {
            const resp = await fetch(`/.netlify/functions/ai-plateau-detector?coachId=${encodeURIComponent(coachId)}`);
            if (!resp.ok) { list.innerHTML = '<div class="ccc-empty">Plateau check unavailable</div>'; return; }
            const data = await resp.json();
            const plateaus = data.plateaus || [];
            document.getElementById('statPlateaus').textContent = plateaus.length;
            document.getElementById('plateauCount').textContent = plateaus.length;
            if (!plateaus.length) { list.innerHTML = '<div class="ccc-empty">No plateaus detected. Everyone is moving.</div>'; return; }
            list.innerHTML = plateaus.slice(0, 6).map((p) => `
                <div class="ccc-row">
                    <div class="ccc-sev ccc-sev--${p.severity}"></div>
                    <div class="ccc-row-body">
                        <div class="ccc-row-line1">${esc(p.clientName)} · ${esc(p.metric)}</div>
                        <div class="ccc-row-line2">${esc(p.evidence)}</div>
                        <div class="ccc-row-line2" style="margin-top:4px; color: var(--brand-primary); font-style: italic;">\u{1F4A1} ${esc(p.recommendation || '')}</div>
                    </div>
                    <div class="ccc-row-actions">
                        <button class="ccc-tiny" onclick='cccSendPreset(${JSON.stringify(p.clientId)}, ${JSON.stringify(p.draftMessage || "")})'>\u{2709} Send draft</button>
                        <button class="ccc-tiny" onclick="cccDraft('${esc(p.clientId)}', '${esc(p.clientName)}')">\u{1F58A} More</button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<div class="ccc-empty">Plateau check failed</div>';
        }
    }

    async function loadNotifHealth() {
        const el = document.getElementById('notifHealth');
        try {
            const resp = await fetch(`/.netlify/functions/notification-health?coachId=${encodeURIComponent(coachId)}`);
            if (!resp.ok) { el.innerHTML = '<div class="ccc-empty">Health check unavailable</div>'; return; }
            const data = await resp.json();
            const s = data.summary || {};
            const stale = data.stale || [];
            el.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
                    <div><div style="font-size:11px; color:var(--gray-500);">SENT (14d)</div><div style="font-size:20px; font-weight:700;">${s.total ?? 0}</div></div>
                    <div><div style="font-size:11px; color:var(--gray-500);">UNREAD</div><div style="font-size:20px; font-weight:700; color:${s.unread ? 'var(--warn)' : 'inherit'};">${s.unread ?? 0}</div></div>
                    <div><div style="font-size:11px; color:var(--gray-500);">STALE 24h+</div><div style="font-size:20px; font-weight:700; color:${stale.length ? 'var(--danger)' : 'inherit'};">${stale.length}</div></div>
                </div>
                ${stale.length ? `<div style="font-size:12px; color:var(--gray-500); margin-bottom:6px;">Stale notifications:</div>` : ''}
                ${stale.slice(0, 3).map((n) => `
                    <div class="ccc-row" style="padding:8px 0;">
                        <div class="ccc-sev ccc-sev--medium"></div>
                        <div class="ccc-row-body">
                            <div class="ccc-row-line1" style="font-size:13px;">${esc(n.title || n.type)}</div>
                            <div class="ccc-row-line2">${esc(n.clientName || 'unknown')} · ${Math.round(n.ageHours)}h ago</div>
                        </div>
                    </div>`).join('')}
                ${s.deliveryConfirmedPct == null ? `<div style="font-size:11px; color:var(--gray-500); margin-top:10px; padding-top:10px; border-top:1px solid var(--gray-100);">Tip: deploy the SW push handler to start tracking real delivery confirmations.</div>` : `<div style="font-size:11px; color:var(--gray-500); margin-top:8px;">Delivery confirmed: ${s.deliveryConfirmedPct}%</div>`}
            `;
        } catch (e) {
            el.innerHTML = '<div class="ccc-empty">Health check failed</div>';
        }
    }

    // ─── Drafter modal ──
    async function cccDraft(clientId, clientName) {
        const modal = document.getElementById('drafterModal');
        modal.classList.add('open');
        document.getElementById('drafterName').textContent = clientName || 'Client';
        const body = document.getElementById('drafterBody');
        body.innerHTML = '<div class="ccc-loading">Asking AI…</div>';
        try {
            const resp = await fetch('/.netlify/functions/ai-message-drafter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coachId, clientId, kind: 'all', tone: 'friendly' })
            });
            if (!resp.ok) {
                body.innerHTML = '<div class="ccc-empty">Drafter unavailable.</div>';
                return;
            }
            const data = await resp.json();
            body.innerHTML = (data.drafts || []).map((d, i) => `
                <div class="ccc-draft">
                    <div class="ccc-draft-kind">${esc(d.kind)} · ${esc(d.subject || '')}</div>
                    <textarea id="draft-text-${i}">${esc(d.body || '')}</textarea>
                    <div class="ccc-draft-why">${esc(d.why || '')}</div>
                    <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="ccc-tiny" onclick="cccCopy(${i})">Copy</button>
                        <a class="ccc-tiny" href="/coach-messages.html?clientId=${encodeURIComponent(clientId)}&prefill=${encodeURIComponent(d.body || '')}">Open in messages</a>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            body.innerHTML = '<div class="ccc-empty">Drafter failed.</div>';
        }
    }

    function cccCopy(i) {
        const el = document.getElementById('draft-text-' + i);
        if (!el) return;
        el.select();
        document.execCommand('copy');
        el.blur();
    }

    function cccCloseDrafter() {
        document.getElementById('drafterModal').classList.remove('open');
    }

    function cccSendPreset(clientId, message) {
        if (!clientId || !message) return;
        window.location.href = `/coach-messages.html?clientId=${encodeURIComponent(clientId)}&prefill=${encodeURIComponent(message)}`;
    }

    function cccOpenSwitcher() {
        if (window.ClientSwitcher && window.ClientSwitcher.open) window.ClientSwitcher.open();
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    // Expose for inline handlers
    window.cccRefresh = cccRefresh;
    window.cccLoadPlateaus = loadPlateaus;
    window.cccDraft = cccDraft;
    window.cccCloseDrafter = cccCloseDrafter;
    window.cccCopy = cccCopy;
    window.cccSendPreset = cccSendPreset;
    window.cccOpenSwitcher = cccOpenSwitcher;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
