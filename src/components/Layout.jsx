import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import ErrorBoundary from './ErrorBoundary';
import PullToRefreshWrapper from './PullToRefreshWrapper';
import SyncIndicator from './SyncIndicator';

// Lazy-import tab pages — these stay mounted once visited (like native app tabs)
import Dashboard from '../pages/Dashboard';
import Diary from '../pages/Diary';
import Messages from '../pages/Messages';
import Workouts from '../pages/Workouts';
import Plans from '../pages/Plans';

// Tab paths that correspond to bottom nav items.
// These pages are kept alive (mounted but hidden) after first visit
// so switching tabs is instant — no remount, no refetch, no flash.
const TAB_PATHS = ['/', '/diary', '/messages', '/workouts', '/plans'];

function getActiveTab(pathname) {
  if (pathname === '/') return '/';
  // /plans and /plans/:id both map to the Plans tab
  if (pathname.startsWith('/plans')) return '/plans';
  const match = TAB_PATHS.find(t => t !== '/' && pathname.startsWith(t));
  return match || null;
}

function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const activeTab = getActiveTab(path);

  // Lazy mount: only render a tab after the user first navigates to it.
  // This avoids mounting all 5 pages on initial load.
  const [visited, setVisited] = useState(() => {
    const initial = new Set();
    if (activeTab) initial.add(activeTab);
    return initial;
  });

  useEffect(() => {
    if (activeTab && !visited.has(activeTab)) {
      setVisited(prev => new Set([...prev, activeTab]));
    }
  }, [activeTab]);

  // Hide top nav on pages that have their own navigation
  const hideTopNav = path === '/workouts';
  const isMessagesPage = path === '/messages';

  // Tab page components — rendered once, then kept alive
  const TAB_COMPONENTS = {
    '/': Dashboard,
    '/diary': Diary,
    '/messages': Messages,
    '/workouts': Workouts,
    '/plans': Plans,
  };

  return (
    <div className="app-layout">
      <SyncIndicator />
      {!hideTopNav && <TopNav />}
      <DesktopSidebar />
      <main className={`main-content ${hideTopNav ? 'no-top-nav' : ''} ${isMessagesPage ? 'messages-page' : ''}`}>
        <div className={`container ${hideTopNav ? 'full-width' : ''}`}>
          <ErrorBoundary>
            <PullToRefreshWrapper>
              {/* Persistent tab pages — mounted once, shown/hidden with CSS.
                  This is what makes tab switching feel instant (like a native app).
                  Hidden tabs keep their scroll position, state, and subscriptions. */}
              {TAB_PATHS.map(tabPath => {
                if (!visited.has(tabPath)) return null;
                const Component = TAB_COMPONENTS[tabPath];
                return (
                  <div
                    key={tabPath}
                    style={{ display: activeTab === tabPath ? 'block' : 'none' }}
                  >
                    <Component />
                  </div>
                );
              })}

              {/* Non-tab pages (Settings, Recipes, etc.) render normally via Outlet */}
              {!activeTab && <Outlet />}
            </PullToRefreshWrapper>
          </ErrorBoundary>
        </div>
      </main>
      <BottomNav currentPath={path} />
    </div>
  );
}

export default Layout;
