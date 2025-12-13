import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Bell, LogOut, Moon, Sun, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function TopNav() {
  const { logout, theme, toggleTheme, clientData } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [streak, setStreak] = useState(0);

  // Load streak on mount
  useEffect(() => {
    const loadStreak = async () => {
      if (!clientData?.id) return;
      try {
        const data = await apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${new Date().toISOString().split('T')[0]}`);
        if (data.streak) {
          setStreak(data.streak);
        }
      } catch (err) {
        console.error('Error loading streak:', err);
      }
    };
    loadStreak();
  }, [clientData?.id]);

  return (
    <nav className="top-nav">
      <Link to="/" className="nav-brand">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(7).svg"
          alt="Zique Fitness"
          className="nav-logo-img"
        />
      </Link>

      {/* Streak Badge */}
      {streak > 0 && (
        <div className="streak-badge-nav">
          <RefreshCw size={14} />
          <span>{streak} days</span>
        </div>
      )}

      <div className="nav-actions">
        <button
          className="nav-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>

        <Link to="/plans?tab=favorites" className="nav-btn" aria-label="View favorite meals">
          <Heart size={20} aria-hidden="true" />
        </Link>

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
            <div className="notification-dropdown show">
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-500)' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>

        <button className="nav-btn" onClick={logout} aria-label="Log out">
          <LogOut size={20} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default TopNav;
