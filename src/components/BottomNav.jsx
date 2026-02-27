import { Link } from 'react-router-dom';
import { Home, NotebookPen, Dumbbell, Utensils, User } from 'lucide-react';

function BottomNav({ currentPath }) {
  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    { path: '/workouts', icon: Dumbbell, label: 'Workouts' },
    { path: '/plans', icon: Utensils, label: 'Plans' },
    { path: '/settings', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ path, icon: Icon, label }) => (
        <Link
          key={path}
          to={path}
          className={`bottom-nav-item ${path === '/' ? currentPath === '/' ? 'active' : '' : currentPath.startsWith(path) ? 'active' : ''}`}
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
