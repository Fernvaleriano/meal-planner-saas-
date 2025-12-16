import { Link, useLocation } from 'react-router-dom';
import { Home, NotebookPen, Utensils, User, LogOut, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function DesktopSidebar() {
  const location = useLocation();
  const { user, clientData, logout } = useAuth();

  // Check if user is a coach (their auth ID matches their own coach_id)
  const isCoach = user && clientData?.coach_id === user.id;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    ...(isCoach ? [{ path: '/feed', icon: Activity, label: 'Client Feed' }] : []),
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
        {navItems.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`desktop-nav-item ${location.pathname === path ? 'active' : ''}`}
          >
            <Icon size={20} />
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
