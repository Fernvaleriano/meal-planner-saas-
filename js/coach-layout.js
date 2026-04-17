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

    function injectToggleButton() {
        const header = document.querySelector('.sidebar .sidebar-header');
        if (!header || header.querySelector('.sidebar-collapse-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-collapse-btn';
        btn.setAttribute('aria-label', 'Toggle sidebar');
        btn.title = 'Collapse sidebar';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const nowCollapsed = !document.body.classList.contains('sidebar-is-collapsed');
            document.body.classList.toggle('sidebar-is-collapsed', nowCollapsed);
            localStorage.setItem(STORAGE_KEY, nowCollapsed ? '1' : '0');
            btn.title = nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        });

        header.appendChild(btn);
        btn.title = isCollapsed() ? 'Expand sidebar' : 'Collapse sidebar';
    }

    applyInitialState();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggleButton);
    } else {
        injectToggleButton();
    }
})();
