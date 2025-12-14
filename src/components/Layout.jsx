import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';

function Layout() {
  const location = useLocation();

  // Hide top nav on pages that have their own navigation
  const hideTopNav = location.pathname === '/workouts';

  return (
    <div className="app-layout">
      {!hideTopNav && <TopNav />}
      <DesktopSidebar />
      <main className={`main-content ${hideTopNav ? 'no-top-nav' : ''}`}>
        <div className={`container ${hideTopNav ? 'full-width' : ''}`}>
          <Outlet />
        </div>
      </main>
      <BottomNav currentPath={location.pathname} />
    </div>
  );
}

export default Layout;
