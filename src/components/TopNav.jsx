import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

function TopNav() {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <nav className="top-nav">
      {/* Left: Logo */}
      <Link to="/" className="nav-left" aria-label="Go to home">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(7).svg"
          alt="Zique Fitness"
          className="nav-logo-left"
        />
      </Link>

      {/* Center: Empty spacer */}
      <div className="nav-center"></div>

      {/* Right: Notifications */}
      <div className="nav-right">
        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="View notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={20} aria-hidden="true" />
          </button>
          {showNotifications && (
            <div className="notification-dropdown show" role="menu" aria-label="Notifications">
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-500)' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
