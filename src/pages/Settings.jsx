import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { User, Mail, Target, Scale, LogOut, Moon, Sun } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Settings() {
  const { clientData, signOut } = useAuth()
  const { showToast } = useToast()
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    // Check current theme
    const theme = document.documentElement.getAttribute('data-theme')
    setDarkMode(theme === 'dark')
  }, [])

  const toggleDarkMode = () => {
    const newTheme = darkMode ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
    setDarkMode(!darkMode)
    showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`)
  }

  const handleSignOut = () => {
    if (confirm('Are you sure you want to sign out?')) {
      signOut()
    }
  }

  // Redirect to legacy profile page for detailed editing
  const editProfile = () => {
    window.location.href = '/client-profile.html'
  }

  return (
    <div className="settings">
      <div className="welcome-header">
        <h1>Profile</h1>
        <p>Manage your account settings</p>
      </div>

      {/* Profile Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--brand-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 700
          }}>
            {clientData?.name?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 style={{ fontWeight: 700, marginBottom: 4 }}>{clientData?.name || 'User'}</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--gray-500)' }}>{clientData?.email || ''}</p>
          </div>
        </div>

        <button
          onClick={editProfile}
          style={{
            width: '100%',
            padding: 12,
            background: 'var(--gray-100)',
            border: 'none',
            borderRadius: 10,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <User size={18} />
          Edit Profile
        </button>
      </div>

      {/* Goals Card */}
      <div className="card">
        <h3 className="section-title">
          <span className="section-icon"><Target size={16} /></span>
          Daily Goals
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 4 }}>Calories</div>
            <div style={{ fontWeight: 700 }}>{clientData?.daily_calories || 2000}</div>
          </div>
          <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 4 }}>Protein</div>
            <div style={{ fontWeight: 700, color: '#3b82f6' }}>{clientData?.daily_protein || 150}g</div>
          </div>
          <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 4 }}>Carbs</div>
            <div style={{ fontWeight: 700, color: '#f59e0b' }}>{clientData?.daily_carbs || 200}g</div>
          </div>
          <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 4 }}>Fat</div>
            <div style={{ fontWeight: 700, color: '#ef4444' }}>{clientData?.daily_fat || 65}g</div>
          </div>
        </div>
      </div>

      {/* Preferences Card */}
      <div className="card">
        <h3 className="section-title">
          <span className="section-icon">{darkMode ? <Moon size={16} /> : <Sun size={16} />}</span>
          Preferences
        </h3>

        <div
          onClick={toggleDarkMode}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            background: 'var(--gray-50)',
            borderRadius: 10,
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {darkMode ? <Moon size={20} /> : <Sun size={20} />}
            <span style={{ fontWeight: 500 }}>Dark Mode</span>
          </div>
          <div style={{
            width: 48,
            height: 28,
            background: darkMode ? 'var(--brand-primary)' : 'var(--gray-300)',
            borderRadius: 14,
            padding: 2,
            transition: 'background 0.2s'
          }}>
            <div style={{
              width: 24,
              height: 24,
              background: 'white',
              borderRadius: '50%',
              transform: darkMode ? 'translateX(20px)' : 'translateX(0)',
              transition: 'transform 0.2s'
            }} />
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        style={{
          width: '100%',
          padding: 14,
          background: '#fee2e2',
          color: '#ef4444',
          border: 'none',
          borderRadius: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 8
        }}
      >
        <LogOut size={18} />
        Sign Out
      </button>

      {/* Version Info */}
      <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8rem', color: 'var(--gray-400)' }}>
        Zique Fitness v2.0 (SPA)
      </p>
    </div>
  )
}
