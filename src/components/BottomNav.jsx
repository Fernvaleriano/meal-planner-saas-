import { NavLink } from 'react-router-dom'
import { Home, NotebookPen, Utensils, User } from 'lucide-react'

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`} end>
        <div className="nav-icon">
          <Home size={24} />
        </div>
        <span className="nav-label">Home</span>
      </NavLink>

      <NavLink to="/diary" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <div className="nav-icon">
          <NotebookPen size={24} />
        </div>
        <span className="nav-label">Diary</span>
      </NavLink>

      <NavLink to="/plans" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <div className="nav-icon">
          <Utensils size={24} />
        </div>
        <span className="nav-label">Meal Plans</span>
      </NavLink>

      <NavLink to="/settings" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <div className="nav-icon">
          <User size={24} />
        </div>
        <span className="nav-label">Profile</span>
      </NavLink>
    </nav>
  )
}
