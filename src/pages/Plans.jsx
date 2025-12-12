import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Flame, Target, Clock, Utensils, Coffee, Sun, Moon, Apple, Heart, ClipboardList, RefreshCw, Pencil, Crosshair, BookOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';

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

function Plans() {
  const { clientData } = useAuth();
  const { planId } = useParams();
  const navigate = useNavigate();

  // Load from cache for instant display
  const cachedPlans = clientData?.id ? getCache(`plans_full_${clientData.id}`) : null;

  const [plans, setPlans] = useState(cachedPlans || []);
  const [loading, setLoading] = useState(!cachedPlans); // Only show loading if no cache
  const [selectedPlan, setSelectedPlan] = useState(() => {
    // If planId in URL and we have cached plans, select immediately
    if (planId && cachedPlans) {
      return cachedPlans.find(p => String(p.id) === String(planId)) || null;
    }
    return null;
  });
  const [selectedDay, setSelectedDay] = useState(0);

  // Meal action states
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [showMealModal, setShowMealModal] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(null);

  // Load plans with caching
  useEffect(() => {
    if (!clientData?.id) return;

    // Fetch fresh data
    apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`)
      .then(data => {
        if (data?.plans) {
          setPlans(data.plans);
          setCache(`plans_full_${clientData.id}`, data.plans);

          // If planId in URL, select that plan
          if (planId) {
            const plan = data.plans.find(p => String(p.id) === String(planId));
            if (plan) {
              setSelectedPlan(plan);
            }
          }
        }
      })
      .catch(err => console.error('Error loading plans:', err))
      .finally(() => setLoading(false));
  }, [clientData?.id, planId]);

  // Get plan details
  const getPlanDetails = (plan) => {
    const planData = plan.plan_data || {};
    let numDays = 1;
    let days = [];

    if (planData.currentPlan && Array.isArray(planData.currentPlan)) {
      numDays = planData.currentPlan.length;
      days = planData.currentPlan;
    } else if (planData.days && Array.isArray(planData.days)) {
      numDays = planData.days.length;
      days = planData.days;
    }

    // Get calories from first day's targets, or from plan-level data
    let calories = '-';
    if (days.length > 0 && days[0]?.targets?.calories) {
      calories = days[0].targets.calories;
    } else if (planData.dailyCalories) {
      calories = planData.dailyCalories;
    } else if (planData.calories) {
      calories = planData.calories;
    } else if (planData.nutrition?.calories) {
      calories = planData.nutrition.calories;
    }

    const goalLabels = {
      'lose weight': 'Lose Weight',
      'maintain': 'Maintain',
      'gain muscle': 'Gain Muscle'
    };
    const goal = planData.goal ? (goalLabels[planData.goal.toLowerCase()] || planData.goal) : '-';
    const summary = planData.summary || null;

    return { numDays, calories, goal, summary };
  };

  // Get days from plan
  const getPlanDays = (plan) => {
    const planData = plan?.plan_data || {};
    if (planData.currentPlan && Array.isArray(planData.currentPlan)) {
      return planData.currentPlan;
    } else if (planData.days && Array.isArray(planData.days)) {
      return planData.days;
    }
    return [];
  };

  // Get meal icon
  const getMealIcon = (mealType) => {
    const type = mealType?.toLowerCase() || '';
    if (type.includes('breakfast')) return <Coffee size={18} className="meal-type-icon breakfast" />;
    if (type.includes('lunch')) return <Sun size={18} className="meal-type-icon lunch" />;
    if (type.includes('dinner')) return <Moon size={18} className="meal-type-icon dinner" />;
    if (type.includes('snack')) return <Apple size={18} className="meal-type-icon snack" />;
    return <Utensils size={18} className="meal-type-icon" />;
  };

  // Format date
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Open meal detail modal
  const openMealModal = (meal, dayIdx, mealIdx) => {
    setSelectedMeal({ ...meal, dayIdx, mealIdx });
    setShowMealModal(true);
  };

  // Close meal modal
  const closeMealModal = () => {
    setShowMealModal(false);
    setSelectedMeal(null);
  };

  // Toggle favorite
  const handleToggleFavorite = async (meal) => {
    if (!clientData?.id) return;

    const mealKey = `${meal.name}-${meal.type || meal.meal_type}`;
    const isFavorited = favorites.has(mealKey);

    try {
      setActionLoading('favorite');

      if (isFavorited) {
        // Remove from favorites - would need favoriteId
        // For now just update local state
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(mealKey);
          return newSet;
        });
      } else {
        // Add to favorites
        await apiPost('/.netlify/functions/toggle-favorite', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          mealName: meal.name,
          mealType: meal.type || meal.meal_type || 'meal',
          calories: meal.calories || 0,
          protein: meal.protein || 0,
          carbs: meal.carbs || 0,
          fat: meal.fat || 0,
          notes: meal.instructions || ''
        });

        setFavorites(prev => new Set([...prev, mealKey]));
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
      alert('Failed to update favorite');
    } finally {
      setActionLoading(null);
    }
  };

  // Log meal to diary
  const handleLogMeal = async (meal) => {
    if (!clientData?.id) return;

    try {
      setActionLoading('log');

      const today = new Date().toISOString().split('T')[0];
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: (meal.type || meal.meal_type || 'meal').toLowerCase(),
        foodName: meal.name,
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: 1,
        calories: meal.calories || 0,
        protein: meal.protein || 0,
        carbs: meal.carbs || 0,
        fat: meal.fat || 0,
        foodSource: 'meal_plan'
      });

      alert('Meal logged to diary!');
      closeMealModal();
    } catch (err) {
      console.error('Error logging meal:', err);
      alert('Failed to log meal');
    } finally {
      setActionLoading(null);
    }
  };

  // Placeholder handlers for actions that need more complex implementation
  const handleChangeMeal = (meal) => {
    alert('Change meal feature coming soon! This will let you swap this meal for an alternative.');
  };

  const handleReviseMeal = (meal) => {
    alert('Revise meal feature coming soon! This will let you modify this meal with AI.');
  };

  const handleCustomMeal = (meal) => {
    alert('Custom meal feature coming soon! This will let you create a custom entry.');
  };

  const handleViewRecipe = (meal) => {
    // For now show ingredients and instructions in an alert
    // Later this could be a proper modal
    const recipe = `📖 ${meal.name}\n\n`;
    const ingredients = meal.ingredients?.length
      ? `Ingredients:\n${meal.ingredients.map(i => `• ${typeof i === 'string' ? i : `${i.amount || ''} ${i.name || i}`}`).join('\n')}\n\n`
      : '';
    const instructions = meal.instructions ? `Instructions:\n${meal.instructions}` : 'No recipe available for this meal.';

    alert(recipe + ingredients + instructions);
  };

  // View plan detail
  const handleViewPlan = (plan) => {
    setSelectedPlan(plan);
    setSelectedDay(0);
    navigate(`/plans/${plan.id}`);
  };

  // Back to plans list
  const handleBackToPlans = () => {
    setSelectedPlan(null);
    navigate('/plans');
  };

  // Loading state
  if (loading) {
    return (
      <div className="plans-page">
        <h1 className="page-title">Meal Plans</h1>
        <div className="plans-loading">
          {[1, 2].map(i => (
            <div key={i} className="skeleton plan-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  // Plan detail view
  if (selectedPlan) {
    const days = getPlanDays(selectedPlan);
    const currentDay = days[selectedDay] || {};
    const { numDays, calories, goal } = getPlanDetails(selectedPlan);

    return (
      <div className="plans-page">
        {/* Header */}
        <div className="plan-detail-header">
          <button className="back-btn" onClick={handleBackToPlans}>
            <ChevronLeft size={24} />
          </button>
          <div className="plan-detail-title">
            <h1>{numDays}-Day Meal Plan</h1>
            <span className="plan-detail-date">{formatDate(selectedPlan.created_at)}</span>
          </div>
        </div>

        {/* Plan Stats */}
        <div className="plan-stats">
          <div className="plan-stat">
            <Calendar size={18} />
            <span>{numDays} Days</span>
          </div>
          <div className="plan-stat">
            <Flame size={18} />
            <span>{calories} cal</span>
          </div>
          <div className="plan-stat">
            <Target size={18} />
            <span>{goal}</span>
          </div>
        </div>

        {/* Day Navigation */}
        {days.length > 1 && (
          <div className="day-navigator">
            <button
              className="day-nav-btn"
              onClick={() => setSelectedDay(Math.max(0, selectedDay - 1))}
              disabled={selectedDay === 0}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="day-tabs">
              {days.map((_, idx) => (
                <button
                  key={idx}
                  className={`day-tab ${selectedDay === idx ? 'active' : ''}`}
                  onClick={() => setSelectedDay(idx)}
                >
                  Day {idx + 1}
                </button>
              ))}
            </div>
            <button
              className="day-nav-btn"
              onClick={() => setSelectedDay(Math.min(days.length - 1, selectedDay + 1))}
              disabled={selectedDay === days.length - 1}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Day Content */}
        <div className="day-content">
          <h2 className="day-title">Day {selectedDay + 1}</h2>

          {/* Daily Targets */}
          {currentDay.targets && (
            <div className="daily-targets-card">
              <h3 className="daily-targets-title">Your Daily Targets</h3>
              <div className="daily-targets-grid">
                <div className="target-box calories">
                  <span className="target-value">{currentDay.targets.calories || '-'}</span>
                  <span className="target-label">Calories</span>
                </div>
                <div className="target-box protein">
                  <span className="target-value">{currentDay.targets.protein || '-'}g</span>
                  <span className="target-label">Protein</span>
                </div>
                <div className="target-box carbs">
                  <span className="target-value">{currentDay.targets.carbs || '-'}g</span>
                  <span className="target-label">Carbs</span>
                </div>
                <div className="target-box fat">
                  <span className="target-value">{currentDay.targets.fat || '-'}g</span>
                  <span className="target-label">Fat</span>
                </div>
              </div>
            </div>
          )}

          {/* Meals - check for currentDay.plan array (PWA format) */}
          {currentDay.plan && Array.isArray(currentDay.plan) && currentDay.plan.length > 0 ? (
            <div className="meals-list">
              {currentDay.plan.map((meal, idx) => (
                <div
                  key={idx}
                  className="meal-card meal-card-clickable"
                  onClick={() => openMealModal(meal, selectedDay, idx)}
                >
                  {meal.image_url && (
                    <div className="meal-card-image">
                      <img src={meal.image_url} alt={meal.name} />
                    </div>
                  )}
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      {getMealIcon(meal.meal_type || meal.type)}
                      <span className="meal-card-type">{meal.meal_type || meal.type || `Meal ${idx + 1}`}</span>
                    </div>
                    <h3 className="meal-card-name">{meal.name || meal.title || 'Meal'}</h3>

                    {/* Macros inline */}
                    <div className="meal-macros-inline">
                      {meal.calories && <span className="macro-item">{meal.calories} cal</span>}
                      {meal.protein && <span className="macro-item">P: {meal.protein}g</span>}
                      {meal.carbs && <span className="macro-item">C: {meal.carbs}g</span>}
                      {meal.fat && <span className="macro-item">F: {meal.fat}g</span>}
                    </div>

                    <p className="meal-card-tap-hint">Tap to see options</p>
                  </div>
                </div>
              ))}
            </div>
          ) : currentDay.meals ? (
            <div className="meals-list">
              {Object.entries(currentDay.meals).map(([mealType, meal]) => (
                <div key={mealType} className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      {getMealIcon(mealType)}
                      <span className="meal-card-type">{mealType}</span>
                      {meal.calories && (
                        <span className="meal-card-calories">{meal.calories} cal</span>
                      )}
                    </div>
                    <h3 className="meal-card-name">{meal.name || meal.title || 'Meal'}</h3>
                    {meal.description && (
                      <p className="meal-card-description">{meal.description}</p>
                    )}
                    {meal.ingredients && meal.ingredients.length > 0 && (
                      <div className="meal-ingredients">
                        <h4>Ingredients</h4>
                        <ul>
                          {meal.ingredients.map((ing, idx) => (
                            <li key={idx}>{typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {meal.instructions && (
                      <div className="meal-instructions">
                        <h4>Instructions</h4>
                        <p>{meal.instructions}</p>
                      </div>
                    )}
                    {meal.macros && (
                      <div className="meal-macros">
                        {meal.macros.protein && <span className="macro protein">P: {meal.macros.protein}g</span>}
                        {meal.macros.carbs && <span className="macro carbs">C: {meal.macros.carbs}g</span>}
                        {meal.macros.fat && <span className="macro fat">F: {meal.macros.fat}g</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : currentDay.breakfast || currentDay.lunch || currentDay.dinner || currentDay.snacks ? (
            <div className="meals-list">
              {currentDay.breakfast && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Coffee size={18} className="meal-type-icon breakfast" />
                      <span className="meal-card-type">Breakfast</span>
                    </div>
                    <h3 className="meal-card-name">{currentDay.breakfast.name || currentDay.breakfast}</h3>
                    {currentDay.breakfast.description && <p className="meal-card-description">{currentDay.breakfast.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.lunch && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Sun size={18} className="meal-type-icon lunch" />
                      <span className="meal-card-type">Lunch</span>
                    </div>
                    <h3 className="meal-card-name">{currentDay.lunch.name || currentDay.lunch}</h3>
                    {currentDay.lunch.description && <p className="meal-card-description">{currentDay.lunch.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.dinner && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Moon size={18} className="meal-type-icon dinner" />
                      <span className="meal-card-type">Dinner</span>
                    </div>
                    <h3 className="meal-card-name">{currentDay.dinner.name || currentDay.dinner}</h3>
                    {currentDay.dinner.description && <p className="meal-card-description">{currentDay.dinner.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.snacks && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Apple size={18} className="meal-type-icon snack" />
                      <span className="meal-card-type">Snacks</span>
                    </div>
                    <h3 className="meal-card-name">
                      {Array.isArray(currentDay.snacks)
                        ? currentDay.snacks.map(s => s.name || s).join(', ')
                        : currentDay.snacks.name || currentDay.snacks
                      }
                    </h3>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-day">
              <p>No meals found for this day</p>
            </div>
          )}
        </div>

        {/* Meal Action Modal */}
        {showMealModal && selectedMeal && (
          <div className="meal-modal-overlay" onClick={closeMealModal}>
            <div className="meal-modal" onClick={e => e.stopPropagation()}>
              {/* Meal Image */}
              {selectedMeal.image_url && (
                <div className="meal-modal-image">
                  <img src={selectedMeal.image_url} alt={selectedMeal.name} />
                </div>
              )}

              {/* Meal Name */}
              <h2 className="meal-modal-name">{selectedMeal.name}</h2>

              {/* Action Buttons Grid */}
              <div className="meal-action-buttons">
                <button
                  className={`meal-action-btn favorite ${favorites.has(`${selectedMeal.name}-${selectedMeal.type || selectedMeal.meal_type}`) ? 'active' : ''}`}
                  onClick={() => handleToggleFavorite(selectedMeal)}
                  disabled={actionLoading === 'favorite'}
                >
                  <Heart size={20} fill={favorites.has(`${selectedMeal.name}-${selectedMeal.type || selectedMeal.meal_type}`) ? 'currentColor' : 'none'} />
                </button>

                <button
                  className="meal-action-btn log"
                  onClick={() => handleLogMeal(selectedMeal)}
                  disabled={actionLoading === 'log'}
                >
                  <ClipboardList size={18} />
                  <span>Log</span>
                </button>

                <button
                  className="meal-action-btn change"
                  onClick={() => handleChangeMeal(selectedMeal)}
                >
                  <RefreshCw size={18} />
                  <span>Change</span>
                </button>

                <button
                  className="meal-action-btn revise"
                  onClick={() => handleReviseMeal(selectedMeal)}
                >
                  <Pencil size={18} />
                  <span>Revise</span>
                </button>

                <button
                  className="meal-action-btn custom"
                  onClick={() => handleCustomMeal(selectedMeal)}
                >
                  <Crosshair size={18} />
                  <span>Custom</span>
                </button>

                <button
                  className="meal-action-btn recipe"
                  onClick={() => handleViewRecipe(selectedMeal)}
                >
                  <BookOpen size={18} />
                  <span>Recipe</span>
                </button>
              </div>

              {/* Macro Stats */}
              <div className="meal-modal-macros">
                <div className="meal-modal-macro">
                  <span className="macro-label">Calories</span>
                  <span className="macro-value">{selectedMeal.calories || 0}</span>
                </div>
                <div className="meal-modal-macro">
                  <span className="macro-label">Protein</span>
                  <span className="macro-value">{selectedMeal.protein || 0}g</span>
                </div>
              </div>

              {/* Close Button */}
              <button className="meal-modal-close" onClick={closeMealModal}>
                <X size={24} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Plans list view
  return (
    <div className="plans-page">
      <h1 className="page-title">Meal Plans</h1>

      {plans.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">📋</div>
          <h3 className="empty-state-title">No meal plans yet</h3>
          <p className="empty-state-text">
            Your coach will assign meal plans to you here.
          </p>
        </div>
      ) : (
        <div className="plans-grid">
          {plans.map(plan => {
            const { numDays, calories, goal, summary } = getPlanDetails(plan);

            return (
              <div
                key={plan.id}
                className="plan-card"
                onClick={() => handleViewPlan(plan)}
              >
                <div className="plan-card-header">
                  <div className="plan-card-title">{numDays}-Day Meal Plan</div>
                  <div className="plan-card-date">
                    {formatDate(plan.created_at)} at {formatTime(plan.created_at)}
                  </div>
                </div>

                {summary && (
                  <p className="plan-card-summary">{summary}</p>
                )}

                <div className="plan-card-details">
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
                    <span className="plan-detail-value">{goal}</span>
                  </div>
                </div>

                <button className="view-plan-btn">View Plan</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Plans;
