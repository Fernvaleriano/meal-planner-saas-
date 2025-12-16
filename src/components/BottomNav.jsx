import { Link } from 'react-router-dom';
import { Home, NotebookPen, Utensils, User, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function BottomNav({ currentPath }) {
  const { user, clientData } = useAuth();

  // Check if user is a coach (their auth ID is a coach_id in the clients table)
  // For coaches, show Feed in navigation
  const isCoach = user && clientData?.coach_id === user.id;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    ...(isCoach ? [{ path: '/feed', icon: Activity, label: 'Feed' }] : []),
    { path: '/plans', icon: Utensils, label: 'Plans' },
    { path: '/settings', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ path, icon: Icon, label }) => (
        <Link
          key={path}
          to={path}
          className={`bottom-nav-item ${currentPath === path ? 'active' : ''}`}
          aria-label={`Navigate to ${label}`}
          aria-current={currentPath === path ? 'page' : undefined}
        >
          <div className="nav-icon">
            <Icon size={24} aria-hidden="true" />
          </div>
          <span className="nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default BottomNav;
