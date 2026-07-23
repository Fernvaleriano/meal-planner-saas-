(function () {
    const STORAGE_KEY = 'sidebarIsCollapsed';

    function isCollapsed() {
        return localStorage.getItem(STORAGE_KEY) === '1';
    }

    function applyInitialState() {
        if (!isCollapsed()) return;
        // On pages that load this script from <head>, document.body doesn't
        // exist yet — touching it crashed the whole script (killing branding
        // and nav fixes) and lost the collapsed state on those pages. Apply
        // the class the instant <body> is parsed, before it can paint.
        if (document.body) {
            document.body.classList.add('sidebar-is-collapsed');
            return;
        }
        new MutationObserver((_, obs) => {
            if (document.body) {
                document.body.classList.add('sidebar-is-collapsed');
                obs.disconnect();
            }
        }).observe(document.documentElement, { childList: true });
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

    const LOGO_CACHE_PREFIX = 'zq-brand-logo-';
    const GYM_CACHE_PREFIX = 'zq-brand-gym-';
    // uid -> effective branding coach id. A gym TRAINER (a login with no
    // coaches row but an active gym_trainers row) must brand as their GYM, not
    // as their own id (which has no branding and 404s get-coach-branding,
    // causing the default Ziquecoach logo to flash). Cached per uid so repeat
    // loads apply the gym logo instantly with no flash. Owners map to self.
    const EFF_CACHE_PREFIX = 'zq-eff-coach-';
    // A trainer borrows the gym's brand but must NOT get gym-owner-only nav
    // (e.g. Ranks). Tracked here so applyBrandingAndRanks can skip it.
    let __isTrainerAccount = false;

    async function effectiveBrandCoachId(uid) {
        if (!uid) return uid;
        try { const c = localStorage.getItem(EFF_CACHE_PREFIX + uid); if (c) { __isTrainerAccount = (c !== uid); return c; } } catch (e) {}
        try {
            let client = window.supabaseClient;
            if ((!client || !client.from) && window.supabase && window.supabase.createClient) {
                client = window.supabase.createClient('https://' + SB_REF + '.supabase.co', SB_ANON);
            }
            if (client && client.from) {
                // Owner? (own coaches row, readable under RLS) -> self.
                const { data: coachRow } = await client.from('coaches').select('id').eq('id', uid).maybeSingle();
                if (coachRow) { __isTrainerAccount = false; try { localStorage.setItem(EFF_CACHE_PREFIX + uid, uid); } catch (e) {} return uid; }
                // Active trainer? (own gym_trainers row, readable under RLS) -> their gym.
                const { data: t } = await client.from('gym_trainers')
                    .select('gym_coach_id').eq('trainer_user_id', uid).eq('status', 'active').maybeSingle();
                if (t && t.gym_coach_id) { __isTrainerAccount = true; try { localStorage.setItem(EFF_CACHE_PREFIX + uid, t.gym_coach_id); } catch (e) {} return t.gym_coach_id; }
            }
        } catch (e) { /* fall back to self */ }
        return uid;
    }

    function revealSidebarLogo() {
        const hold = document.getElementById('zique-logo-hold');
        if (hold) hold.remove();
    }

    // Swap the sidebar logo to the brand image and reveal it only once that
    // image is actually renderable. Revealing right after changing src lets
    // the browser keep painting the previous (default Ziquecoach) bitmap
    // while the brand image downloads — the exact flash this prevents.
    function setBrandLogoAndReveal(url, alt) {
        const imgs = document.querySelectorAll('.sidebar-logo-img');
        if (!imgs.length) {
            // Sidebar not parsed yet (script/fetch ran from <head>) — retry
            // once the DOM is ready instead of revealing the default.
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => setBrandLogoAndReveal(url, alt), { once: true });
            } else {
                revealSidebarLogo();
            }
            return;
        }
        let pending = imgs.length;
        const done = () => { if (--pending <= 0) revealSidebarLogo(); };
        imgs.forEach(img => {
            if (alt) img.alt = alt;
            if (img.src !== url) img.src = url;
            // Even when src already matches (cached apply raced the fetch
            // apply), only reveal once the image is truly ready — complete,
            // or after decode/load settles.
            if (img.complete) done();
            else if (img.decode) img.decode().then(done, done);
            else {
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            }
        });
    }

    // Runs as early as possible (non-master only): hide the sidebar logo so the
    // default Ziquecoach logo never flashes before the coach/gym brand logo
    // loads, and apply a cached brand logo instantly when we already have one.
    function preapplyBrandLogo() {
        const { email, coachId } = accountFromStorage();
        if (!email || email === MASTER_EMAIL) return;   // master keeps the default logo
        // For a trainer we cached their gym id last visit; use it so the gym
        // logo applies instantly and the default never flashes on repeat loads.
        let effId = coachId;
        try { const c = coachId && localStorage.getItem(EFF_CACHE_PREFIX + coachId); if (c) effId = c; } catch (e) {}
        const cached = effId ? localStorage.getItem(LOGO_CACHE_PREFIX + effId) : null;
        if (cached === 'default') return;               // known: no custom logo → keep default, no hide
        const s = document.createElement('style');
        s.id = 'zique-logo-hold';
        s.textContent = '.sidebar-logo-img{opacity:0 !important;}';
        (document.head || document.documentElement).appendChild(s);
        if (cached) setBrandLogoAndReveal(cached);
        // Failsafe: never leave the logo hidden if the fetch stalls.
        setTimeout(revealSidebarLogo, 4000);
        // No cache → stays hidden until applyBrandingAndRanks resolves and reveals it.
    }

    // For a non-master account, fetch branding once and:
    //  - swap the sidebar logo to their OWN brand (only when genuinely custom;
    //    get-coach-branding returns the Ziquecoach default otherwise),
    //  - cache the result so future loads apply it instantly (no flash),
    //  - add the "Ranks" nav item if this is a gym (Challenges → Ranks).
    function applyBrandingAndRanks(coachId) {
        if (!coachId) { revealSidebarLogo(); return; }
        // Known gym → add Ranks NOW, not 1-2s later when the fetch resolves.
        // Waiting made the nav item pop in after paint on every page load —
        // the sidebar looked different from page to page while loading.
        try {
            if (!__isTrainerAccount && localStorage.getItem(GYM_CACHE_PREFIX + coachId) === '1') injectRanksNavItem();
        } catch (e) { /* ignore */ }
        fetch('/.netlify/functions/get-coach-branding?coachId=' + encodeURIComponent(coachId))
            .then(r => (r.ok ? r.json() : null))
            .then(b => {
                if (b) {
                    const url = b.brand_logo_url;
                    const isCustom = url && !/ziquecoach-logo/i.test(url);
                    try {
                        localStorage.setItem(LOGO_CACHE_PREFIX + coachId, isCustom ? url : 'default');
                        localStorage.setItem(GYM_CACHE_PREFIX + coachId, b.is_gym ? '1' : '0');
                    } catch (e) { /* ignore */ }
                    if (b.is_gym && !__isTrainerAccount) injectRanksNavItem();
                    if (isCustom) {
                        setBrandLogoAndReveal(url, b.brand_name || b.brand_app_name || 'Gym');
                        return;
                    }
                }
                revealSidebarLogo();
            })
            .catch(() => { revealSidebarLogo(); });
    }

    // Ziquecoach: put a "Ranks" nav item where Challenges used to be.
    // A gym TRAINER only gets the coach pages that are trainer-ready. Hide the
    // rest of the nav (and mobile bottom nav) here, in the layout that owns the
    // sidebar, so it's consistent on every page (not racing per-page scripts).
    // Add a page to TRAINER_NAV_ALLOW as it becomes trainer-aware.
    var TRAINER_NAV_ALLOW = ['dashboard.html', 'coach-workout-plans.html', 'coach-workouts.html',
        'manage-clients.html', 'coach-messages.html', 'coach-challenges.html',
        'supplement-protocols.html', 'coach-stats.html',
        'coach-meal-plans.html', 'planner.html',
        'manage-recipes.html', 'client-feed.html', 'coach-profile.html'];
    function trimNavForTrainer() {
        try {
            document.querySelectorAll('.sidebar-nav-item, .coach-nav-item').forEach(function (a) {
                var href = a.getAttribute('href') || '';
                var isLogout = a.classList.contains('sidebar-nav-logout') || /logout/i.test(a.id || '');
                var keep = isLogout || TRAINER_NAV_ALLOW.some(function (h) { return href.indexOf(h) !== -1; });
                if (!keep) a.style.setProperty('display', 'none', 'important');
            });
            // Hide a now-empty "Settings" section header.
            document.querySelectorAll('.sidebar-nav-label').forEach(function (l) {
                if (/setting/i.test(l.textContent || '')) l.style.setProperty('display', 'none', 'important');
            });
        } catch (e) { /* non-fatal */ }
    }

    function injectRanksNavItem() {
        if (document.querySelector('a.sidebar-nav-item[data-zique-ranks]')) return;
        // Anchor after the (now-hidden) Challenges item, else after Workouts.
        const anchor = document.querySelector(
            'a.sidebar-nav-item[href$="coach-challenges.html"], a.sidebar-nav-item[href$="coach-workout-plans.html"]'
        );
        if (!anchor) return;
        const a = document.createElement('a');
        a.href = 'coach-ranks.html';
        a.className = 'sidebar-nav-item';
        a.setAttribute('data-tooltip', 'Ranks');
        a.dataset.ziqueRanks = '1';
        a.innerHTML =
            '<span class="sidebar-nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/></svg></span>' +
            'Ranks';
        if (location.pathname.endsWith('/coach-ranks.html')) a.classList.add('active');
        anchor.insertAdjacentElement('afterend', a);
    }

    async function applyAccountLayout() {
        // Hidden for EVERY account: Command Center (not injected below) and
        // Challenges (nav links everywhere + the gym "Active challenges" card).
        injectStyle(
            'a[href$="coach-challenges.html"], #gymChallengesCard { display:none !important; }'
        );

        const { email, coachId } = await getAccount();
        if (!email) return; // couldn't read the session — leave the full default
        if (email === MASTER_EMAIL) return; // Ziquecoach keeps everything; Ranks is gyms-only

        // Non-Ziquecoach accounts: hide Subscriptions, Reminders, Billing.
        injectStyle(
            'a[href$="reminder-settings.html"], a[href$="coach-billing.html"], ' +
            '#subscriptionCard { display:none !important; }'
        );
        // ...show their own brand (a TRAINER shows their GYM's brand) in the
        // corner, and (for gyms) add Ranks.
        applyBrandingAndRanks(await effectiveBrandCoachId(coachId));
        // Trainers: keep the sidebar to trainer-ready pages, consistently on
        // every page. Re-run a couple of times to catch late-rendered nav.
        if (__isTrainerAccount) {
            trimNavForTrainer();
            setTimeout(trimNavForTrainer, 300);
            setTimeout(trimNavForTrainer, 1200);
        }
    }

    function init() {
        injectToggleButton();
        loadClientSwitcher();
        loadMasterProtector();
        // Command Center hidden for now (kept for later) — intentionally NOT injected.
        // injectCommandCenterNavItem();
        applyAccountLayout();
    }

    // Run synchronously NOW (script is in <head>, before the sidebar renders) so
    // the logo is hidden/prefilled before it can paint the default — no flash.
    preapplyBrandLogo();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
