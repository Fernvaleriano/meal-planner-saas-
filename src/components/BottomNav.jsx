import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Home, NotebookPen, Dumbbell, MessageCircle, Utensils } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function BottomNav({ currentPath }) {
  const { user, clientData } = useAuth();
  const isCoach = clientData?.is_coach === true;
  const [unreadMessages, setUnreadMessages] = useState(0);

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
      const interval = setInterval(fetchUnread, 30000);
      return () => clearInterval(interval);
    }
  }, [clientData?.id, fetchUnread]);

  useEffect(() => {
    if (currentPath !== '/messages') fetchUnread();
  }, [currentPath, fetchUnread]);

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    { path: '/messages', icon: MessageCircle, label: 'Messages', badge: unreadMessages },
    { path: '/workouts', icon: Dumbbell, label: 'Workouts' },
    { path: '/plans', icon: Utensils, label: 'Plans' }
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ path, icon: Icon, label, badge }) => (
        <Link
          key={path}
          to={path}
          className={`bottom-nav-item ${path === '/' ? currentPath === '/' ? 'active' : '' : currentPath.startsWith(path) ? 'active' : ''}`}
          aria-label={`Navigate to ${label}`}
          aria-current={currentPath === path ? 'page' : undefined}
        >
          <div className="nav-icon" style={{ position: 'relative' }}>
            <Icon size={24} aria-hidden="true" />
            {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
          </div>
          <span className="nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default BottomNav;
