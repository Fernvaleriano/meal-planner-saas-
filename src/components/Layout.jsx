import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import Toast from './Toast'

export default function Layout() {
  return (
    <div className="app-container">
      <TopNav />
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
      <Toast />
    </div>
  )
}
