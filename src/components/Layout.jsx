import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import ErrorBoundary from './ErrorBoundary';
import PullToRefreshWrapper from './PullToRefreshWrapper';

function Layout() {
  const location = useLocation();

  // Hide top nav on pages that have their own navigation
  const hideTopNav = location.pathname === '/workouts';
  const isMessagesPage = location.pathname === '/messages';

  return (
    <div className="app-layout">
      {!hideTopNav && <TopNav />}
      <DesktopSidebar />
      <main className={`main-content ${hideTopNav ? 'no-top-nav' : ''} ${isMessagesPage ? 'messages-page' : ''}`}>
        <div className={`container ${hideTopNav ? 'full-width' : ''}`}>
          <ErrorBoundary>
            <PullToRefreshWrapper>
              <Outlet />
            </PullToRefreshWrapper>
          </ErrorBoundary>
        </div>
      </main>
      <BottomNav currentPath={location.pathname} />
    </div>
  );
}

export default Layout;
