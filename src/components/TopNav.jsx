import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import { onAppResume, onAppSuspend } from '../hooks/useAppLifecycle';
import StoryViewer from './StoryViewer';
import NotificationDetail from './NotificationDetail';

// Cache notifications to avoid fetching on every mount
const notificationCache = {
  data: null,
  timestamp: 0,
  clientId: null
};
const NOTIFICATION_CACHE_TTL = 60000; // 1 minute cache

// Cache stories to avoid fetching on every mount
const storyCache = {
  data: null,
  timestamp: 0,
  clientId: null
};
const STORY_CACHE_TTL = 60000; // 1 minute cache

function TopNav() {
  const { clientData } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    // Initialize from cache if valid
    if (notificationCache.data &&
        notificationCache.clientId === clientData?.id &&
        Date.now() - notificationCache.timestamp < NOTIFICATION_CACHE_TTL) {
      return notificationCache.data.notifications || [];
    }
    return [];
  });
  const [unreadCount, setUnreadCount] = useState(() => {
    if (notificationCache.data &&
        notificationCache.clientId === clientData?.id &&
        Date.now() - notificationCache.timestamp < NOTIFICATION_CACHE_TTL) {
      return notificationCache.data.unreadCount || 0;
    }
    return 0;
  });
  const hasFetchedRef = useRef(false);

  // Story state
  const [stories, setStories] = useState(() => {
    if (storyCache.data &&
        storyCache.clientId === clientData?.id &&
        Date.now() - storyCache.timestamp < STORY_CACHE_TTL) {
      return storyCache.data.stories || [];
    }
    return [];
  });
  const [coachData, setCoachData] = useState(() => {
    if (storyCache.data &&
        storyCache.clientId === clientData?.id &&
        Date.now() - storyCache.timestamp < STORY_CACHE_TTL) {
      return {
        name: storyCache.data.coachName,
        avatar: storyCache.data.coachAvatar
      };
    }
    return null;
  });
  const [hasUnseenStories, setHasUnseenStories] = useState(() => {
    if (storyCache.data &&
        storyCache.clientId === clientData?.id &&
        Date.now() - storyCache.timestamp < STORY_CACHE_TTL) {
      return storyCache.data.hasUnseenStories || false;
    }
    return false;
  });
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const hasFetchedStoriesRef = useRef(false);

  // Selected notification for detail view
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Fetch notifications with caching
  const fetchNotifications = useCallback(async (force = false) => {
    if (!clientData?.id) return;

    // Check cache first (unless forced refresh)
    if (!force &&
        notificationCache.data &&
        notificationCache.clientId === clientData.id &&
        Date.now() - notificationCache.timestamp < NOTIFICATION_CACHE_TTL) {
      return; // Use cached data
    }

    try {
      const data = await apiGet(`/.netlify/functions/notifications?clientId=${clientData.id}`);

      // Update cache
      notificationCache.data = data;
      notificationCache.timestamp = Date.now();
      notificationCache.clientId = clientData.id;

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [clientData?.id]);

  // Load notifications on mount (with cache check) and periodically
  // Pauses polling when app is backgrounded, refreshes immediately on resume
  useEffect(() => {
    // Only fetch if we haven't already or cache is stale
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchNotifications();
    }

    // Refresh every 60 seconds (matching cache TTL)
    let interval = setInterval(() => fetchNotifications(true), 60000);

    // Pause polling when app goes to background, restart on resume
    const unsubSuspend = onAppSuspend(() => {
      clearInterval(interval);
      interval = null;
    });
    const unsubResume = onAppResume(() => {
      // Fetch fresh data immediately on resume
      fetchNotifications(true);
      // Restart polling
      if (!interval) {
        interval = setInterval(() => fetchNotifications(true), 60000);
      }
    });

    return () => {
      if (interval) clearInterval(interval);
      unsubSuspend();
      unsubResume();
    };
  }, [fetchNotifications]);

  // Fetch stories with caching
  const fetchStories = useCallback(async (force = false) => {
    if (!clientData?.id || !clientData?.coach_id) return;

    // Check cache first (unless forced refresh)
    if (!force &&
        storyCache.data &&
        storyCache.clientId === clientData.id &&
        Date.now() - storyCache.timestamp < STORY_CACHE_TTL) {
      return; // Use cached data
    }

    try {
      const data = await apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`);

      // Update cache
      storyCache.data = data;
      storyCache.timestamp = Date.now();
      storyCache.clientId = clientData.id;

      setStories(data.stories || []);
      setCoachData({
        name: data.coachName,
        avatar: data.coachAvatar
      });
      setHasUnseenStories(data.hasUnseenStories || false);
    } catch (err) {
      console.error('Error fetching stories:', err);
    }
  }, [clientData?.id, clientData?.coach_id]);

  // Load stories on mount (with cache check) and periodically
  // Pauses polling when app is backgrounded, refreshes immediately on resume
  useEffect(() => {
    if (!hasFetchedStoriesRef.current) {
      hasFetchedStoriesRef.current = true;
      fetchStories();
    }

    // Refresh every 60 seconds (matching cache TTL)
    let interval = setInterval(() => fetchStories(true), 60000);

    // Pause polling when app goes to background, restart on resume
    const unsubSuspend = onAppSuspend(() => {
      clearInterval(interval);
      interval = null;
    });
    const unsubResume = onAppResume(() => {
      fetchStories(true);
      if (!interval) {
        interval = setInterval(() => fetchStories(true), 60000);
      }
    });

    return () => {
      if (interval) clearInterval(interval);
      unsubSuspend();
      unsubResume();
    };
  }, [fetchStories]);

  // Handle story click
  const handleStoryClick = () => {
    if (stories.length > 0) {
      setShowStoryViewer(true);
    }
  };

  // Handle story viewer close
  const handleStoryViewerClose = () => {
    setShowStoryViewer(false);
    setHasUnseenStories(false);
    // Refresh stories to update viewed status
    fetchStories(true);
  };

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

    // Show detail modal for diary reactions and comments
    if (notif.type === 'diary_reaction' || notif.type === 'diary_comment') {
      setShowNotifications(false);
      setSelectedNotification(notif);
    } else if (notif.type === 'diet_plan_published') {
      setShowNotifications(false);
      navigate('/plans');
    } else if (notif.type === 'workout_assigned') {
      setShowNotifications(false);
      navigate('/workouts');
    } else {
      setShowNotifications(false);
    }
  };

  // Handle closing notification detail
  const handleCloseNotificationDetail = () => {
    setSelectedNotification(null);
  };

  // Handle reply success
  const handleReplySuccess = () => {
    // Could show a toast here
    setSelectedNotification(null);
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

      {/* Right: Stories + Notifications */}
      <div className="nav-right">
        {/* Stories button */}
        {stories.length > 0 && coachData && (
          <button
            className="nav-coach-story"
            onClick={handleStoryClick}
            aria-label="View coach stories"
          >
            <div className={`story-ring ${hasUnseenStories ? 'unseen' : ''}`}>
              <img
                src={coachData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachData.name || 'Coach')}&background=0d9488&color=fff`}
                alt={coachData.name || 'Coach'}
              />
            </div>
          </button>
        )}

        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="View notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={18} aria-hidden="true" />
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
                <button className="close-notifications-btn" onClick={() => setShowNotifications(false)} aria-label="Close notifications">
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

      {/* Story Viewer Modal */}
      {showStoryViewer && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          coachName={coachData?.name}
          coachAvatar={coachData?.avatar}
          clientId={clientData?.id}
          onClose={handleStoryViewerClose}
        />
      )}

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <NotificationDetail
          notification={selectedNotification}
          clientId={clientData?.id}
          onClose={handleCloseNotificationDetail}
          onReplySuccess={handleReplySuccess}
        />
      )}
    </nav>
  );
}

export default TopNav;
