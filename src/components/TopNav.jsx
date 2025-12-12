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
        <img src="/icons/logo.png" alt="Zique Fitness" className="nav-logo-img" />
        <span className="nav-brand-text">Zique<br/>Fitness</span>
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
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <Link to="/plans?tab=favorites" className="nav-btn">
          <Heart size={20} />
        </Link>

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
