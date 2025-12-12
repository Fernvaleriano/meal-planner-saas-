import { Link } from 'react-router-dom';
import { Home, NotebookPen, Utensils, User } from 'lucide-react';

function BottomNav({ currentPath }) {
  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/diary', icon: NotebookPen, label: 'Diary' },
    { path: '/plans', icon: Utensils, label: 'Meal Plans' },
    { path: '/settings', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(({ path, icon: Icon, label }) => (
        <Link
          key={path}
          to={path}
          className={`bottom-nav-item ${currentPath === path ? 'active' : ''}`}
        >
          <div className="nav-icon">
            <Icon size={24} />
          </div>
          <span className="nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default BottomNav;
