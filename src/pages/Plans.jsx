import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Flame, Target, Clock, Utensils, Coffee, Sun, Moon, Apple } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function Plans() {
  const { clientData } = useAuth();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState(0);

  // Load plans
  useEffect(() => {
    const loadPlans = async () => {
      if (!clientData?.id) return;

      try {
        const data = await apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`);
        if (data?.plans) {
          setPlans(data.plans);

          // If planId in URL, select that plan
          if (planId) {
            const plan = data.plans.find(p => String(p.id) === String(planId));
            if (plan) {
              setSelectedPlan(plan);
            }
          }
        }
      } catch (err) {
        console.error('Error loading plans:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, [clientData?.id, planId]);

  // Get plan details
  const getPlanDetails = (plan) => {
    const planData = plan.plan_data || {};
    let numDays = 1;
    if (planData.currentPlan && Array.isArray(planData.currentPlan)) {
      numDays = planData.currentPlan.length;
    } else if (planData.days && Array.isArray(planData.days)) {
      numDays = planData.days.length;
    }

    const calories = planData.calories || (planData.nutrition && planData.nutrition.calories) || '-';
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

          {/* Meals */}
          {currentDay.meals ? (
            <div className="meals-list">
              {Object.entries(currentDay.meals).map(([mealType, meal]) => (
                <div key={mealType} className="meal-card">
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
              ))}
            </div>
          ) : currentDay.breakfast || currentDay.lunch || currentDay.dinner || currentDay.snacks ? (
            <div className="meals-list">
              {currentDay.breakfast && (
                <div className="meal-card">
                  <div className="meal-card-header">
                    <Coffee size={18} className="meal-type-icon breakfast" />
                    <span className="meal-card-type">Breakfast</span>
                  </div>
                  <h3 className="meal-card-name">{currentDay.breakfast.name || currentDay.breakfast}</h3>
                  {currentDay.breakfast.description && <p className="meal-card-description">{currentDay.breakfast.description}</p>}
                </div>
              )}
              {currentDay.lunch && (
                <div className="meal-card">
                  <div className="meal-card-header">
                    <Sun size={18} className="meal-type-icon lunch" />
                    <span className="meal-card-type">Lunch</span>
                  </div>
                  <h3 className="meal-card-name">{currentDay.lunch.name || currentDay.lunch}</h3>
                  {currentDay.lunch.description && <p className="meal-card-description">{currentDay.lunch.description}</p>}
                </div>
              )}
              {currentDay.dinner && (
                <div className="meal-card">
                  <div className="meal-card-header">
                    <Moon size={18} className="meal-type-icon dinner" />
                    <span className="meal-card-type">Dinner</span>
                  </div>
                  <h3 className="meal-card-name">{currentDay.dinner.name || currentDay.dinner}</h3>
                  {currentDay.dinner.description && <p className="meal-card-description">{currentDay.dinner.description}</p>}
                </div>
              )}
              {currentDay.snacks && (
                <div className="meal-card">
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
              )}
            </div>
          ) : (
            <div className="empty-day">
              <p>No meals found for this day</p>
            </div>
          )}
        </div>
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
