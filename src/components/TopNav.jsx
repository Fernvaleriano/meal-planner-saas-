import { useAuth } from '../context/AuthContext'
import { Settings, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function TopNav() {
  const { clientData, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <nav className="top-nav">
      <a href="/" className="nav-brand" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(7).svg"
          alt="Logo"
          className="nav-logo-img"
        />
      </a>
      <div className="nav-actions">
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={signOut}
          aria-label="Sign out"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  )
}
