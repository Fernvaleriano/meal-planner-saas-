import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';
import CoachSidebar from './CoachSidebar';
import ErrorBoundary from './ErrorBoundary';

function Layout() {
  const location = useLocation();
  const { clientData } = useAuth();
  const isCoach = clientData?.is_coach === true;

  // Coach-specific state
  const [selectedClient, setSelectedClient] = useState(null);

  // Hide top nav on pages that have their own navigation
  const hideTopNav = location.pathname === '/workouts';

  if (isCoach) {
    return (
      <div className="app-layout coach-layout">
        <CoachSidebar selectedClient={selectedClient} onSelectClient={setSelectedClient} />
        <main className="main-content coach-main">
          <div className="container">
            <ErrorBoundary>
              <Outlet context={{ selectedClient, onSelectClient: setSelectedClient }} />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {!hideTopNav && <TopNav />}
      <DesktopSidebar />
      <main className={`main-content ${hideTopNav ? 'no-top-nav' : ''}`}>
        <div className={`container ${hideTopNav ? 'full-width' : ''}`}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <BottomNav currentPath={location.pathname} />
    </div>
  );
}

export default Layout;
