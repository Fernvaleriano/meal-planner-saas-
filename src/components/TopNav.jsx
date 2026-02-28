import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';
import { onAppResume, onAppSuspend } from '../hooks/useAppLifecycle';
import StoryViewer from './StoryViewer';

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

  // Fetch notifications (only for unread count badge)
  const fetchNotifications = useCallback(async (force = false) => {
    if (!clientData?.id) return;

    if (!force &&
        notificationCache.data &&
        notificationCache.clientId === clientData.id &&
        Date.now() - notificationCache.timestamp < NOTIFICATION_CACHE_TTL) {
      return;
    }

    try {
      const data = await apiGet(`/.netlify/functions/notifications?clientId=${clientData.id}`);

      notificationCache.data = data;
      notificationCache.timestamp = Date.now();
      notificationCache.clientId = clientData.id;

      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [clientData?.id]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchNotifications();
    }

    let interval = setInterval(() => fetchNotifications(true), 60000);

    const unsubSuspend = onAppSuspend(() => {
      clearInterval(interval);
      interval = null;
    });
    const unsubResume = onAppResume(() => {
      fetchNotifications(true);
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

    if (!force &&
        storyCache.data &&
        storyCache.clientId === clientData.id &&
        Date.now() - storyCache.timestamp < STORY_CACHE_TTL) {
      return;
    }

    try {
      const data = await apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`);

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

  useEffect(() => {
    if (!hasFetchedStoriesRef.current) {
      hasFetchedStoriesRef.current = true;
      fetchStories();
    }

    let interval = setInterval(() => fetchStories(true), 60000);

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

  const handleStoryClick = () => {
    if (stories.length > 0) {
      setShowStoryViewer(true);
    }
  };

  const handleStoryViewerClose = () => {
    setShowStoryViewer(false);
    setHasUnseenStories(false);
    fetchStories(true);
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

        <Link
          to="/settings"
          className="nav-btn"
          aria-label="Profile settings"
        >
          <User size={18} aria-hidden="true" />
        </Link>

        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => navigate('/notifications')}
            aria-label="View notifications"
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
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
    </nav>
  );
}

export default TopNav;
