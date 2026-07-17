(function () {
    const STORAGE_KEY = 'sidebarIsCollapsed';

    function isCollapsed() {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }

    function applyInitialState() {
        if (isCollapsed()) {
            document.body.classList.add('sidebar-is-collapsed');
        }
    }

    function buildButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-collapse-btn';
        btn.setAttribute('aria-label', 'Toggle sidebar');
        btn.title = isCollapsed() ? 'Expand sidebar' : 'Collapse sidebar';
        // Panel/sidebar toggle icon (like VS Code / Claude Code)
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const nowCollapsed = !document.body.classList.contains('sidebar-is-collapsed');
            document.body.classList.toggle('sidebar-is-collapsed', nowCollapsed);
            localStorage.setItem(STORAGE_KEY, nowCollapsed ? '1' : '0');
            btn.title = nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        });

        return btn;
    }

    function injectToggleButton() {
        // Prefer the sidebar header (VS Code / Notion / Linear pattern). Button
        // lives next to the logo and remains visible — centered — when collapsed.
        const sidebarHeader = document.querySelector('.sidebar-header');
        if (sidebarHeader && !sidebarHeader.querySelector('.sidebar-collapse-btn')) {
            sidebarHeader.appendChild(buildButton());
            return;
        }
        // Fallback for pages without a sidebar header.
        const header = document.querySelector('.main-header, .top-nav');
        if (!header || header.querySelector('.sidebar-collapse-btn')) return;
        header.insertBefore(buildButton(), header.firstChild);
    }

    applyInitialState();

    function loadClientSwitcher() {
        if (document.querySelector('script[data-zique-client-switcher]')) return;
        const s = document.createElement('script');
        s.src = '/js/client-switcher.js';
        s.async = true;
        s.dataset.ziqueClientSwitcher = '1';
        document.head.appendChild(s);
    }

    function loadMasterProtector() {
        if (document.querySelector('script[data-zique-master-protector]')) return;
        const s = document.createElement('script');
        s.src = '/js/master-account-protector.js';
        s.async = true;
        s.dataset.ziqueMasterProtector = '1';
        document.head.appendChild(s);
    }

    function injectCommandCenterNavItem() {
        // Only on coach pages — they are the only ones with .sidebar-nav-item.
        const dashLink = document.querySelector('a.sidebar-nav-item[href="dashboard.html"], a.sidebar-nav-item[href="/dashboard.html"]');
        if (!dashLink || document.querySelector('a.sidebar-nav-item[data-zique-cc]')) return;
        const a = document.createElement('a');
        a.href = 'coach-command-center.html';
        a.className = 'sidebar-nav-item';
        a.setAttribute('data-tooltip', 'Command Center');
        a.dataset.ziqueCc = '1';
        // Use a sparkles-ish svg inline so we don't depend on lucide load order.
        a.innerHTML =
            '<span class="sidebar-nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg></span>' +
            'Command Center';
        if (location.pathname.endsWith('/coach-command-center.html')) a.classList.add('active');
        dashLink.insertAdjacentElement('afterend', a);
    }

    // ── Account-aware nav visibility + branding ──────────────────────────
    // Runs on every coach page (this script is included on all of them). Some
    // items are hidden for everyone; some only for non-Ziquecoach accounts.
    const MASTER_EMAIL = 'contact@ziquefitness.com';
    const SB_REF = 'qewqcjzlfqamqwbccapr';

    function injectStyle(css) {
        const s = document.createElement('style');
        s.setAttribute('data-zique-layout', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

    // Fast path: read the logged-in account (email + id) straight from the stored
    // Supabase session — no network, no dependency on the page's own client.
    function accountFromStorage() {
        try {
            const raw = localStorage.getItem('sb-' + SB_REF + '-auth-token');
            if (!raw) return {};
            const o = JSON.parse(raw);
            const u = o?.user || o?.currentSession?.user || o?.session?.user || o?.data?.session?.user;
            return { email: (u?.email || '').toLowerCase(), coachId: u?.id || '' };
        } catch (e) { return {}; }
    }

    // Robust path: fall back to a Supabase client if the fast read didn't work,
    // so the account-specific hiding reliably applies.
    async function getAccount() {
        const fast = accountFromStorage();
        if (fast.email) return fast;
        try {
            let client = window.supabaseClient;
            if ((!client || !client.auth) && window.supabase && window.supabase.createClient) {
                client = window.supabase.createClient('https://' + SB_REF + '.supabase.co', SB_ANON);
            }
            if (client && client.auth && client.auth.getSession) {
                const { data } = await client.auth.getSession();
                const u = data?.session?.user;
                if (u) return { email: (u.email || '').toLowerCase(), coachId: u.id || '' };
            }
        } catch (e) { /* leave defaults */ }
        return fast;
    }

    // Swap the sidebar logo to the coach/gym's OWN brand — only when they have a
    // genuinely custom logo (get-coach-branding returns the Ziquecoach default
    // otherwise, which we leave alone).
    function brandSidebarLogo(coachId) {
        if (!coachId) return;
        fetch('/.netlify/functions/get-coach-branding?coachId=' + encodeURIComponent(coachId))
            .then(r => (r.ok ? r.json() : null))
            .then(b => {
                if (!b || !b.brand_logo_url || /ziquecoach-logo/i.test(b.brand_logo_url)) return;
                document.querySelectorAll('.sidebar-logo-img').forEach(img => {
                    img.src = b.brand_logo_url;
                    img.alt = b.brand_name || b.brand_app_name || 'Gym';
                });
            })
            .catch(() => {});
    }

    async function applyAccountLayout() {
        // Hidden for EVERY account: Command Center (not injected below) and
        // Challenges (nav links everywhere + the gym "Active challenges" card).
        injectStyle(
            'a[href$="coach-challenges.html"], #gymChallengesCard { display:none !important; }'
        );

        const { email, coachId } = await getAccount();
        if (!email) return; // couldn't read the session — leave the full default
        if (email === MASTER_EMAIL) return; // Ziquecoach keeps everything

        // Non-Ziquecoach accounts: hide Subscriptions, Reminders, Billing.
        injectStyle(
            'a[href$="reminder-settings.html"], a[href$="coach-billing.html"], ' +
            '#subscriptionCard { display:none !important; }'
        );
        // ...and show their own brand in the corner instead of Ziquecoach.
        brandSidebarLogo(coachId);
    }

    function init() {
        injectToggleButton();
        loadClientSwitcher();
        loadMasterProtector();
        // Command Center hidden for now (kept for later) — intentionally NOT injected.
        // injectCommandCenterNavItem();
        applyAccountLayout();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
