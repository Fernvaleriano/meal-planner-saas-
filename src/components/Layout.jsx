import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DesktopSidebar from './DesktopSidebar';

function Layout() {
  const location = useLocation();

  return (
    <div className="app-layout">
      <TopNav />
      <DesktopSidebar />
      <main className="main-content">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <BottomNav currentPath={location.pathname} />
    </div>
  );
}

export default Layout;
