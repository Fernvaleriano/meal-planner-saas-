import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import Layout from './components/Layout';
// Tab pages (Dashboard, Diary, Messages, Workouts, Plans) are imported
// by Layout.jsx directly — they stay mounted persistently for instant switching.
import Settings from './pages/Settings';
import Recipes from './pages/Recipes';
import CheckIn from './pages/CheckIn';
import Progress from './pages/Progress';
import Feed from './pages/Feed';
import WorkoutHistory from './pages/WorkoutHistory';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import LoadingScreen from './components/LoadingScreen';

function ProtectedRoute({ children }) {
  const { user, loading, clientData } = useAuth();

  // Still loading auth state
  if (loading) {
    return <LoadingScreen />;
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but still fetching client data - show loading
  if (!clientData) {
    return <LoadingScreen />;
  }

  return children;
}

function CoachOnlyRoute({ children }) {
  const { clientData } = useAuth();

  if (clientData?.is_coach !== true) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  // Initialize app lifecycle handling (visibilitychange, session refresh on resume)
  useAppLifecycle();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Tab pages are rendered persistently by Layout.jsx (not unmounted
            on navigation) so switching tabs feels instant. These null routes
            exist only to tell React Router these paths are valid. */}
        <Route index element={null} />
        <Route path="diary" element={null} />
        <Route path="plans" element={null} />
        <Route path="plans/:planId" element={null} />
        <Route path="workouts" element={null} />
        <Route path="messages" element={null} />

        {/* Non-tab pages render normally via Outlet */}
        <Route path="settings" element={<Settings />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="progress" element={<Progress />} />
        <Route path="feed" element={<CoachOnlyRoute><Feed /></CoachOnlyRoute>} />
        <Route path="workout-history" element={<WorkoutHistory />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
