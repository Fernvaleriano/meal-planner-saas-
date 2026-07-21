/**
 * Master Account Protector
 *
 * Per project memory: contact@ziquefitness.com is the master coach
 * account — its data must never be destroyed by the application.
 *
 * This script:
 *   1. Detects when the logged-in user is the master account.
 *   2. Disables destructive UI buttons (delete client, archive coach,
 *      wipe data, etc.) by intercepting the click and surfacing a clear
 *      "blocked" message — both as a banner and a console warning.
 *   3. Surfaces a small persistent "Master Account · Protected" badge in
 *      the corner so the coach always knows they're in the protected
 *      session.
 *   4. Triggers a once-per-day snapshot via the master-account-guard
 *      function so a JSON archive is recorded server-side.
 *
 * Dropped in via coach-layout.js, so it runs on every coach page.
 */
(function () {
    'use strict';

    const MASTER_EMAIL = 'contact@ziquefitness.com';
    const SNAPSHOT_KEY = 'zique-master-snapshot-date';

    // Selectors that should be guarded. We use generous, conservative
    // selectors — better to over-guard the master account than to silently
    // allow a destructive action.
    const DANGER_SELECTORS = [
        'button[data-action="delete-client"]',
        'button[data-action="delete-coach"]',
        'button[data-action="wipe-clients"]',
        'button[data-action="archive-coach"]',
        'button[data-action="cancel-account"]',
        'button.delete-account-btn',
        'button.delete-coach-btn',
        'button.btn-danger[data-destructive="true"]'
    ];

    async function init() {
        try {
            const sb = window.supabaseClient || window.supabase;
            if (!sb || typeof sb.auth?.getUser !== 'function') return;
            const { data: { user } } = await sb.auth.getUser();
            if (!user || (user.email || '').toLowerCase() !== MASTER_EMAIL) return;

            mountBadge();
            installInterceptors();
            maybeRunDailySnapshot(sb, user);
        } catch (e) {
            // Don't break the page if anything fails.
            console.warn('Master account protector skipped:', e.message);
        }
    }

    function mountBadge() {
        if (document.getElementById('zique-master-badge')) return;
        const el = document.createElement('div');
        el.id = 'zique-master-badge';
        el.title = 'Destructive actions are blocked for the master coach account.';
        el.style.cssText = `
            position: fixed;
            top: 12px;
            right: 12px;
            z-index: 9997;
            padding: 6px 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .04em;
            text-transform: uppercase;
            color: #fff;
            background: linear-gradient(135deg, #dc2626, #f59e0b);
            border-radius: 999px;
            box-shadow: 0 4px 14px rgba(220,38,38,.25);
            cursor: help;
            font-family: 'Inter', system-ui, sans-serif;
            display: flex; align-items: center; gap: 6px;
        `;
        el.innerHTML = '<span style="width:8px; height:8px; background:#fff; border-radius:50%; box-shadow:0 0 8px #fff;"></span>Master · Protected';
        document.body.appendChild(el);
    }

    function installInterceptors() {
        // Capture-phase listener so we can short-circuit before the page's
        // own click handlers fire.
        document.addEventListener('click', (e) => {
            const target = e.target.closest(DANGER_SELECTORS.join(', '));
            if (!target) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const action = target.dataset.action || 'destructive action';
            console.warn(`[MasterProtector] Blocked ${action}`);
            showBlockedToast(`Blocked: ${action} is permanently disabled on the master coach account.`);
        }, true); // capture phase

        // Also patch window.confirm to add a banner saying any destructive
        // action will be audited (does not actually block, but warns).
        const origConfirm = window.confirm;
        window.confirm = function (message) {
            if (typeof message === 'string' && /delete|remove|archive|wipe|cancel/i.test(message)) {
                console.warn('[MasterProtector] Audited confirm:', message);
            }
            return origConfirm.apply(this, arguments);
        };
    }

    function showBlockedToast(text) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 60px;
            right: 16px;
            z-index: 9999;
            padding: 14px 18px;
            background: #1e293b;
            color: #fff;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,.35);
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            max-width: 320px;
            line-height: 1.5;
            border-left: 4px solid #dc2626;
        `;
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transition = 'opacity .3s'; toast.style.opacity = '0'; }, 4500);
        setTimeout(() => toast.remove(), 5000);
    }

    async function maybeRunDailySnapshot(sb, user) {
        const today = new Date().toISOString().split('T')[0];
        if (localStorage.getItem(SNAPSHOT_KEY) === today) return;
        try {
            // The snapshot endpoint now requires a real signed-in master
            // session (it reads the account's most sensitive data). Send the
            // JWT so the server can verify us — without it the server 401s.
            const { data: { session } } = await sb.auth.getSession();
            const token = session?.access_token;
            if (!token) return;
            await fetch('/.netlify/functions/master-account-guard', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    intent: 'snapshot',
                    actor: { userId: user.id, email: user.email }
                })
            });
            localStorage.setItem(SNAPSHOT_KEY, today);
        } catch (e) {
            console.warn('snapshot trigger failed:', e.message);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // The supabase client may not exist yet when coach-layout runs first.
        // Try now and again after a short delay.
        init();
        setTimeout(init, 1500);
    }
})();
