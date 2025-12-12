import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, Heart, ScanLine, Mic, ChevronRight, BarChart3, ClipboardCheck, TrendingUp, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';

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
    calories: 2600,
    protein: 221,
    carbs: 260,
    fat: 75
  });
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [foodInput, setFoodInput] = useState('');
  const [isLogging, setIsLogging] = useState(false);

  // Auto-select meal type based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) setSelectedMealType('breakfast');
    else if (hour >= 11 && hour < 15) setSelectedMealType('lunch');
    else if (hour >= 15 && hour < 21) setSelectedMealType('dinner');
    else setSelectedMealType('snack');
  }, []);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getGreetingSubtext = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Ready to start your day?';
    if (hour < 17) return 'How is your day going?';
    return 'How was your day?';
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
            calories: data.goals.calorie_goal || 2600,
            protein: data.goals.protein_goal || 221,
            carbs: data.goals.carbs_goal || 260,
            fat: data.goals.fat_goal || 75
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

  // Calculate overall progress percentage
  const getOverallProgress = () => {
    if (!targets.calories) return 0;
    return Math.min(100, Math.round((todayProgress.calories / targets.calories) * 100));
  };

  // Format today's date
  const formatTodayDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Handle food logging
  const handleLogFood = async () => {
    if (!foodInput.trim() || !selectedMealType) return;

    setIsLogging(true);
    try {
      // Call AI to parse the food
      const data = await apiPost('/.netlify/functions/client-diary-ai', {
        clientId: clientData.id,
        message: foodInput,
        mealType: selectedMealType
      });

      // TODO: Show confirmation modal with parsed food
      console.log('AI response:', data);
      setFoodInput('');
    } catch (err) {
      console.error('Error logging food:', err);
    } finally {
      setIsLogging(false);
    }
  };

  // Render progress ring with value inside
  const ProgressRing = ({ current, target, color, label }) => {
    const radius = 27;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, (current / target) * 100);
    const offset = circumference - (progress / 100) * circumference;

    return (
      <div className="progress-ring-container">
        <svg viewBox="0 0 70 70" className="ring-svg">
          <circle
            cx="35"
            cy="35"
            r={radius}
            className="ring-bg"
          />
          <circle
            cx="35"
            cy="35"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="progress-ring-value">
          <span className="current">{Math.round(current)}</span>
          <span className="target">/{target}{label !== 'Calories' ? 'g' : ''}</span>
        </div>
        <div className="progress-ring-label">{label}</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="skeleton-greeting">
          <div className="skeleton skeleton-circle" style={{ width: '64px', height: '64px' }}></div>
          <div className="skeleton-text-group">
            <div className="skeleton" style={{ width: '200px', height: '28px' }}></div>
            <div className="skeleton" style={{ width: '150px', height: '16px', marginTop: '8px' }}></div>
          </div>
        </div>
        <div className="skeleton" style={{ height: '280px', borderRadius: '20px', marginTop: '20px' }}></div>
        <div className="skeleton" style={{ height: '200px', borderRadius: '20px', marginTop: '16px' }}></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Greeting Section */}
      <div className="greeting-section">
        <div className="greeting-with-avatar">
          {clientData?.avatar_url ? (
            <img
              src={clientData.avatar_url}
              alt={clientData.client_name}
              className="greeting-avatar-img"
            />
          ) : (
            <div className="greeting-avatar">
              {clientData?.client_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
          )}
          <div className="greeting-text">
            <h1>Welcome back, {clientData?.client_name?.split(' ')[0] || 'there'}!</h1>
            <p className="greeting-subtext">{getGreetingSubtext()}</p>
          </div>
        </div>
      </div>

      {/* AI Hero Input Section */}
      <div className="ai-hero-card">
        <div className="ai-hero-header">
          <div className="ai-hero-icon">
            <span>⭐</span>
          </div>
          <div className="ai-hero-title">
            <h3>What did you eat?</h3>
            <span className="ai-powered-label">AI-powered logging</span>
          </div>
        </div>

        {/* Meal Type Selector */}
        <div className="meal-type-selector">
          {[
            { id: 'breakfast', icon: '🌅', label: 'Breakfast' },
            { id: 'lunch', icon: '🌤️', label: 'Lunch' },
            { id: 'dinner', icon: '🌙', label: 'Dinner' },
            { id: 'snack', icon: '🍎', label: 'Snack' }
          ].map(meal => (
            <button
              key={meal.id}
              className={`meal-type-btn ${selectedMealType === meal.id ? 'active' : ''}`}
              onClick={() => setSelectedMealType(meal.id)}
            >
              <span className="meal-icon">{meal.icon}</span>
              <span className="meal-label">{meal.label}</span>
            </button>
          ))}
        </div>

        {/* Food Input */}
        <textarea
          className="food-input"
          placeholder="Describe what you ate... e.g., 'Grilled chicken with rice and vegetables' or 'A large coffee with oat milk'"
          value={foodInput}
          onChange={(e) => setFoodInput(e.target.value)}
          rows={2}
        />

        {/* Action Buttons */}
        <div className="ai-hero-actions">
          <button className="voice-btn">
            <Mic size={20} />
          </button>
          <button
            className="log-food-btn"
            onClick={handleLogFood}
            disabled={isLogging || !foodInput.trim()}
          >
            {isLogging ? 'Logging...' : 'Log Food'} <ChevronRight size={18} />
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="ai-hero-quick-actions">
          <button className="quick-action-pill">
            <Camera size={16} /> Snap Photo
          </button>
          <button className="quick-action-pill">
            <Search size={16} /> Search Foods
          </button>
          <button className="quick-action-pill">
            <Heart size={16} /> Favorites
          </button>
          <button className="quick-action-pill">
            <ScanLine size={16} /> Scan Label
          </button>
        </div>
      </div>

      {/* Today's Progress Card */}
      <div className="progress-card">
        <div className="progress-card-header">
          <div className="progress-card-title">
            <BarChart3 size={20} className="progress-icon" />
            <h3>Today's Progress</h3>
          </div>
          <span className="progress-date">{formatTodayDate()}</span>
        </div>

        <div className="progress-rings">
          <ProgressRing
            current={todayProgress.calories}
            target={targets.calories}
            color="#3b82f6"
            label="Calories"
          />
          <ProgressRing
            current={todayProgress.protein}
            target={targets.protein}
            color="#ef4444"
            label="Protein"
          />
          <ProgressRing
            current={todayProgress.carbs}
            target={targets.carbs}
            color="#f59e0b"
            label="Carbs"
          />
          <ProgressRing
            current={todayProgress.fat}
            target={targets.fat}
            color="#a855f7"
            label="Fat"
          />
        </div>

        <div className="daily-progress-bar">
          <div className="daily-progress-header">
            <span>Daily Goal Progress</span>
            <span className="daily-progress-percent">{getOverallProgress()}%</span>
          </div>
          <div className="daily-progress-track">
            <div
              className="daily-progress-fill"
              style={{ width: `${getOverallProgress()}%` }}
            />
          </div>
        </div>

        <Link to="/diary" className="view-diary-btn">
          <BookOpen size={18} />
          View Diary
        </Link>
      </div>

      {/* Quick Actions Grid */}
      <h3 className="section-heading">Quick Actions</h3>
      <div className="quick-actions-grid">
        <Link to="/settings" className="quick-action-card">
          <div className="quick-action-card-icon teal">
            <ClipboardCheck size={24} />
          </div>
          <span>Check-In</span>
        </Link>
        <Link to="/settings" className="quick-action-card">
          <div className="quick-action-card-icon pink">
            <TrendingUp size={24} />
          </div>
          <span>Progress</span>
        </Link>
        <Link to="/plans" className="quick-action-card">
          <div className="quick-action-card-icon yellow">
            <BookOpen size={24} />
          </div>
          <span>Recipes</span>
        </Link>
        <Link to="/diary" className="quick-action-card">
          <div className="quick-action-card-icon red">
            <Heart size={24} />
          </div>
          <span>Favorites</span>
        </Link>
      </div>
    </div>
  );
}

export default Dashboard;
