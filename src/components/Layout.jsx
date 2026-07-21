import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import ErrorBoundary from './ErrorBoundary';
import PullToRefreshWrapper from './PullToRefreshWrapper';
import SyncIndicator from './SyncIndicator';
import VerifyEmailBanner from './VerifyEmailBanner';
import TrainerSupportAgent from './TrainerSupportAgent';
import SubscriptionEnded from './SubscriptionEnded';
import PepTalkModal from './PepTalkModal';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

// Paths that stay accessible even when the subscription has lapsed —
// so the client can resubscribe (/my-billing) and sign out (/settings).
const SUBSCRIPTION_GATE_EXEMPT = new Set(['/my-billing', '/settings']);

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

  // Client lockout is coach-controlled, not payment-system-controlled.
  // Coaches with external payment methods (cash, Venmo, etc.) simply leave
  // access_status = 'active'; coaches who want to enforce payment flip a
  // client to 'paused' from manage-clients. The lock screen is shown until
  // they're resumed. Anything other than 'paused' (including missing/null)
  // grants access — coaches must opt in explicitly per client.
  const isPausedByCoach = clientData?.access_status === 'paused';
  const showSubscriptionLock = !isCoach
    && isPausedByCoach
    && !SUBSCRIPTION_GATE_EXEMPT.has(path);

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

  // Scroll position restoration. Because tab pages stay mounted (display
  // none/block) and non-tab pages mount/unmount via Outlet — all sharing the
  // window scroll — we keep a per-path scroll memory and restore it on
  // navigation instead of always slamming to the top. First visit to a path
  // (no saved position) defaults to the top, which is the expected behavior.
  // Survives SPA navigation; resets on full reload (history.scrollRestoration
  // is 'manual', so a reload legitimately starts fresh).
  const scrollPositions = useRef(new Map());
  const activePathRef = useRef(path);

  // Continuously record the scroll position of whatever path is active. Saving
  // on every scroll (rather than at navigation time) avoids capturing a value
  // the browser has already clamped after the outgoing page's content shrank.
  useEffect(() => {
    const positions = scrollPositions.current;
    let rafId = null;
    const recordScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        positions.set(activePathRef.current, window.scrollY || 0);
      });
    };
    window.addEventListener('scroll', recordScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', recordScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    activePathRef.current = path;
    const savedY = scrollPositions.current.get(path) ?? 0;

    let cancelled = false;
    let attempt = 0;
    const restore = () => {
      if (cancelled) return;
      if (savedY <= 0) {
        window.scrollTo(0, 0);
        return;
      }
      // Pages load data async — the document may not be tall enough yet to
      // reach savedY. Retry until it is (or give up after ~3s) so the restore
      // doesn't get clamped to a short page's max scroll.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      if (maxScroll >= savedY - 5 || attempt > 30) {
        window.scrollTo(0, savedY);
      } else {
        attempt += 1;
        setTimeout(restore, 100);
      }
    };
    // Run after paint so the new page's layout exists.
    const rafId = requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [path]);

  // Hide top nav on pages that have their own navigation
  const hideTopNav = path === '/workouts' || path.startsWith('/workouts/builder') || path === '/workout-plans';
  const isMessagesPage = path === '/messages';
  // Hide bottom nav on full-screen builder pages
  const hideBottomNav = path.startsWith('/workouts/builder');

  if (showSubscriptionLock) {
    return <SubscriptionEnded />;
  }

  return (
    <div className={`app-layout ${isMessagesPage ? 'messages-viewport' : ''}`}>
      <SyncIndicator />
      <VerifyEmailBanner />
      {!hideTopNav && <TopNav />}
      <DesktopSidebar />
      <main className={`main-content ${hideTopNav ? 'no-top-nav' : ''} ${isMessagesPage ? 'messages-page' : ''}`}>
        <div className={`container ${hideTopNav ? 'full-width' : ''}`}>
          <ErrorBoundary resetKey={location.pathname}>
            <PullToRefreshWrapper>
              {/* Persistent tab pages — mounted once, shown/hidden with CSS.
                  This is what makes tab switching feel instant (like a native app).
                  Hidden tabs keep their scroll position, state, and subscriptions. */}
              {tabPaths.map(tabPath => {
                if (!visited.has(tabPath)) return null;
                const Component = TAB_COMPONENTS[tabPath];
                const isActive = activeTab === tabPath;
                // Messages tab needs to participate in the flex chain so the
                // input bar pins to the bottom and the messages area fills
                // all available height (especially during loading).
                const needsFlexFill = isActive && tabPath === '/messages';
                const style = !isActive
                  ? { display: 'none' }
                  : needsFlexFill
                    ? { display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }
                    : { display: 'block' };
                return (
                  <div key={tabPath} style={style}>
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
      {isCoach && <TrainerSupportAgent />}
      {!isCoach && <PepTalkModal />}
    </div>
  );
}

export default Layout;
