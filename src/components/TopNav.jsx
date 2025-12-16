import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';

function TopNav() {
  const { clientData } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!clientData?.id) return;

    try {
      const data = await apiGet(`/.netlify/functions/notifications?clientId=${clientData.id}`);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [clientData?.id]);

  // Load notifications on mount and periodically
  useEffect(() => {
    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Mark all as read
  const markAllRead = async () => {
    if (!clientData?.id || unreadCount === 0) return;

    try {
      await apiPost('/.netlify/functions/notifications', {
        clientId: clientData.id,
        markAllRead: true
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  };

  // Format time
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Handle notification click
  const handleNotificationClick = async (notif) => {
    // Mark as read if unread
    if (!notif.is_read) {
      try {
        await apiPost('/.netlify/functions/notifications', {
          notificationIds: [notif.id]
        });
        setNotifications(prev => prev.map(n =>
          n.id === notif.id ? { ...n, is_read: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }

    // Navigate based on notification type
    if (notif.type === 'diary_reaction' || notif.type === 'diary_comment') {
      // Navigate to diary - use metadata date if available, otherwise today
      const dateParam = notif.metadata?.entry_date || '';
      setShowNotifications(false);
      navigate(dateParam ? `/diary?date=${dateParam}` : '/diary');
    } else {
      setShowNotifications(false);
    }
  };

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
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          {showNotifications && (
            <div className="notification-dropdown show" role="menu" aria-label="Notifications">
              <div className="notification-header">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button className="mark-read-btn" onClick={markAllRead}>
                    <Check size={14} /> Mark all read
                  </button>
                )}
                <button className="close-notifications-btn" onClick={() => setShowNotifications(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map(notif => (
                    <button
                      key={notif.id}
                      className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="notification-content">
                        <div className="notification-title">{notif.title}</div>
                        {notif.message && (
                          <div className="notification-message">{notif.message}</div>
                        )}
                        <div className="notification-time">{formatTime(notif.created_at)}</div>
                      </div>
                      {!notif.is_read && <div className="notification-dot" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
