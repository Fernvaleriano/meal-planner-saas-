import { Link } from 'react-router-dom';
import { Home, NotebookPen, Dumbbell, Utensils, User, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function BottomNav({ currentPath }) {
  const { clientData } = useAuth();

  // Check if user is a coach (has entry in coaches table)
  const isCoach = clientData?.is_coach === true;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    ...(isCoach ? [{ path: '/feed', icon: Activity, label: 'Feed' }] : [{ path: '/workouts', icon: Dumbbell, label: 'Workouts' }]),
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
