import { useState } from 'react';
import { Heart, Bell, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function TopNav() {
  const { logout, theme, toggleTheme } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <nav className="top-nav">
      <a href="/app-test" className="nav-brand">
        <img src="/icons/logo.png" alt="Zique Fitness" className="nav-logo-img" />
      </a>

      <div className="nav-actions">
        <button
          className="nav-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <a href="/app-test/plans?tab=favorites" className="nav-btn">
          <Heart size={20} />
        </a>

        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={20} />
          </button>
          {showNotifications && (
            <div className="notification-dropdown show">
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-500)' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>

        <button className="nav-btn" onClick={logout}>
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}

export default TopNav;
