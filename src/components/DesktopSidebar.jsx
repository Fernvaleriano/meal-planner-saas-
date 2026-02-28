import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, NotebookPen, Utensils, User, LogOut, Activity, Dumbbell, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function DesktopSidebar() {
  const location = useLocation();
  const { user, clientData, logout } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Check if user is a coach (has entry in coaches table)
  const isCoach = clientData?.is_coach === true;

  // Poll for unread message count
  const fetchUnread = useCallback(async () => {
    try {
      const url = isCoach
        ? `/.netlify/functions/chat?action=conversations&coachId=${user?.id}`
        : `/.netlify/functions/chat?action=client-conversations&clientId=${clientData?.id}`;
      if (isCoach && !user?.id) return;
      const result = await apiGet(url);
      const total = (result.conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setUnreadMessages(total);
    } catch (e) { /* silent */ }
  }, [isCoach, user?.id, clientData?.id]);

  useEffect(() => {
    if (clientData?.id) {
      fetchUnread();
      const interval = setInterval(fetchUnread, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [clientData?.id, fetchUnread]);

  // Refresh unread when navigating away from messages
  useEffect(() => {
    if (location.pathname !== '/messages') {
      fetchUnread();
    }
  }, [location.pathname, fetchUnread]);

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    ...(isCoach ? [{ path: '/feed', icon: Activity, label: 'Client Feed' }] : []),
    { path: '/messages', icon: MessageCircle, label: 'Messages', badge: unreadMessages },
    { path: '/workouts', icon: Dumbbell, label: 'Workouts' },
    { path: '/plans', icon: Utensils, label: 'Meal Plans' },
    { path: '/settings', icon: User, label: 'Profile' }
  ];

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <aside className="desktop-nav">
      <div className="desktop-nav-logo">
        <img src="/icons/logo.png" alt="Zique Fitness" />
        <span>Zique Fitness</span>
      </div>

      <div className="desktop-nav-items">
        {navItems.map(({ path, icon: Icon, label, badge }) => (
          <Link
            key={path}
            to={path}
            className={`desktop-nav-item ${location.pathname === path ? 'active' : ''}`}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={20} />
              {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
            </div>
            <span>{label}</span>
          </Link>
        ))}
      </div>

      <div className="desktop-nav-user">
        <div className="desktop-nav-avatar">
          {getInitials(clientData?.client_name)}
        </div>
        <div className="desktop-nav-user-info">
          <div className="desktop-nav-user-name">
            {clientData?.client_name || 'User'}
          </div>
          <div className="desktop-nav-user-email">
            {clientData?.email || ''}
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--gray-500)',
            padding: '8px'
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

export default DesktopSidebar;
