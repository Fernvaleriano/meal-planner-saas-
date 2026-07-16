import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useNativeFeel } from './hooks/useNativeFeel';
import Layout from './components/Layout';
// Tab pages (Dashboard, Diary, Messages, Workouts, Plans) are imported
// by Layout.jsx directly — they stay mounted persistently for instant switching.
import Settings from './pages/Settings';
import Recipes from './pages/Recipes';
import CheckIn from './pages/CheckIn';
import Progress from './pages/Progress';
import GymInfo from './pages/GymInfo';
import Feed from './pages/Feed';
import WorkoutHistory from './pages/WorkoutHistory';
import WorkoutPlans from './pages/WorkoutPlans';
import WorkoutBuilder from './pages/WorkoutBuilder';
import Notifications from './pages/Notifications';
import BrandingSettings from './pages/BrandingSettings';
import CoachBilling from './pages/CoachBilling';
import ClientBilling from './pages/ClientBilling';
import Challenges from './pages/Challenges';
import Leaderboard from './pages/Leaderboard';
import Shop from './pages/Shop';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import LoadingScreen from './components/LoadingScreen';

function ProtectedRoute({ children }) {
  const { user, loading, clientData, refreshClientData, logout } = useAuth();
  const location = useLocation();

  // Still loading auth state
  if (loading) {
    return <LoadingScreen />;
  }

  // Not logged in
  if (!user) {
    // Carry the coach id through to the login screen. An iOS home-screen
    // install launches at the manifest start_url (/app?coachId=X), but the
    // standalone PWA has its OWN storage container — none of the localStorage
    // set during the in-Safari login (login_coach_id, cached branding) is
    // present here, so the login page would fall back to the default
    // Ziquecoach brand. Forwarding ?coachId lets Login re-fetch and paint the
    // coach's brand even on this first, storage-empty launch. (We forward only
    // coachId, not the whole query string — Login already treats this param as
    // a first-class, un-persisted input, same as a branded invite link.)
    const coachId = new URLSearchParams(location.search).get('coachId');
    const to = coachId ? `/login?coachId=${encodeURIComponent(coachId)}` : '/login';
    return <Navigate to={to} replace />;
  }

  // Logged in but still fetching client data - show loading
  if (!clientData) {
    return <LoadingScreen />;
  }

  // fetchClientData exhausted retries and returned the
  // { id: null, error: true } fallback. Without this branch the truthy
  // error object passed straight through, Layout rendered, and every
  // page's `if (!clientData?.id) return` produced a silent broken
  // state (infinite spinner / blank chrome). Show an explicit recovery
  // UI with retry and sign-out options instead.
  if (clientData.error) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: '#1a1a1a',
        minHeight: '100vh',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <h2 style={{ marginBottom: '16px' }}>Couldn&apos;t load your account</h2>
        <p style={{ color: '#9ca3af', marginBottom: '24px', maxWidth: '320px' }}>
          {clientData.errorMessage || 'Something went wrong loading your data.'}
        </p>
        {clientData.errorMessage === 'No client record found' && (
          <p style={{ color: '#9ca3af', marginBottom: '24px', maxWidth: '320px', fontSize: '14px' }}>
            You may be signed into a different account. Try signing out and back in with the email you used to join.
          </p>
        )}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => { refreshClientData(); }}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { logout(); }}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: 'white',
              border: '1px solid #374151',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
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
  useNativeFeel();

  // iOS home-screen-installed PWAs treat window.location navigation as a
  // re-launch and route the user to the manifest start_url (/app, the
  // dashboard) regardless of which path the JS asked for. That breaks
  // the soft-reset flow — the client taps Refresh from Play Mode and
  // gets dropped on the food log instead. Detect the soft-reset flag
  // here, BEFORE any route renders, and React-Router our way to
  // /workouts without another page load. Workouts.jsx keeps the flag
  // alive long enough to auto-open Play Mode + auto-resume.
  //
  // localStorage (not sessionStorage) is critical here — iOS Safari
  // wipes sessionStorage on PWA re-launch. 30-second TTL on the flag
  // so stale values from old sessions can't trigger a false redirect.
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const raw = localStorage.getItem('zique_soft_reset_pending');
      if (raw) {
        const stamp = parseInt(raw, 10);
        if (!isNaN(stamp) && Date.now() - stamp < 30000) {
          navigate('/workouts', { replace: true });
        }
      }
    } catch { /* ignore */ }
  }, [navigate]);

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
        <Route path="gym-info" element={<GymInfo />} />
        <Route path="feed" element={<CoachOnlyRoute><Feed /></CoachOnlyRoute>} />
        <Route path="workout-history" element={<WorkoutHistory />} />
        <Route path="workout-plans" element={<WorkoutPlans />} />
        <Route path="workouts/builder" element={<CoachOnlyRoute><WorkoutBuilder /></CoachOnlyRoute>} />
        <Route path="workouts/builder/:id" element={<CoachOnlyRoute><WorkoutBuilder /></CoachOnlyRoute>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="branding" element={<CoachOnlyRoute><BrandingSettings /></CoachOnlyRoute>} />
        <Route path="billing" element={<CoachOnlyRoute><CoachBilling /></CoachOnlyRoute>} />
        <Route path="my-billing" element={<ClientBilling />} />
        <Route path="challenges" element={<Challenges />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="shop" element={<Shop />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
