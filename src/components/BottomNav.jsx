import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Home, NotebookPen, Dumbbell, MessageCircle, UtensilsCrossed, Trophy, Info, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { apiGet } from '../utils/api';

function BottomNav({ currentPath }) {
  const { user, clientData } = useAuth();
  const { isModuleVisible, getLabel } = useBranding();
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
      let interval = setInterval(fetchUnread, 30000);

      // Pause polling when backgrounded to save battery on Android
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
          clearInterval(interval);
          interval = null;
        } else if (!interval) {
          fetchUnread();
          interval = setInterval(fetchUnread, 30000);
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [clientData?.id, fetchUnread]);

  useEffect(() => {
    if (currentPath === '/messages') {
      // Clear badge immediately when entering Messages
      setUnreadMessages(0);
    } else {
      fetchUnread();
    }
  }, [currentPath, fetchUnread]);

  // Instant badge update: Messages.jsx dispatches 'new-unread-message' when
  // a realtime message arrives while the user is on another tab.
  useEffect(() => {
    const handleNewUnread = () => {
      if (currentPath !== '/messages') {
        setUnreadMessages(prev => prev + 1);
      }
    };
    window.addEventListener('new-unread-message', handleNewUnread);
    return () => window.removeEventListener('new-unread-message', handleNewUnread);
  }, [currentPath]);

  // Build nav items, filtering by module visibility for clients
  // Coaches always see all tabs
  const navItems = useMemo(() => {
    const allItems = [
      { path: '/', icon: Home, label: getLabel('home'), moduleKey: null },
      { path: '/diary', icon: NotebookPen, label: getLabel('diary'), moduleKey: 'diary' },
      { path: '/messages', icon: MessageCircle, label: getLabel('messages'), badge: unreadMessages, moduleKey: 'messages' },
      { path: '/workouts', icon: Dumbbell, label: getLabel('workouts'), moduleKey: 'workouts' },
      { path: '/plans', icon: UtensilsCrossed, label: getLabel('plans'), moduleKey: 'plans' }
    ];

    if (isCoach) return allItems;
    const visible = allItems.filter(item => !item.moduleKey || isModuleVisible(item.moduleKey));
    // Gym members get a Leaderboard ("Ranks") tab. It's a member-only competition
    // surface, so coaches (who see the full coaching toolset) don't get it here.
    // Coaches can hide it from their clients via the Ranks module toggle; it
    // stays on by default (isModuleVisible returns true unless explicitly off).
    if (isModuleVisible('leaderboard')) {
      visible.push({ path: '/leaderboard', icon: Trophy, label: getLabel('ranks'), moduleKey: 'leaderboard' });
    }
    // Shop / Drops tab: clothing + supplement promos. Off by default for every
    // gym (DEFAULT_BRANDING.client_modules.shop === false); a gym opts in and
    // only then does this tab appear.
    if (isModuleVisible('shop')) {
      visible.push({ path: '/shop', icon: ShoppingBag, label: getLabel('shop'), moduleKey: 'shop' });
    }
    // Gym members (nutrition/diary turned off -> the workout-only "gym home")
    // get a Gym Info tab here instead of a home-screen tile. Full coaching
    // clients keep the diary and don't get this tab (their nav is already full).
    if (!isModuleVisible('diary')) {
      visible.push({ path: '/gym-info', icon: Info, label: getLabel('gym_info'), moduleKey: null });
    }
    return visible;
  }, [isCoach, isModuleVisible, getLabel, unreadMessages]);

  return (
    <nav className={`bottom-nav ${navItems.length >= 6 ? 'has-six' : ''}`} role="navigation" aria-label="Main navigation">
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
