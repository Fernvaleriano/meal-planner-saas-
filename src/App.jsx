import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Diary from './pages/Diary';
import Plans from './pages/Plans';
import Workouts from './pages/Workouts';
import Settings from './pages/Settings';
import Recipes from './pages/Recipes';
import CheckIn from './pages/CheckIn';
import Progress from './pages/Progress';
import Feed from './pages/Feed';
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

function App() {
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
        <Route index element={<Dashboard />} />
        <Route path="diary" element={<Diary />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/:planId" element={<Plans />} />
        <Route path="workouts" element={<Workouts />} />
        <Route path="settings" element={<Settings />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="progress" element={<Progress />} />
        <Route path="feed" element={<Feed />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
