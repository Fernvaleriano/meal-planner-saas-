import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, ScanLine, Heart, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function Dashboard() {
  const { clientData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayProgress, setTodayProgress] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
  const [targets, setTargets] = useState({
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65
  });
  const [streak, setStreak] = useState(0);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get first name from client name
  const firstName = clientData?.client_name?.split(' ')[0] || 'there';

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Load today's progress
  useEffect(() => {
    const loadProgress = async () => {
      if (!clientData?.id) return;

      try {
        const today = new Date().toISOString().split('T')[0];
        const data = await apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${today}`);

        if (data.entries) {
          const totals = data.entries.reduce((acc, entry) => ({
            calories: acc.calories + (entry.calories || 0),
            protein: acc.protein + (entry.protein || 0),
            carbs: acc.carbs + (entry.carbs || 0),
            fat: acc.fat + (entry.fat || 0)
          }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

          setTodayProgress(totals);
        }

        if (data.goals) {
          setTargets({
            calories: data.goals.calorie_goal || 2000,
            protein: data.goals.protein_goal || 150,
            carbs: data.goals.carbs_goal || 200,
            fat: data.goals.fat_goal || 65
          });
        }
      } catch (err) {
        console.error('Error loading progress:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProgress();
  }, [clientData?.id]);

  // Calculate progress percentages
  const getProgress = (current, target) => {
    if (!target) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  // Calculate stroke dashoffset for SVG ring
  const getStrokeDashoffset = (current, target) => {
    const circumference = 188.5; // 2 * PI * 30
    const progress = getProgress(current, target);
    return circumference - (progress / 100) * circumference;
  };

  // Render macro ring
  const MacroRing = ({ type, current, target, color }) => (
    <div className={`macro-ring ${type}`}>
      <svg viewBox="0 0 70 70">
        <circle className="bg" cx="35" cy="35" r="30" />
        <circle
          className="progress"
          cx="35"
          cy="35"
          r="30"
          style={{
            stroke: color,
            strokeDashoffset: getStrokeDashoffset(current, target)
          }}
        />
      </svg>
      <div className="macro-value">{Math.round(current)}</div>
      <div className="macro-label">
        {type === 'calories' ? 'cal' : `${Math.round(target)}g`}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div>
        {/* Skeleton loading */}
        <div className="greeting-section">
          <div className="skeleton skeleton-circle" style={{ width: '56px', height: '56px' }}></div>
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
          </div>
        </div>

        <div className="card">
          <div className="skeleton" style={{ height: '200px' }}></div>
        </div>

        <div className="quick-actions">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '100px' }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Greeting Section */}
      <div className="greeting-section">
        <div className="greeting-avatar">
          {getInitials(clientData?.client_name)}
        </div>
        <div className="greeting-text">
          <h1>
            {getGreeting()}, {firstName}!
            {streak > 0 && (
              <span className="streak-badge">
                <Flame size={14} /> {streak} day streak
              </span>
            )}
          </h1>
          <p className="greeting-subtext">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
      </div>

      {/* Today's Progress Card */}
      <div className="progress-card">
        <h2 className="section-title">Today's Progress</h2>

        <div className="macro-rings">
          <MacroRing
            type="calories"
            current={todayProgress.calories}
            target={targets.calories}
            color="var(--brand-primary)"
          />
          <MacroRing
            type="protein"
            current={todayProgress.protein}
            target={targets.protein}
            color="#3b82f6"
          />
          <MacroRing
            type="carbs"
            current={todayProgress.carbs}
            target={targets.carbs}
            color="#f59e0b"
          />
          <MacroRing
            type="fat"
            current={todayProgress.fat}
            target={targets.fat}
            color="#ef4444"
          />
        </div>

        <div className="overall-progress">
          <div className="overall-progress-bar">
            <div
              className="overall-progress-fill"
              style={{ width: `${getProgress(todayProgress.calories, targets.calories)}%` }}
            ></div>
          </div>
          <div className="overall-progress-text">
            <span>{todayProgress.calories} consumed</span>
            <span>{Math.max(0, targets.calories - todayProgress.calories)} remaining</span>
          </div>
        </div>

        <Link
          to="/diary"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '16px' }}
        >
          View Full Diary
        </Link>
      </div>

      {/* Quick Actions */}
      <h2 className="section-title" style={{ marginBottom: '12px' }}>Quick Log</h2>
      <div className="quick-actions">
        <Link to="/diary?action=photo" className="quick-action-btn">
          <div className="quick-action-icon">
            <Camera size={24} />
          </div>
          <span className="quick-action-label">Photo Log</span>
        </Link>

        <Link to="/diary?action=search" className="quick-action-btn">
          <div className="quick-action-icon">
            <Search size={24} />
          </div>
          <span className="quick-action-label">Search</span>
        </Link>

        <Link to="/diary?action=scan" className="quick-action-btn">
          <div className="quick-action-icon">
            <ScanLine size={24} />
          </div>
          <span className="quick-action-label">Scan Label</span>
        </Link>

        <Link to="/diary?action=favorites" className="quick-action-btn">
          <div className="quick-action-icon">
            <Heart size={24} />
          </div>
          <span className="quick-action-label">Favorites</span>
        </Link>
      </div>

      {/* Meal Plans Preview */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h2 className="section-title">Your Meal Plans</h2>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-text">View your meal plans</p>
          <Link to="/plans" className="btn btn-outline" style={{ marginTop: '12px' }}>
            Go to Meal Plans
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
