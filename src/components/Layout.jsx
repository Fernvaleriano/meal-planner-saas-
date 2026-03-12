import { useState, useEffect, memo, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import ErrorBoundary from './ErrorBoundary';
import PullToRefreshWrapper from './PullToRefreshWrapper';
import SyncIndicator from './SyncIndicator';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

// Lazy-import tab pages — these stay mounted once visited (like native app tabs)
import Dashboard from '../pages/Dashboard';
import Diary from '../pages/Diary';
import Messages from '../pages/Messages';
import Workouts from '../pages/Workouts';
import Plans from '../pages/Plans';

// All possible tab paths — filtered at runtime by module visibility
const ALL_TAB_PATHS = ['/', '/diary', '/messages', '/workouts', '/plans'];

// Module key for each tab path (null = always visible)
const TAB_MODULE_MAP = {
  '/': null,
  '/diary': 'diary',
  '/messages': 'messages',
  '/workouts': 'workouts',
  '/plans': 'plans',
};

// Memoize tab components so they don't re-render when Layout re-renders.
const MemoizedDashboard = memo(Dashboard);
const MemoizedDiary = memo(Diary);
const MemoizedMessages = memo(Messages);
const MemoizedWorkouts = memo(Workouts);
const MemoizedPlans = memo(Plans);

const TAB_COMPONENTS = {
  '/': MemoizedDashboard,
  '/diary': MemoizedDiary,
  '/messages': MemoizedMessages,
  '/workouts': MemoizedWorkouts,
  '/plans': MemoizedPlans,
};

function getActiveTab(pathname, tabPaths) {
  if (pathname === '/') return '/';
  // /plans and /plans/:id both map to the Plans tab
  if (pathname.startsWith('/plans')) return tabPaths.includes('/plans') ? '/plans' : null;
  // /workouts/builder and /workouts/builder/:id are standalone pages, not the tab
  if (pathname.startsWith('/workouts/builder')) return null;
  // /workout-plans is a standalone page, not a tab
  if (pathname === '/workout-plans') return null;
  const match = tabPaths.find(t => t !== '/' && pathname.startsWith(t));
  return match || null;
}

function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const { clientData } = useAuth();
  const { isModuleVisible } = useBranding();
  const isCoach = clientData?.is_coach === true;

  // Filter tab paths based on module visibility (coaches see all tabs)
  const tabPaths = useMemo(() => {
    if (isCoach) return ALL_TAB_PATHS;
    return ALL_TAB_PATHS.filter(tabPath => {
      const moduleKey = TAB_MODULE_MAP[tabPath];
      return !moduleKey || isModuleVisible(moduleKey);
    });
  }, [isCoach, isModuleVisible]);

  const activeTab = getActiveTab(path, tabPaths);

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

  // Scroll to top when switching between tabs (e.g. Messages → Home)
  // Without this, the persistent display:none/block toggling preserves
  // the previous scroll position, landing users mid-page or at the bottom.
  useEffect(() => {
    if (activeTab) {
      window.scrollTo(0, 0);
    }
  }, [activeTab]);

  // Hide top nav on pages that have their own navigation
  const hideTopNav = path === '/workouts' || path.startsWith('/workouts/builder') || path === '/workout-plans';
  const isMessagesPage = path === '/messages';
  // Hide bottom nav on full-screen builder pages
  const hideBottomNav = path.startsWith('/workouts/builder');

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
              {tabPaths.map(tabPath => {
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
      {!hideBottomNav && <BottomNav currentPath={path} />}
    </div>
  );
}

export default Layout;
