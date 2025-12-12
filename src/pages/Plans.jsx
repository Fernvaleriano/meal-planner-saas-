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

  // Custom meal modal states
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customMealData, setCustomMealData] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    instructions: ''
  });

  // Processing state for AI operations
  const [processingMeal, setProcessingMeal] = useState(null);

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

  // Helper to save updated plan to database
  const savePlanToDatabase = async (updatedPlan) => {
    try {
      await apiPost('/.netlify/functions/update-meal-plan', {
        planId: updatedPlan.id,
        planData: updatedPlan.plan_data
      });
      // Update cache
      setCache(`plans_full_${clientData.id}`, plans.map(p =>
        p.id === updatedPlan.id ? updatedPlan : p
      ));
    } catch (err) {
      console.error('Failed to save plan:', err);
    }
  };

  // Change meal - generate a different meal with similar macros
  const handleChangeMeal = async (meal) => {
    if (!selectedPlan) return;

    closeMealModal();
    setProcessingMeal({ dayIdx: meal.dayIdx, mealIdx: meal.mealIdx, action: 'change' });

    try {
      const days = getPlanDays(selectedPlan);
      const currentDay = days[meal.dayIdx];
      const targets = currentDay?.targets || {};

      // Calculate meal-specific targets based on meal type
      const mealType = (meal.type || meal.meal_type || 'meal').toLowerCase();
      let calPercent = 0.25;
      if (mealType === 'breakfast') calPercent = 0.27;
      else if (mealType === 'lunch') calPercent = 0.32;
      else if (mealType === 'dinner') calPercent = 0.28;
      else if (mealType.includes('snack')) calPercent = 0.13;

      const targetCalories = Math.round((targets.calories || 2000) * calPercent);
      const targetProtein = Math.round((targets.protein || 150) * calPercent);
      const targetCarbs = Math.round((targets.carbs || 200) * calPercent);
      const targetFat = Math.round((targets.fat || 70) * calPercent);

      // Collect all meal names to avoid repetition
      const allMealNames = [];
      days.forEach(day => {
        (day.plan || []).forEach(m => {
          if (m.name) allMealNames.push(m.name);
        });
      });

      const avoidMealsList = allMealNames.length > 0
        ? `\n\nNEVER generate any of these meals (they're already in the plan):\n${allMealNames.map(n => `- ${n}`).join('\n')}\n`
        : '';

      const prompt = `Generate a DIFFERENT ${meal.type || meal.meal_type || 'meal'} (not "${meal.name}").
${avoidMealsList}
STRICT Target Nutrition:
- Calories: ${targetCalories} (stay within ±50 calories)
- Protein: ${targetProtein}g (stay within ±5g)
- Carbs: ${targetCarbs}g (stay within ±10g)
- Fat: ${targetFat}g (stay within ±5g)

Use ONLY foods from USDA database.

Return ONLY valid JSON:
{
  "type": "${meal.type || meal.meal_type || 'meal'}",
  "name": "Meal Name (with key portions)",
  "ingredients": ["Ingredient 1 (amount)", "Ingredient 2 (amount)"],
  "instructions": "Cooking instructions"
}`;

      const response = await fetch('/.netlify/functions/generate-meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          isJson: true,
          targets: { calories: targetCalories, protein: targetProtein, carbs: targetCarbs, fat: targetFat },
          mealsPerDay: 1
        })
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      let newMeal = data.success && data.data ? data.data : null;

      if (!newMeal) throw new Error('Invalid response');

      // Ensure meal has required fields
      newMeal.type = newMeal.type || meal.type || meal.meal_type || 'meal';
      newMeal.meal_type = newMeal.type;
      newMeal.name = newMeal.name || 'New Meal';
      newMeal.image_url = meal.image_url; // Keep original image

      // Update the plan
      const updatedPlan = { ...selectedPlan };
      const updatedDays = [...getPlanDays(updatedPlan)];
      updatedDays[meal.dayIdx].plan[meal.mealIdx] = newMeal;

      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data.currentPlan = updatedDays;
      } else {
        updatedPlan.plan_data.days = updatedDays;
      }

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      await savePlanToDatabase(updatedPlan);

    } catch (err) {
      console.error('Change meal error:', err);
      alert('Failed to change meal. Please try again.');
    } finally {
      setProcessingMeal(null);
    }
  };

  // Revise meal - modify with AI based on user request
  const handleReviseMeal = async (meal) => {
    const revisionText = window.prompt(
      `Revise "${meal.name}"?\n\nExamples:\n` +
      `• "increase chicken to 250g"\n` +
      `• "swap rice for sweet potato"\n` +
      `• "make it vegetarian"\n` +
      `• "add more protein"\n` +
      `• "make it 800 calories"\n\n` +
      `Enter your request:`
    );

    if (!revisionText || !revisionText.trim()) return;

    closeMealModal();
    setProcessingMeal({ dayIdx: meal.dayIdx, mealIdx: meal.mealIdx, action: 'revise' });

    try {
      const prompt = `Revise this meal based on user request: "${meal.name}"

USER REQUEST: ${revisionText}

CURRENT MEAL:
- Calories: ${meal.calories}
- Protein: ${meal.protein}g
- Carbs: ${meal.carbs}g
- Fat: ${meal.fat}g
- Ingredients: ${meal.ingredients ? (Array.isArray(meal.ingredients) ? meal.ingredients.join(', ') : meal.ingredients) : 'N/A'}

Follow the user's request. If they specify exact amounts, use those amounts.
If they want to swap ingredients, calculate similar calories.

Return ONLY valid JSON:
{"type":"${meal.type || meal.meal_type || 'meal'}","name":"Revised Meal Name","ingredients":["Ingredient (amount)"],"instructions":"Instructions"}`;

      const response = await fetch('/.netlify/functions/generate-meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          isJson: true,
          skipAutoScale: true,
          targets: {
            calories: meal.calories || 500,
            protein: meal.protein || 30,
            carbs: meal.carbs || 50,
            fat: meal.fat || 15
          },
          mealsPerDay: 1
        })
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      let revisedMeal = data.success && data.data ? data.data : null;

      if (!revisedMeal) throw new Error('Invalid response');

      revisedMeal.type = revisedMeal.type || meal.type || meal.meal_type || 'meal';
      revisedMeal.meal_type = revisedMeal.type;
      revisedMeal.image_url = meal.image_url;

      // Update the plan
      const updatedPlan = { ...selectedPlan };
      const updatedDays = [...getPlanDays(updatedPlan)];
      updatedDays[meal.dayIdx].plan[meal.mealIdx] = revisedMeal;

      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data.currentPlan = updatedDays;
      } else {
        updatedPlan.plan_data.days = updatedDays;
      }

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      await savePlanToDatabase(updatedPlan);

    } catch (err) {
      console.error('Revise meal error:', err);
      alert('Failed to revise meal. Please try again.');
    } finally {
      setProcessingMeal(null);
    }
  };

  // Custom meal - open modal to create custom entry
  const handleCustomMeal = (meal) => {
    closeMealModal();
    setCustomMealData({
      name: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
      instructions: '',
      dayIdx: meal.dayIdx,
      mealIdx: meal.mealIdx,
      mealType: meal.type || meal.meal_type || 'meal'
    });
    setShowCustomModal(true);
  };

  // Save custom meal
  const handleSaveCustomMeal = async () => {
    if (!customMealData.name || !customMealData.calories) {
      alert('Please enter at least a name and calories');
      return;
    }

    const customMeal = {
      type: customMealData.mealType,
      meal_type: customMealData.mealType,
      name: customMealData.name,
      calories: parseInt(customMealData.calories) || 0,
      protein: parseInt(customMealData.protein) || 0,
      carbs: parseInt(customMealData.carbs) || 0,
      fat: parseInt(customMealData.fat) || 0,
      instructions: customMealData.instructions || '',
      ingredients: [],
      isCustom: true
    };

    // Update the plan
    const updatedPlan = { ...selectedPlan };
    const updatedDays = [...getPlanDays(updatedPlan)];
    updatedDays[customMealData.dayIdx].plan[customMealData.mealIdx] = customMeal;

    if (updatedPlan.plan_data.currentPlan) {
      updatedPlan.plan_data.currentPlan = updatedDays;
    } else {
      updatedPlan.plan_data.days = updatedDays;
    }

    setSelectedPlan(updatedPlan);
    setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
    await savePlanToDatabase(updatedPlan);

    setShowCustomModal(false);
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
              {currentDay.plan.map((meal, idx) => {
                const isProcessing = processingMeal?.dayIdx === selectedDay && processingMeal?.mealIdx === idx;

                return (
                  <div
                    key={idx}
                    className={`meal-card meal-card-clickable ${isProcessing ? 'processing' : ''}`}
                    onClick={() => !isProcessing && openMealModal(meal, selectedDay, idx)}
                  >
                    {/* Processing Overlay */}
                    {isProcessing && (
                      <div className="meal-processing-overlay">
                        <div className="meal-processing-spinner" />
                        <span>{processingMeal.action === 'change' ? 'Generating new meal...' : 'Revising meal...'}</span>
                      </div>
                    )}

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
                );
              })}
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

        {/* Custom Meal Modal */}
        {showCustomModal && (
          <div className="meal-modal-overlay" onClick={() => setShowCustomModal(false)}>
            <div className="custom-meal-modal" onClick={e => e.stopPropagation()}>
              <div className="custom-meal-header">
                <h2>🎯 Custom Meal</h2>
                <p>Create your own meal entry</p>
              </div>

              <div className="custom-meal-form">
                <div className="form-group">
                  <label>Meal Name *</label>
                  <input
                    type="text"
                    value={customMealData.name}
                    onChange={e => setCustomMealData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Grilled Chicken Salad"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Calories *</label>
                    <input
                      type="number"
                      value={customMealData.calories}
                      onChange={e => setCustomMealData(prev => ({ ...prev, calories: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Protein (g)</label>
                    <input
                      type="number"
                      value={customMealData.protein}
                      onChange={e => setCustomMealData(prev => ({ ...prev, protein: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Carbs (g)</label>
                    <input
                      type="number"
                      value={customMealData.carbs}
                      onChange={e => setCustomMealData(prev => ({ ...prev, carbs: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Fat (g)</label>
                    <input
                      type="number"
                      value={customMealData.fat}
                      onChange={e => setCustomMealData(prev => ({ ...prev, fat: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Instructions (optional)</label>
                  <textarea
                    value={customMealData.instructions}
                    onChange={e => setCustomMealData(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="How to prepare this meal..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="custom-meal-actions">
                <button className="cancel-btn" onClick={() => setShowCustomModal(false)}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveCustomMeal}>
                  Save Meal
                </button>
              </div>

              <button className="meal-modal-close" onClick={() => setShowCustomModal(false)}>
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
