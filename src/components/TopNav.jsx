import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet } from '../utils/api';
import { onAppResume, onAppSuspend } from '../hooks/useAppLifecycle';

const DEFAULT_LOGO_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/ziquecoach-logo-white.png';

// Cache notifications to avoid fetching on every mount
const notificationCache = {
  data: null,
  timestamp: 0,
  clientId: null
};
const NOTIFICATION_CACHE_TTL = 60000; // 1 minute cache

// Reset these module-level caches on logout. Without this, the first
// render after User B signs in on a shared device would briefly show
// User A's notification badge until the next fetch lands.
export function clearTopNavCaches() {
  notificationCache.data = null;
  notificationCache.timestamp = 0;
  notificationCache.clientId = null;
}

function TopNav() {
  const { clientData } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = branding?.brand_logo_url || DEFAULT_LOGO_URL;
  const logoAlt = branding?.brand_name || 'Ziquecoach';
  useEffect(() => { setLogoFailed(false); }, [logoUrl]);
  const [unreadCount, setUnreadCount] = useState(() => {
    if (notificationCache.data &&
        notificationCache.clientId === clientData?.id &&
        Date.now() - notificationCache.timestamp < NOTIFICATION_CACHE_TTL) {
      return notificationCache.data.unreadCount || 0;
    }
    return 0;
  });
  const hasFetchedRef = useRef(false);

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

    const handleNotificationsRead = (e) => {
      const newCount = e.detail?.unreadCount ?? 0;
      setUnreadCount(newCount);
      notificationCache.data = { ...notificationCache.data, unreadCount: newCount };
      notificationCache.timestamp = Date.now();
    };
    window.addEventListener('notifications-read', handleNotificationsRead);

    return () => {
      if (interval) clearInterval(interval);
      unsubSuspend();
      unsubResume();
      window.removeEventListener('notifications-read', handleNotificationsRead);
    };
  }, [fetchNotifications]);

  return (
    <nav className="top-nav">
      {/* Brand logo — coach's custom logo if set, otherwise Ziquecoach default */}
      <Link to="/" className="nav-left" aria-label={t('topNav.ariaHome')}>
        {!logoFailed ? (
          <img
            src={logoUrl}
            alt={logoAlt}
            className="nav-logo-left"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="nav-logo-fallback">{logoAlt}</span>
        )}
      </Link>
      <div className="nav-center"></div>

      {/* Right: Profile + Notifications. (Stories now live in the
          Instagram-style row at the top of the dashboard.) */}
      <div className="nav-right">
        <Link
          to="/settings"
          className="nav-profile-avatar-btn"
          aria-label={t('topNav.ariaProfileSettings')}
        >
          {clientData?.profile_photo_url ? (
            <img
              src={clientData.profile_photo_url}
              alt={t('topNav.profileAlt')}
              className="nav-profile-avatar-img"
            />
          ) : (
            <span className="nav-profile-avatar-initials">
              {clientData?.client_name
                ? clientData.client_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : '?'}
            </span>
          )}
        </Link>

        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => navigate('/notifications')}
            aria-label={t('topNav.ariaViewNotifications')}
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
