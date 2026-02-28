import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Bell, MessageCircle, Heart, Dumbbell, UtensilsCrossed, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import NotificationDetail from '../components/NotificationDetail';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

function Notifications() {
  const { clientData } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const hasFetchedRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const data = await apiGet(`/.netlify/functions/notifications?clientId=${clientData.id}`);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [clientData?.id]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(fetchNotifications);

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

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'diary_reaction': return <Heart size={18} />;
      case 'diary_comment': return <MessageCircle size={18} />;
      case 'chat_message': return <MessageCircle size={18} />;
      case 'diet_plan_published': return <UtensilsCrossed size={18} />;
      case 'workout_assigned': return <Dumbbell size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const getNotificationIconClass = (type) => {
    switch (type) {
      case 'diary_reaction': return 'notif-icon reaction';
      case 'diary_comment': return 'notif-icon comment';
      case 'chat_message': return 'notif-icon message';
      case 'diet_plan_published': return 'notif-icon plan';
      case 'workout_assigned': return 'notif-icon workout';
      default: return 'notif-icon default';
    }
  };

  const handleNotificationClick = async (notif) => {
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

    if (notif.type === 'diary_reaction' || notif.type === 'diary_comment') {
      setSelectedNotification(notif);
    } else if (notif.type === 'chat_message') {
      navigate('/messages');
    } else if (notif.type === 'diet_plan_published') {
      navigate('/plans');
    } else if (notif.type === 'workout_assigned') {
      navigate('/workouts');
    }
  };

  return (
    <div className="notifications-page">
      <div className="notifications-page-header">
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft size={20} />
        </button>
        <h1>Notifications</h1>
        {unreadCount > 0 && (
          <button className="mark-all-read-btn" onClick={markAllRead}>
            <Check size={16} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="notifications-page-loading">
          <div className="spinner" />
          <p>Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="notifications-page-empty">
          <Bell size={48} />
          <h2>No notifications yet</h2>
          <p>When your coach reacts to your meals or sends you messages, they'll show up here.</p>
        </div>
      ) : (
        <div className="notifications-page-list">
          {unreadCount > 0 && (
            <div className="notifications-section-label">
              New ({unreadCount})
            </div>
          )}
          {notifications.filter(n => !n.is_read).map(notif => (
            <button
              key={notif.id}
              className="notifications-page-item unread"
              onClick={() => handleNotificationClick(notif)}
            >
              <div className={getNotificationIconClass(notif.type)}>
                {getNotificationIcon(notif.type)}
              </div>
              <div className="notifications-page-item-content">
                <div className="notifications-page-item-title">{notif.title}</div>
                {notif.message && (
                  <div className="notifications-page-item-message">{notif.message}</div>
                )}
                <div className="notifications-page-item-time">{formatTime(notif.created_at)}</div>
              </div>
              <div className="unread-indicator" />
            </button>
          ))}

          {notifications.some(n => n.is_read) && (
            <div className="notifications-section-label">
              Earlier
            </div>
          )}
          {notifications.filter(n => n.is_read).map(notif => (
            <button
              key={notif.id}
              className="notifications-page-item"
              onClick={() => handleNotificationClick(notif)}
            >
              <div className={getNotificationIconClass(notif.type)}>
                {getNotificationIcon(notif.type)}
              </div>
              <div className="notifications-page-item-content">
                <div className="notifications-page-item-title">{notif.title}</div>
                {notif.message && (
                  <div className="notifications-page-item-message">{notif.message}</div>
                )}
                <div className="notifications-page-item-time">{formatTime(notif.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedNotification && (
        <NotificationDetail
          notification={selectedNotification}
          clientId={clientData?.id}
          onClose={() => setSelectedNotification(null)}
          onReplySuccess={() => setSelectedNotification(null)}
        />
      )}
    </div>
  );
}

export default Notifications;
