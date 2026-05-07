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

    function init() {
        injectToggleButton();
        loadClientSwitcher();
        loadMasterProtector();
        injectCommandCenterNavItem();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
