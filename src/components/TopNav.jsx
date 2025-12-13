import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

function TopNav() {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <nav className="top-nav">
      <Link to="/" className="nav-brand">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(7).svg"
          alt="Zique Fitness"
          className="nav-logo-img"
        />
      </Link>

      <div className="nav-actions">
        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
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
      </div>
    </nav>
  );
}

export default TopNav;
