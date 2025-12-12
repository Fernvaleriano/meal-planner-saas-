import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Diary from './pages/Diary'
import Plans from './pages/Plans'
import Settings from './pages/Settings'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner"></div>
        <div className="app-loading-text">Loading...</div>
      </div>
    )
  }

  // If not logged in, redirect to legacy login page
  if (!user) {
    window.location.href = '/login.html'
    return null
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="diary" element={<Diary />} />
        <Route path="plans" element={<Plans />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      {/* Redirect old paths to new SPA routes */}
      <Route path="/client-dashboard.html" element={<Navigate to="/" replace />} />
      <Route path="/client-diary.html" element={<Navigate to="/diary" replace />} />
      <Route path="/client-plans.html" element={<Navigate to="/plans" replace />} />
      <Route path="/client-settings.html" element={<Navigate to="/settings" replace />} />
    </Routes>
  )
}

export default App
