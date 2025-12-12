import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, Heart, ScanLine, Mic, ChevronRight, BarChart3, ClipboardCheck, TrendingUp, BookOpen, Utensils, Pill, ChefHat, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';

// localStorage cache helpers
const getCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* ignore */ }
  return null;
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) { /* ignore */ }
};

// Get today's date key for cache
const getTodayKey = () => new Date().toISOString().split('T')[0];

function Dashboard() {
  const { clientData } = useAuth();
  const today = getTodayKey();

  // Load all cached data for instant display
  const cachedDashboard = clientData?.id ? getCache(`dashboard_${clientData.id}_${today}`) : null;
  const cachedCoach = clientData?.id ? getCache(`coach_${clientData.id}`) : null;
  const cachedPlans = clientData?.id ? getCache(`plans_${clientData.id}`) : null;
  const cachedSupplements = clientData?.id ? getCache(`supplements_${clientData.id}`) : null;

  const [loading, setLoading] = useState(false);
  const [todayProgress, setTodayProgress] = useState(cachedDashboard?.progress || {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
  const [targets, setTargets] = useState(cachedDashboard?.targets || {
    calories: clientData?.calorie_goal || 2600,
    protein: clientData?.protein_goal || 221,
    carbs: clientData?.carbs_goal || 260,
    fat: clientData?.fat_goal || 75
  });
  const [selectedMealType, setSelectedMealType] = useState(null);
  const [foodInput, setFoodInput] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [mealPlans, setMealPlans] = useState(cachedPlans || []);
  const [supplements, setSupplements] = useState(cachedSupplements?.protocols || []);
  const [supplementIntake, setSupplementIntake] = useState(cachedDashboard?.intake || {});
  const [coachData, setCoachData] = useState(cachedCoach?.coachData || null);
  const [hasStories, setHasStories] = useState(cachedCoach?.hasStories || false);

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
    if (hour < 12) return 'Good morning! Ready to start your day?';
    if (hour < 17) return 'Good afternoon! How is your day going?';
    return 'Good evening! How was your day?';
  };

  // Load today's progress, meal plans, and supplements - progressive loading with caching
  useEffect(() => {
    if (!clientData?.id) return;

    const dateKey = getTodayKey();

    // Load diary data (progress rings) - high priority
    apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateKey}`)
      .then(diaryData => {
        if (diaryData?.entries) {
          const totals = diaryData.entries.reduce((acc, entry) => ({
            calories: acc.calories + (entry.calories || 0),
            protein: acc.protein + (entry.protein || 0),
            carbs: acc.carbs + (entry.carbs || 0),
            fat: acc.fat + (entry.fat || 0)
          }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
          setTodayProgress(totals);

          // Cache progress and targets together
          const newTargets = diaryData?.goals ? {
            calories: diaryData.goals.calorie_goal || 2600,
            protein: diaryData.goals.protein_goal || 221,
            carbs: diaryData.goals.carbs_goal || 260,
            fat: diaryData.goals.fat_goal || 75
          } : targets;

          if (diaryData?.goals) {
            setTargets(newTargets);
          }

          // Update cache with current state
          const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
          setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, progress: totals, targets: newTargets });
        }
      })
      .catch(err => console.error('Error loading diary:', err));

    // Load meal plans - medium priority
    apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`)
      .then(plansData => {
        if (plansData?.plans) {
          const plans = plansData.plans.slice(0, 3);
          setMealPlans(plans);
          setCache(`plans_${clientData.id}`, plans);
        }
      })
      .catch(err => console.error('Error loading meal plans:', err));

    // Load supplements - medium priority
    if (clientData.coach_id) {
      apiGet(`/.netlify/functions/client-protocols?clientId=${clientData.id}&coachId=${clientData.coach_id}`)
        .then(supplementsData => {
          if (supplementsData?.protocols) {
            setSupplements(supplementsData.protocols);
            setCache(`supplements_${clientData.id}`, { protocols: supplementsData.protocols });
          }
        })
        .catch(err => console.error('Error loading supplements:', err));

      // Load coach stories - low priority (cached for instant display)
      apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`)
        .then(storiesData => {
          if (storiesData) {
            const newCoachData = {
              name: storiesData.coachName,
              avatar: storiesData.coachAvatar,
              showAvatar: storiesData.showAvatarInGreeting
            };
            const newHasStories = storiesData.hasUnseenStories || (storiesData.stories && storiesData.stories.length > 0);
            setCoachData(newCoachData);
            setHasStories(newHasStories);
            setCache(`coach_${clientData.id}`, { coachData: newCoachData, hasStories: newHasStories });
          }
        })
        .catch(err => console.error('Error loading coach stories:', err));
    }

    // Load supplement intake - medium priority
    apiGet(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&date=${dateKey}`)
      .then(intakeData => {
        if (intakeData?.intake) {
          const intakeMap = {};
          intakeData.intake.forEach(record => {
            intakeMap[record.protocol_id] = true;
          });
          setSupplementIntake(intakeMap);

          // Update cache with intake
          const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
          setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, intake: intakeMap });
        }
      })
      .catch(err => console.error('Error loading supplement intake:', err));

  }, [clientData?.id, clientData?.coach_id]);

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
    setLogSuccess(false);

    try {
      // Step 1: Call AI to parse the food description
      const aiData = await apiPost('/.netlify/functions/analyze-food-text', {
        text: foodInput
      });

      if (!aiData?.foods || aiData.foods.length === 0) {
        console.error('No foods recognized');
        return;
      }

      // Step 2: Log each recognized food item to the diary
      const today = new Date().toISOString().split('T')[0];
      let totalAdded = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      for (const food of aiData.foods) {
        await apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate: today,
          mealType: selectedMealType,
          foodName: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: 1,
          servingUnit: 'serving',
          numberOfServings: 1,
          foodSource: 'ai'
        });

        totalAdded.calories += food.calories || 0;
        totalAdded.protein += food.protein || 0;
        totalAdded.carbs += food.carbs || 0;
        totalAdded.fat += food.fat || 0;
      }

      // Step 3: Update local state with new totals
      setTodayProgress(prev => ({
        calories: prev.calories + totalAdded.calories,
        protein: prev.protein + totalAdded.protein,
        carbs: prev.carbs + totalAdded.carbs,
        fat: prev.fat + totalAdded.fat
      }));

      // Clear input and show success
      setFoodInput('');
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
    } catch (err) {
      console.error('Error logging food:', err);
    } finally {
      setIsLogging(false);
    }
  };

  // Handle supplement checkbox toggle
  const handleSupplementToggle = async (protocolId) => {
    const isCurrentlyTaken = supplementIntake[protocolId];
    const today = new Date().toISOString().split('T')[0];

    try {
      if (isCurrentlyTaken) {
        // Unmark supplement
        await apiDelete(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&protocolId=${protocolId}&date=${today}`);
        setSupplementIntake(prev => {
          const updated = { ...prev };
          delete updated[protocolId];
          return updated;
        });
      } else {
        // Mark supplement as taken
        await apiPost('/.netlify/functions/supplement-intake', {
          clientId: clientData.id,
          protocolId: protocolId,
          date: today
        });
        setSupplementIntake(prev => ({
          ...prev,
          [protocolId]: true
        }));
      }
    } catch (err) {
      console.error('Error toggling supplement:', err);
    }
  };

  // Count taken supplements
  const takenSupplementsCount = Object.keys(supplementIntake).length;

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

  return (
    <div className="dashboard">
      {/* Greeting Section */}
      <div className="greeting-section">
        <div className="greeting-with-avatar">
          {clientData?.profile_photo_url ? (
            <img
              src={clientData.profile_photo_url}
              alt={clientData.client_name}
              className="greeting-avatar-img"
            />
          ) : (
            <div className="greeting-avatar">
              {clientData?.client_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
          )}
          <div className="greeting-text">
            <h1>Welcome back, {clientData?.client_name || 'there'}!</h1>
            <p className="greeting-subtext">{getGreetingSubtext()}</p>
          </div>
        </div>
      </div>

      {/* Your Coach Section */}
      {coachData?.showAvatar && coachData?.avatar && (
        <div className="coach-bubble-section">
          <div
            className={`coach-story-bubble ${hasStories ? 'has-stories' : ''}`}
            onClick={() => {
              if (hasStories) {
                // TODO: Open stories viewer modal
                alert('Stories feature coming soon!');
              }
            }}
            style={{ cursor: hasStories ? 'pointer' : 'default' }}
          >
            <div className={`story-ring ${hasStories ? 'unseen' : ''}`}>
              <img src={coachData.avatar} alt={coachData.name} className="coach-story-avatar" />
            </div>
            <span className="coach-story-label">Your Coach</span>
          </div>
        </div>
      )}

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
            style={logSuccess ? { background: '#22c55e' } : {}}
          >
            {isLogging ? 'Analyzing...' : logSuccess ? 'Logged!' : 'Log Food'}
            {logSuccess ? <Check size={18} /> : <ChevronRight size={18} />}
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

      {/* Today's Supplements Section */}
      {supplements.length > 0 && (
        <div className="todays-supplements-card">
          <div className="supplements-header">
            <div className="supplements-title">
              <Pill size={20} className="supplements-icon" />
              <span>Today's Supplements</span>
            </div>
            <span className="supplements-counter">{takenSupplementsCount}/{supplements.length}</span>
          </div>
          <div className="supplements-list">
            {(() => {
              // Group supplements by timing
              const timingIcons = {
                morning: '🌅',
                'with-breakfast': '🍳',
                'before-workout': '💪',
                'after-workout': '🏋️',
                'with-lunch': '🥗',
                'with-dinner': '🍽️',
                evening: '🌙',
                'before-bed': '😴',
                custom: '⏰'
              };
              const timingLabels = {
                morning: 'MORNING',
                'with-breakfast': 'WITH BREAKFAST',
                'before-workout': 'BEFORE WORKOUT',
                'after-workout': 'AFTER WORKOUT',
                'with-lunch': 'WITH LUNCH',
                'with-dinner': 'WITH DINNER',
                evening: 'EVENING',
                'before-bed': 'BEFORE BED',
                custom: 'CUSTOM'
              };

              // Group by timing
              const grouped = supplements.reduce((acc, supp) => {
                const timing = supp.timing || 'custom';
                if (!acc[timing]) acc[timing] = [];
                acc[timing].push(supp);
                return acc;
              }, {});

              return Object.entries(grouped).map(([timing, supps]) => (
                <div key={timing} className="supplement-group">
                  <div className="supplement-group-label">
                    <span>{timingIcons[timing] || '⏰'}</span>
                    <span>{timingLabels[timing] || timing.toUpperCase()}</span>
                  </div>
                  {supps.map((supp) => (
                    <div
                      key={supp.id}
                      className="supplement-checkbox-item"
                      onClick={() => handleSupplementToggle(supp.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`supplement-checkbox ${supplementIntake[supp.id] ? 'checked' : ''}`}>
                        {supplementIntake[supp.id] && <Check size={14} color="white" />}
                      </div>
                      <div className="supplement-item-info">
                        <span className="supplement-item-name" style={supplementIntake[supp.id] ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>{supp.name}</span>
                        <span className="supplement-item-dose">{supp.dose || ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

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
            <ChefHat size={24} />
          </div>
          <span>Recipes</span>
        </Link>
        <Link to="/plans" className="quick-action-card">
          <div className="quick-action-card-icon red">
            <Heart size={24} />
          </div>
          <span>Favorites</span>
        </Link>
      </div>

      {/* My Meal Plans Section */}
      <div className="meal-plans-section">
        <h2 className="section-heading-icon">
          <Utensils size={22} className="section-icon-svg" />
          My Meal Plans
        </h2>
        <div className="meal-plans-container">
          {mealPlans.length > 0 ? (
            mealPlans.map((plan) => {
              const numDays = plan.plan_data?.days?.length || 1;
              const createdDate = new Date(plan.created_at);
              const formattedDate = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const summary = plan.plan_data?.summary || plan.plan_data?.description || '';
              const calories = plan.plan_data?.dailyCalories || plan.plan_data?.calories || '-';

              return (
                <Link to={`/plans/${plan.id}`} key={plan.id} className="meal-plan-card">
                  <div className="plan-header">
                    <div className="plan-title">{numDays}-Day Meal Plan</div>
                    <div className="plan-date">{formattedDate} at {formattedTime}</div>
                  </div>
                  {summary && <div className="plan-summary">{summary}</div>}
                  <div className="plan-details">
                    <div className="plan-detail-item">
                      <span className="plan-detail-label">Duration</span>
                      <span className="plan-detail-value">{numDays} {numDays === 1 ? 'Day' : 'Days'}</span>
                    </div>
                    <div className="plan-detail-item">
                      <span className="plan-detail-label">Calories</span>
                      <span className="plan-detail-value">{calories} cal</span>
                    </div>
                    <div className="plan-detail-item">
                      <span className="plan-detail-label">Goal</span>
                      <span className="plan-detail-value">{plan.plan_data?.goal || '-'}</span>
                    </div>
                  </div>
                  <button className="view-plan-btn">View Plan</button>
                </Link>
              );
            })
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🍽️</div>
              <h3 className="empty-state-title">No Meal Plans Yet</h3>
              <p className="empty-state-text">Your coach hasn't created any meal plans for you yet.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

export default Dashboard;
