import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Flame, Target, Clock, Utensils, Coffee, Sun, Moon, Apple, Heart, ClipboardList, RefreshCw, Pencil, Crosshair, BookOpen, X, Plus, Minus, Trash2, Search, Undo2, RotateCcw, ShoppingCart, ChefHat, FileDown, Check } from 'lucide-react';
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
  const [customMealTab, setCustomMealTab] = useState('calculate'); // 'calculate', 'manual', 'saved'
  const [customMealData, setCustomMealData] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    instructions: '',
    dayIdx: null,
    mealIdx: null,
    mealType: 'meal'
  });

  // Calculate tab states
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [calculatedMealName, setCalculatedMealName] = useState('');
  const [calculatedInstructions, setCalculatedInstructions] = useState('');
  const [saveForLater, setSaveForLater] = useState(false);

  // Saved meals states
  const [savedMeals, setSavedMeals] = useState([]);
  const [savedMealsLoading, setSavedMealsLoading] = useState(false);

  // Processing state for AI operations
  const [processingMeal, setProcessingMeal] = useState(null);

  // Meal image loading state
  const [mealImageLoading, setMealImageLoading] = useState(false);
  const [mealImageUrl, setMealImageUrl] = useState(null);

  // Undo state management
  const [previousMealStates, setPreviousMealStates] = useState(() => {
    try {
      const stored = localStorage.getItem('plannerUndoStates');
      return stored ? JSON.parse(stored) : {};
    } catch (e) { return {}; }
  });

  // Grocery list state
  const [showGroceryModal, setShowGroceryModal] = useState(false);
  const [groceryChecks, setGroceryChecks] = useState(() => {
    try {
      const stored = localStorage.getItem(`grocery-checks-${planId || 'default'}`);
      return stored ? JSON.parse(stored) : {};
    } catch (e) { return {}; }
  });

  // Meal images cache for cards
  const [mealImages, setMealImages] = useState(() => {
    try {
      const stored = localStorage.getItem('mealImageCache');
      return stored ? JSON.parse(stored) : {};
    } catch (e) { return {}; }
  });

  // Log confirmation modal state
  const [showLogConfirm, setShowLogConfirm] = useState(false);
  const [mealToLog, setMealToLog] = useState(null);

  // Undo state - stores the last changed meal
  const [undoData, setUndoData] = useState(null);

  // Original plan for revert feature
  const [originalPlanData, setOriginalPlanData] = useState(null);

  // Meal prep modal state
  const [showMealPrepModal, setShowMealPrepModal] = useState(false);
  const [mealPrepGuide, setMealPrepGuide] = useState(null);
  const [mealPrepLoading, setMealPrepLoading] = useState(false);

  // Load plans with caching
  useEffect(() => {
    // If no clientData yet, just wait (don't return without clearing loading state)
    if (!clientData?.id) {
      // If we have cached plans, we're already showing them, so set loading false
      if (cachedPlans && cachedPlans.length > 0) {
        setLoading(false);
      }
      return;
    }

    // Fetch fresh data
    apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`)
      .then(data => {
        if (data?.plans) {
          setPlans(data.plans);
          setCache(`plans_full_${clientData.id}`, data.plans);

          // If planId in URL, select that plan (but preserve images if already loaded)
          if (planId) {
            const plan = data.plans.find(p => String(p.id) === String(planId));
            if (plan) {
              setSelectedPlan(prevPlan => {
                // If already viewing this plan, don't overwrite (would lose loaded images)
                if (prevPlan && String(prevPlan.id) === String(plan.id)) {
                  return prevPlan;
                }
                return plan;
              });
            }
          }
        }
      })
      .catch(err => console.error('Error loading plans:', err))
      .finally(() => setLoading(false));
  }, [clientData?.id, planId]);

  // Load meal images when plan is selected
  useEffect(() => {
    if (!selectedPlan) return;

    const loadMealImages = async () => {
      const days = getPlanDays(selectedPlan);
      const mealNames = [];
      const cachedImageUrls = {};
      let needsUpdate = false;

      // Collect meal names that need fetching AND apply cached images
      days.forEach(day => {
        (day.plan || []).forEach(meal => {
          if (meal.name) {
            // Check if we have a cached image for this meal
            if (mealImages[meal.name]) {
              // Apply cached image if meal doesn't have one
              if (!meal.image_url) {
                cachedImageUrls[meal.name] = mealImages[meal.name];
                needsUpdate = true;
              }
            } else {
              // Need to fetch this image
              mealNames.push(meal.name);
            }
          }
        });
      });

      // First, apply any cached images immediately (with proper immutable update)
      if (needsUpdate) {
        setSelectedPlan(prevPlan => {
          const updatedPlan = { ...prevPlan, plan_data: { ...prevPlan.plan_data } };
          const prevDays = getPlanDays(prevPlan);

          // Deep clone and update each day/meal
          const updatedDays = prevDays.map(day => ({
            ...day,
            plan: (day.plan || []).map(meal => ({
              ...meal,
              image_url: cachedImageUrls[meal.name] || meal.image_url
            }))
          }));

          if (updatedPlan.plan_data.currentPlan) {
            updatedPlan.plan_data.currentPlan = updatedDays;
          } else if (updatedPlan.plan_data.days) {
            updatedPlan.plan_data.days = updatedDays;
          }
          return updatedPlan;
        });
      }

      // Then fetch any missing images
      if (mealNames.length === 0) return;

      try {
        const response = await apiPost('/.netlify/functions/meal-image-batch', { mealNames });
        if (response.images) {
          const newImages = { ...mealImages, ...response.images };
          setMealImages(newImages);
          localStorage.setItem('mealImageCache', JSON.stringify(newImages));

          // Update the meals with their new image URLs (with proper immutable update)
          setSelectedPlan(prevPlan => {
            if (!prevPlan) return prevPlan;

            const updatedPlan = { ...prevPlan, plan_data: { ...prevPlan.plan_data } };
            const prevDays = getPlanDays(prevPlan);

            // Deep clone and update each day/meal
            const updatedDays = prevDays.map(day => ({
              ...day,
              plan: (day.plan || []).map(meal => ({
                ...meal,
                image_url: response.images[meal.name] || meal.image_url
              }))
            }));

            if (updatedPlan.plan_data.currentPlan) {
              updatedPlan.plan_data.currentPlan = updatedDays;
            } else if (updatedPlan.plan_data.days) {
              updatedPlan.plan_data.days = updatedDays;
            }
            return updatedPlan;
          });
        }
      } catch (err) {
        console.error('Error loading meal images:', err);
      }
    };

    loadMealImages();
  }, [selectedPlan?.id]);

  // Save undo states to localStorage
  useEffect(() => {
    localStorage.setItem('plannerUndoStates', JSON.stringify(previousMealStates));
  }, [previousMealStates]);

  // Store original plan data for revert feature
  useEffect(() => {
    if (selectedPlan && !originalPlanData) {
      // Deep clone and store the original plan when first loaded
      const originalKey = `originalPlan_${selectedPlan.id}`;
      const stored = localStorage.getItem(originalKey);
      if (stored) {
        setOriginalPlanData(JSON.parse(stored));
      } else {
        const original = JSON.parse(JSON.stringify(selectedPlan.plan_data));
        setOriginalPlanData(original);
        localStorage.setItem(originalKey, JSON.stringify(original));
      }
    }
  }, [selectedPlan?.id]);

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
  const openMealModal = async (meal, dayIdx, mealIdx) => {
    setSelectedMeal({ ...meal, dayIdx, mealIdx });
    setShowMealModal(true);

    // Reset image state and fetch new image
    setMealImageUrl(meal.image_url || null);

    // If no image_url, try to fetch/generate one
    if (!meal.image_url) {
      setMealImageLoading(true);
      try {
        const response = await apiPost('/.netlify/functions/meal-image', {
          mealName: meal.name
        });
        if (response?.imageUrl) {
          setMealImageUrl(response.imageUrl);
          // Update the meal object in the plan data for caching
          meal.image_url = response.imageUrl;
        }
      } catch (err) {
        console.error('Error fetching meal image:', err);
        // Fail silently - image is optional
      } finally {
        setMealImageLoading(false);
      }
    }
  };

  // Close meal modal
  const closeMealModal = () => {
    setShowMealModal(false);
    setSelectedMeal(null);
    setMealImageUrl(null);
    setMealImageLoading(false);
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

  // Log meal to diary - show confirmation first
  const handleLogMeal = (meal) => {
    setMealToLog(meal);
    setShowLogConfirm(true);
  };

  // Confirm and log meal to diary
  const confirmLogMeal = async () => {
    if (!clientData?.id || !mealToLog) return;

    try {
      setActionLoading('log');

      const today = new Date().toISOString().split('T')[0];
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: (mealToLog.type || mealToLog.meal_type || 'meal').toLowerCase(),
        foodName: mealToLog.name,
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: 1,
        calories: mealToLog.calories || 0,
        protein: mealToLog.protein || 0,
        carbs: mealToLog.carbs || 0,
        fat: mealToLog.fat || 0,
        foodSource: 'meal_plan'
      });

      setShowLogConfirm(false);
      setMealToLog(null);
      closeMealModal();
      alert('✅ Meal logged to diary!');
    } catch (err) {
      console.error('Error logging meal:', err);
      alert('Failed to log meal');
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel logging
  const cancelLogMeal = () => {
    setShowLogConfirm(false);
    setMealToLog(null);
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

    // Save undo data before making changes
    const days = getPlanDays(selectedPlan);
    const originalMeal = JSON.parse(JSON.stringify(days[meal.dayIdx].plan[meal.mealIdx]));
    setUndoData({
      dayIdx: meal.dayIdx,
      mealIdx: meal.mealIdx,
      meal: originalMeal,
      action: 'change'
    });

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

      const data = await apiPost('/.netlify/functions/generate-meal-plan', {
        prompt,
        isJson: true,
        targets: { calories: targetCalories, protein: targetProtein, carbs: targetCarbs, fat: targetFat },
        mealsPerDay: 1
      });

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
    // Save undo data before making changes
    const days = getPlanDays(selectedPlan);
    const originalMeal = JSON.parse(JSON.stringify(days[meal.dayIdx].plan[meal.mealIdx]));

    const revisionText = window.prompt(
      `Revise "${meal.name}"?\n\nExamples:\n` +
      `• "increase chicken to 250g"\n` +
      `• "swap rice for sweet potato"\n` +
      `• "make it vegetarian"\n` +
      `• "add more protein"\n` +
      `• "make it 800 calories"\n` +
      `• "300g cottage cheese instead of 250g"\n\n` +
      `Enter your request:`
    );

    if (!revisionText || !revisionText.trim()) return;

    // Save undo data now that user confirmed the revision
    setUndoData({
      dayIdx: meal.dayIdx,
      mealIdx: meal.mealIdx,
      meal: originalMeal,
      action: 'revise'
    });

    closeMealModal();
    setProcessingMeal({ dayIdx: meal.dayIdx, mealIdx: meal.mealIdx, action: 'revise' });

    try {
      const prompt = `Revise this meal based on user request: "${meal.name}" (${meal.type || meal.meal_type || 'meal'})

USER REQUEST: ${revisionText}

CURRENT MEAL:
- Calories: ${meal.calories}
- Protein: ${meal.protein}g
- Carbs: ${meal.carbs}g
- Fat: ${meal.fat}g
- Ingredients: ${meal.ingredients ? (Array.isArray(meal.ingredients) ? meal.ingredients.join(', ') : meal.ingredients) : 'N/A'}

REVISION RULES - Follow these carefully:

1. EXPLICIT AMOUNTS: If user specifies exact amount (e.g., "make salmon 200g", "use 300g cottage cheese"),
   use EXACTLY that amount even if it changes the meal's total calories.

2. VAGUE INCREASE: If user says "increase salmon" or "more protein" (no specific amount),
   increase by a reasonable amount (~30-50%) AND reduce other ingredients to keep total calories similar.

3. SWAP INGREDIENT: If user says "swap salmon for chicken" or "replace rice with quinoa",
   calculate the NEW ingredient amount to match the CALORIES of the original ingredient.

4. ADD NEW INGREDIENT: If user says "add chicken" to a meal that has none,
   ADD it on top - the meal will be bigger.

Use ONLY foods from USDA database.

CRITICAL: Return ingredients as ARRAY OF STRINGS with amounts in parentheses.
MEAL NAME FORMAT: Include ALL key ingredient portions inline in parentheses.

Return ONLY valid JSON:
{"type":"${meal.type || meal.meal_type || 'meal'}","name":"Revised Meal Name (with portions)","ingredients":["Ingredient (amount)"],"instructions":"Instructions"}`;

      console.log('Sending revise request:', revisionText);

      const data = await apiPost('/.netlify/functions/generate-meal-plan', {
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
      });

      console.log('Revise response:', data);

      let revisedMeal = data.success && data.data ? data.data : null;

      if (!revisedMeal) {
        console.error('No meal data in response:', data);
        throw new Error('Invalid response from API');
      }

      // Ensure required fields
      revisedMeal.type = revisedMeal.type || meal.type || meal.meal_type || 'meal';
      revisedMeal.meal_type = revisedMeal.type;
      revisedMeal.name = revisedMeal.name || 'Revised Meal';
      revisedMeal.instructions = revisedMeal.instructions || meal.instructions || '';
      revisedMeal.image_url = meal.image_url;

      // Use calculated macros from backend, fallback to original if not provided
      revisedMeal.calories = (revisedMeal.calories !== undefined && revisedMeal.calories !== null && revisedMeal.calories > 0)
        ? revisedMeal.calories : meal.calories;
      revisedMeal.protein = (revisedMeal.protein !== undefined && revisedMeal.protein !== null)
        ? revisedMeal.protein : meal.protein;
      revisedMeal.carbs = (revisedMeal.carbs !== undefined && revisedMeal.carbs !== null)
        ? revisedMeal.carbs : meal.carbs;
      revisedMeal.fat = (revisedMeal.fat !== undefined && revisedMeal.fat !== null)
        ? revisedMeal.fat : meal.fat;

      console.log('Final revised meal:', revisedMeal);

      // Update the plan
      const updatedPlan = { ...selectedPlan };
      const updatedDays = [...getPlanDays(updatedPlan)];

      // Deep clone to ensure we're not mutating state
      updatedDays[meal.dayIdx] = { ...updatedDays[meal.dayIdx] };
      updatedDays[meal.dayIdx].plan = [...updatedDays[meal.dayIdx].plan];
      updatedDays[meal.dayIdx].plan[meal.mealIdx] = revisedMeal;

      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, currentPlan: updatedDays };
      } else {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, days: updatedDays };
      }

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));

      // Clear cache to force refresh
      setCache(`plans_full_${clientData.id}`, null);

      await savePlanToDatabase(updatedPlan);

      console.log('Meal revised successfully');

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
    // Reset all custom meal states
    setCustomMealTab('calculate');
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
    setFoodSearchQuery('');
    setFoodSearchResults([]);
    setSelectedIngredients([]);
    setCalculatedMealName('');
    setCalculatedInstructions('');
    setSaveForLater(false);
    setShowCustomModal(true);
    // Load saved meals when modal opens
    loadSavedMeals();
  };

  // Close custom meal modal
  const closeCustomModal = () => {
    setShowCustomModal(false);
    setFoodSearchQuery('');
    setFoodSearchResults([]);
    setSelectedIngredients([]);
  };

  // Food search with debounce
  const searchTimeoutRef = useRef(null);
  const handleFoodSearch = (query) => {
    setFoodSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query || query.trim().length < 2) {
      setFoodSearchResults([]);
      return;
    }

    setFoodSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await apiGet(`/.netlify/functions/usda-search?query=${encodeURIComponent(query)}`);
        if (response.foods) {
          setFoodSearchResults(response.foods);
        } else {
          setFoodSearchResults([]);
        }
      } catch (err) {
        console.error('Food search error:', err);
        setFoodSearchResults([]);
      } finally {
        setFoodSearchLoading(false);
      }
    }, 300);
  };

  // Add food item to ingredients
  const addIngredient = (food) => {
    // Build measures array
    let measures = [{ label: 'g', weight: 1, isGrams: true }];
    if (food.measures && food.measures.length > 0) {
      food.measures.forEach(m => {
        if (m.label && m.weight && m.label.toLowerCase() !== 'gram') {
          measures.push({ label: m.label, weight: m.weight, isGrams: false });
        }
      });
    }

    const defaultMeasure = measures.length > 1 ? measures[1] : measures[0];
    const defaultQty = defaultMeasure.isGrams ? 100 : 1;
    const defaultGrams = defaultMeasure.isGrams ? 100 : defaultMeasure.weight;

    setSelectedIngredients(prev => [...prev, {
      fdcId: food.fdcId,
      name: food.name,
      quantity: defaultQty,
      quantityGrams: defaultGrams,
      selectedUnit: defaultMeasure.label,
      measures: measures,
      caloriesPer100g: food.caloriesPer100g || 0,
      proteinPer100g: food.proteinPer100g || 0,
      carbsPer100g: food.carbsPer100g || 0,
      fatPer100g: food.fatPer100g || 0
    }]);

    setFoodSearchQuery('');
    setFoodSearchResults([]);
  };

  // Update ingredient quantity
  const updateIngredientQty = (index, newQty) => {
    setSelectedIngredients(prev => {
      const updated = [...prev];
      const ing = updated[index];
      const qty = parseFloat(newQty) || 0;
      ing.quantity = qty;

      // Recalculate grams based on unit
      const measure = ing.measures.find(m => m.label === ing.selectedUnit);
      if (measure) {
        ing.quantityGrams = measure.isGrams ? qty : qty * measure.weight;
      }
      return updated;
    });
  };

  // Update ingredient unit
  const updateIngredientUnit = (index, newUnit) => {
    setSelectedIngredients(prev => {
      const updated = [...prev];
      const ing = updated[index];
      const measure = ing.measures.find(m => m.label === newUnit);
      if (measure) {
        ing.selectedUnit = newUnit;
        // Convert quantity appropriately
        if (measure.isGrams) {
          ing.quantity = ing.quantityGrams;
        } else {
          ing.quantity = Math.round((ing.quantityGrams / measure.weight) * 10) / 10;
        }
      }
      return updated;
    });
  };

  // Remove ingredient
  const removeIngredient = (index) => {
    setSelectedIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // Calculate totals from ingredients
  const getCalculatedTotals = () => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    selectedIngredients.forEach(ing => {
      const grams = ing.quantityGrams || ing.quantity;
      const factor = grams / 100;
      calories += ing.caloriesPer100g * factor;
      protein += ing.proteinPer100g * factor;
      carbs += ing.carbsPer100g * factor;
      fat += ing.fatPer100g * factor;
    });
    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat)
    };
  };

  // Generate auto meal name from ingredients
  const getAutoMealName = () => {
    if (selectedIngredients.length === 0) return '';
    return selectedIngredients.map(ing => {
      const grams = Math.round(ing.quantityGrams || ing.quantity);
      const shortName = ing.name.split(',')[0].trim();
      return ing.selectedUnit === 'g' ? `${grams}g ${shortName}` : `${ing.quantity} ${ing.selectedUnit} ${shortName}`;
    }).join(', ');
  };

  // Load saved meals from database
  const loadSavedMeals = async () => {
    if (!clientData?.id) return;
    setSavedMealsLoading(true);
    try {
      const response = await apiGet(`/.netlify/functions/saved-meals?clientId=${clientData.id}`);
      if (response.meals) {
        setSavedMeals(response.meals.map(m => ({
          id: m.id.toString(),
          savedAt: m.created_at,
          ...m.meal_data
        })));
      }
    } catch (err) {
      console.error('Error loading saved meals:', err);
    } finally {
      setSavedMealsLoading(false);
    }
  };

  // Save meal to library
  const saveMealToLibrary = async (mealData) => {
    if (!clientData?.id) return;
    try {
      await apiPost('/.netlify/functions/saved-meals', {
        clientId: clientData.id,
        mealData: mealData
      });
      loadSavedMeals(); // Refresh list
    } catch (err) {
      console.error('Error saving meal to library:', err);
    }
  };

  // Delete saved meal
  const deleteSavedMeal = async (mealId) => {
    if (!clientData?.id) return;
    try {
      await apiGet(`/.netlify/functions/saved-meals?mealId=${mealId}&clientId=${clientData.id}&_method=DELETE`);
      setSavedMeals(prev => prev.filter(m => m.id !== mealId));
    } catch (err) {
      console.error('Error deleting saved meal:', err);
    }
  };

  // Use saved meal
  const useSavedMeal = async (mealId) => {
    const meal = savedMeals.find(m => m.id === mealId);
    if (!meal) return;

    const customMeal = {
      type: customMealData.mealType,
      meal_type: customMealData.mealType,
      name: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      instructions: meal.instructions || '',
      ingredients: meal.ingredients || [],
      ingredientData: meal.ingredientData,
      isCustom: true,
      source: 'Saved Meal'
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
    closeCustomModal();
  };

  // Submit calculated meal (from Calculate tab)
  const handleSubmitCalculatedMeal = async () => {
    if (selectedIngredients.length === 0) {
      alert('Please add some ingredients first');
      return;
    }

    const totals = getCalculatedTotals();
    const ingredients = selectedIngredients.map(ing => {
      const unitDisplay = ing.selectedUnit === 'g' ? `${Math.round(ing.quantityGrams)}g` : `${ing.quantity} ${ing.selectedUnit}`;
      return `${ing.name} (${unitDisplay})`;
    });

    const mealName = calculatedMealName.trim() || getAutoMealName();

    const customMeal = {
      type: customMealData.mealType,
      meal_type: customMealData.mealType,
      name: mealName,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      instructions: calculatedInstructions || 'Prepare as desired.',
      ingredients: ingredients,
      ingredientData: JSON.parse(JSON.stringify(selectedIngredients)),
      isCustom: true,
      source: 'Food Database'
    };

    // Save to library if checked
    if (saveForLater) {
      await saveMealToLibrary(customMeal);
    }

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
    closeCustomModal();
  };

  // Submit manual meal (from Manual tab)
  const handleSubmitManualMeal = async () => {
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
      instructions: customMealData.instructions || 'Prepare as desired.',
      ingredients: [`${customMealData.name} (manual entry)`],
      isCustom: true,
      source: 'Manual Entry'
    };

    // Save to library if checked
    if (saveForLater) {
      await saveMealToLibrary(customMeal);
    }

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
    closeCustomModal();
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

  // Undo last meal change
  const handleUndoMeal = async () => {
    if (!undoData || !selectedPlan) return;

    try {
      const updatedPlan = { ...selectedPlan };
      const updatedDays = [...getPlanDays(updatedPlan)];

      // Deep clone to ensure we're not mutating state
      updatedDays[undoData.dayIdx] = { ...updatedDays[undoData.dayIdx] };
      updatedDays[undoData.dayIdx].plan = [...updatedDays[undoData.dayIdx].plan];

      // Get the current meal's image_url before replacing (it may have been loaded after undo data was saved)
      const currentMeal = updatedDays[undoData.dayIdx].plan[undoData.mealIdx];
      const currentImageUrl = currentMeal?.image_url;

      // Restore the original meal
      const restoredMeal = { ...undoData.meal };

      // Preserve image: use original meal's image, or current image, or look up from cache
      if (!restoredMeal.image_url) {
        restoredMeal.image_url = currentImageUrl || mealImages[restoredMeal.name] || null;
      }

      updatedDays[undoData.dayIdx].plan[undoData.mealIdx] = restoredMeal;

      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, currentPlan: updatedDays };
      } else {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, days: updatedDays };
      }

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      await savePlanToDatabase(updatedPlan);
      setUndoData(null);
    } catch (err) {
      console.error('Undo error:', err);
      alert('Failed to undo. Please try again.');
    }
  };

  // Revert to original plan
  const handleRevertToOriginal = async () => {
    if (!originalPlanData || !selectedPlan) return;

    const confirmed = window.confirm(
      '⚠️ Revert to Original Plan?\n\n' +
      'This will undo ALL changes you\'ve made to this meal plan and restore it to its original state.\n\n' +
      'This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      const updatedPlan = { ...selectedPlan };
      updatedPlan.plan_data = JSON.parse(JSON.stringify(originalPlanData));

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      await savePlanToDatabase(updatedPlan);
      setUndoData(null);
      alert('✅ Plan reverted to original!');
    } catch (err) {
      console.error('Revert error:', err);
      alert('Failed to revert. Please try again.');
    }
  };

  // Generate grocery list from plan
  const generateGroceryList = () => {
    if (!selectedPlan) return {};

    const days = getPlanDays(selectedPlan);
    const groceryItems = {};

    // Categories for common ingredients
    const categorize = (ingredient) => {
      const ing = ingredient.toLowerCase();
      if (ing.includes('chicken') || ing.includes('beef') || ing.includes('pork') || ing.includes('fish') || ing.includes('salmon') || ing.includes('shrimp') || ing.includes('turkey') || ing.includes('lamb') || ing.includes('steak')) return 'Proteins';
      if (ing.includes('milk') || ing.includes('cheese') || ing.includes('yogurt') || ing.includes('butter') || ing.includes('cream') || ing.includes('egg')) return 'Dairy & Eggs';
      if (ing.includes('rice') || ing.includes('pasta') || ing.includes('bread') || ing.includes('oat') || ing.includes('flour') || ing.includes('quinoa') || ing.includes('cereal')) return 'Grains & Pasta';
      if (ing.includes('apple') || ing.includes('banana') || ing.includes('orange') || ing.includes('berry') || ing.includes('fruit') || ing.includes('lemon') || ing.includes('lime') || ing.includes('avocado')) return 'Fruits';
      if (ing.includes('vegetable') || ing.includes('broccoli') || ing.includes('spinach') || ing.includes('carrot') || ing.includes('onion') || ing.includes('garlic') || ing.includes('tomato') || ing.includes('pepper') || ing.includes('lettuce') || ing.includes('cucumber') || ing.includes('zucchini') || ing.includes('celery') || ing.includes('potato') || ing.includes('sweet potato')) return 'Vegetables';
      if (ing.includes('oil') || ing.includes('vinegar') || ing.includes('sauce') || ing.includes('dressing') || ing.includes('ketchup') || ing.includes('mustard') || ing.includes('mayo')) return 'Condiments & Oils';
      if (ing.includes('salt') || ing.includes('pepper') || ing.includes('spice') || ing.includes('herb') || ing.includes('basil') || ing.includes('oregano') || ing.includes('cinnamon') || ing.includes('paprika')) return 'Spices & Seasonings';
      if (ing.includes('almond') || ing.includes('peanut') || ing.includes('walnut') || ing.includes('nut') || ing.includes('seed')) return 'Nuts & Seeds';
      return 'Other';
    };

    days.forEach(day => {
      (day.plan || []).forEach(meal => {
        if (meal.ingredients && Array.isArray(meal.ingredients)) {
          meal.ingredients.forEach(ing => {
            const ingStr = typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`.trim();
            const category = categorize(ingStr);

            if (!groceryItems[category]) {
              groceryItems[category] = [];
            }

            // Avoid duplicates (simple check)
            const exists = groceryItems[category].some(item =>
              item.toLowerCase().includes(ingStr.toLowerCase().split('(')[0].trim()) ||
              ingStr.toLowerCase().includes(item.toLowerCase().split('(')[0].trim())
            );

            if (!exists && ingStr.trim()) {
              groceryItems[category].push(ingStr);
            }
          });
        }
      });
    });

    return groceryItems;
  };

  // Toggle grocery item checked
  const toggleGroceryCheck = (category, index) => {
    const key = `${category}-${index}`;
    setGroceryChecks(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`grocery-checks-${planId || 'default'}`, JSON.stringify(updated));
      return updated;
    });
  };

  // Clean special characters from text (removes markdown formatting)
  const cleanMealPrepText = (text) => {
    if (!text) return '';
    return text
      .replace(/^#+\s*/gm, '')           // Remove markdown headers (###, ##, #)
      .replace(/^\*+\s*/gm, '')          // Remove leading asterisks
      .replace(/\*\*/g, '')              // Remove bold markers
      .replace(/\*/g, '')                // Remove remaining asterisks
      .replace(/^-\s*/gm, '• ')          // Convert dashes to bullet points
      .replace(/^\d+\.\s*/gm, (match) => match.trim() + ' ')  // Clean numbered lists
      .replace(/`/g, '')                 // Remove backticks
      .replace(/\n{3,}/g, '\n\n')        // Reduce multiple newlines
      .trim();
  };

  // Generate meal prep guide
  const handleMealPrep = async () => {
    setShowMealPrepModal(true);

    if (mealPrepGuide) return; // Already generated

    setMealPrepLoading(true);
    try {
      const days = getPlanDays(selectedPlan);
      const allMeals = [];

      days.forEach((day, dayIdx) => {
        (day.plan || []).forEach(meal => {
          allMeals.push({
            day: dayIdx + 1,
            name: meal.name,
            type: meal.type || meal.meal_type,
            ingredients: meal.ingredients || []
          });
        });
      });

      const prompt = `Create a concise meal prep guide for this ${days.length}-day meal plan:

${allMeals.map(m => `Day ${m.day} ${m.type}: ${m.name}`).join('\n')}

Provide:
1. What to prep on Day 1 (proteins, grains, vegetables that can be prepped ahead)
2. Storage tips for each prepped item
3. Daily assembly instructions
4. Time-saving tips

Keep it practical and brief. Format with clear sections.`;

      const response = await apiPost('/.netlify/functions/generate-meal-plan', {
        prompt,
        isJson: false
      });

      if (response.data) {
        setMealPrepGuide(response.data);
      } else {
        setMealPrepGuide('Unable to generate meal prep guide. Please try again.');
      }
    } catch (err) {
      console.error('Meal prep error:', err);
      setMealPrepGuide('Failed to generate meal prep guide. Please try again.');
    } finally {
      setMealPrepLoading(false);
    }
  };

  // Download plan as PDF
  const handleDownloadPDF = () => {
    if (!selectedPlan) return;

    const days = getPlanDays(selectedPlan);
    const { numDays, calories, goal } = getPlanDetails(selectedPlan);
    const groceryList = generateGroceryList();

    // Create printable content
    let content = `
      <html>
      <head>
        <title>${numDays}-Day Meal Plan</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h1 { color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
          h2 { color: #4f46e5; margin-top: 30px; page-break-before: auto; }
          h3 { color: #666; margin-top: 15px; }
          .meal { margin: 15px 0; padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .meal-name { font-weight: bold; font-size: 16px; color: #333; }
          .meal-macros { color: #666; margin: 5px 0; }
          .ingredients { margin-top: 10px; }
          .ingredients li { margin: 3px 0; }
          .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
          .summary-item { padding: 10px 15px; background: #e8e8ff; border-radius: 8px; }
          .grocery-section { margin-top: 40px; page-break-before: always; }
          .grocery-category { margin: 20px 0; }
          .grocery-category h3 { color: #4f46e5; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .grocery-category ul { list-style: none; padding: 0; }
          .grocery-category li { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; }
          .grocery-category li::before { content: "☐"; font-size: 16px; }
          .meal-prep-section { margin-top: 40px; page-break-before: always; }
          .meal-prep-content { background: #f9f9f9; padding: 20px; border-radius: 8px; line-height: 1.6; }
          .meal-prep-content p { margin: 10px 0; }
          @media print {
            body { padding: 0; }
            .grocery-section, .meal-prep-section { page-break-before: always; }
          }
        </style>
      </head>
      <body>
        <h1>🍽️ ${numDays}-Day Meal Plan</h1>
        <div class="summary">
          <div class="summary-item"><strong>Duration:</strong> ${numDays} Days</div>
          <div class="summary-item"><strong>Target:</strong> ${calories} cal/day</div>
          <div class="summary-item"><strong>Goal:</strong> ${goal}</div>
        </div>
    `;

    // Add meal days
    days.forEach((day, idx) => {
      content += `<h2>Day ${idx + 1}</h2>`;

      if (day.targets) {
        content += `<p><em>Daily Targets: ${day.targets.calories} cal | ${day.targets.protein}g protein | ${day.targets.carbs}g carbs | ${day.targets.fat}g fat</em></p>`;
      }

      (day.plan || []).forEach(meal => {
        content += `
          <div class="meal">
            <div class="meal-name">${meal.type || meal.meal_type || 'Meal'}: ${meal.name}</div>
            <div class="meal-macros">${meal.calories || 0} cal | P: ${meal.protein || 0}g | C: ${meal.carbs || 0}g | F: ${meal.fat || 0}g</div>
            ${meal.ingredients?.length ? `
              <div class="ingredients">
                <strong>Ingredients:</strong>
                <ul>
                  ${meal.ingredients.map(ing => `<li>${typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${meal.instructions ? `<p><strong>Instructions:</strong> ${meal.instructions}</p>` : ''}
          </div>
        `;
      });
    });

    // Add grocery list section
    if (Object.keys(groceryList).length > 0) {
      content += `
        <div class="grocery-section">
          <h2>🛒 Grocery List</h2>
          <p><em>Check off items as you shop</em></p>
      `;

      Object.entries(groceryList).forEach(([category, items]) => {
        content += `
          <div class="grocery-category">
            <h3>${category}</h3>
            <ul>
              ${items.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `;
      });

      content += `</div>`;
    }

    // Add meal prep guide section if available
    if (mealPrepGuide) {
      const cleanedGuide = cleanMealPrepText(mealPrepGuide);
      content += `
        <div class="meal-prep-section">
          <h2>👨‍🍳 Meal Prep Guide</h2>
          <div class="meal-prep-content">
            ${cleanedGuide.split('\n').filter(line => line.trim()).map(line => `<p>${line}</p>`).join('')}
          </div>
        </div>
      `;
    }

    content += `
        <p style="margin-top: 40px; color: #999; text-align: center;">Generated by FernFit Meal Planner</p>
      </body>
      </html>
    `;

    // Open print dialog
    const printWindow = window.open('', '_blank');
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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

        {/* Plan Action Buttons */}
        <div className="plan-action-bar">
          <button className="plan-action-btn" onClick={() => setShowGroceryModal(true)}>
            <ShoppingCart size={20} />
            <span>Grocery List</span>
          </button>
          <button className="plan-action-btn" onClick={handleMealPrep}>
            <ChefHat size={20} />
            <span>Meal Prep</span>
          </button>
          <button className="plan-action-btn" onClick={handleDownloadPDF}>
            <FileDown size={20} />
            <span>Download PDF</span>
          </button>
          <button className="plan-action-btn revert" onClick={handleRevertToOriginal}>
            <RotateCcw size={20} />
            <span>Revert</span>
          </button>
        </div>

        {/* Floating Undo Button */}
        {undoData && (
          <button className="floating-undo-btn" onClick={handleUndoMeal}>
            <Undo2 size={20} />
            <span>Undo {undoData.action === 'change' ? 'Change' : 'Revision'}</span>
          </button>
        )}

        {/* Log Confirmation Modal */}
        {showLogConfirm && mealToLog && (
          <div className="meal-modal-overlay" onClick={cancelLogMeal}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <h3>Log to Diary?</h3>
              <p>Add <strong>{mealToLog.name}</strong> to your food diary for today?</p>
              <div className="confirm-macros">
                <span>{mealToLog.calories || 0} cal</span>
                <span>P: {mealToLog.protein || 0}g</span>
                <span>C: {mealToLog.carbs || 0}g</span>
                <span>F: {mealToLog.fat || 0}g</span>
              </div>
              <div className="confirm-buttons">
                <button className="confirm-btn cancel" onClick={cancelLogMeal}>Cancel</button>
                <button
                  className="confirm-btn confirm"
                  onClick={confirmLogMeal}
                  disabled={actionLoading === 'log'}
                >
                  {actionLoading === 'log' ? 'Logging...' : 'Yes, Log It'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grocery List Modal */}
        {showGroceryModal && (
          <div className="meal-modal-overlay" onClick={() => setShowGroceryModal(false)}>
            <div className="grocery-modal" onClick={e => e.stopPropagation()}>
              <div className="grocery-header">
                <h2><ShoppingCart size={24} /> Grocery List</h2>
                <button className="meal-modal-close" onClick={() => setShowGroceryModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="grocery-content">
                {Object.entries(generateGroceryList()).length === 0 ? (
                  <p className="empty-grocery">No ingredients found in this meal plan.</p>
                ) : (
                  Object.entries(generateGroceryList()).map(([category, items]) => (
                    <div key={category} className="grocery-category">
                      <h3>{category}</h3>
                      <ul>
                        {items.map((item, idx) => {
                          const key = `${category}-${idx}`;
                          const isChecked = groceryChecks[key];
                          return (
                            <li
                              key={idx}
                              className={`grocery-item ${isChecked ? 'checked' : ''}`}
                              onClick={() => toggleGroceryCheck(category, idx)}
                            >
                              <span className="grocery-checkbox">
                                {isChecked && <Check size={14} />}
                              </span>
                              <span className="grocery-text">{item}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Meal Prep Modal */}
        {showMealPrepModal && (
          <div className="meal-modal-overlay" onClick={() => setShowMealPrepModal(false)}>
            <div className="meal-prep-modal" onClick={e => e.stopPropagation()}>
              <div className="meal-prep-header">
                <h2><ChefHat size={24} /> Meal Prep Guide</h2>
                <button className="meal-modal-close" onClick={() => setShowMealPrepModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="meal-prep-content">
                {mealPrepLoading ? (
                  <div className="meal-prep-loading">
                    <div className="meal-image-spinner"></div>
                    <p>Generating meal prep guide...</p>
                  </div>
                ) : mealPrepGuide ? (
                  <div className="meal-prep-guide">
                    {cleanMealPrepText(mealPrepGuide).split('\n').map((line, idx) => (
                      line.trim() ? <p key={idx}>{line}</p> : null
                    ))}
                  </div>
                ) : (
                  <p>Click to generate a meal prep guide for this plan.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Meal Action Modal */}
        {showMealModal && selectedMeal && (
          <div className="meal-modal-overlay" onClick={closeMealModal}>
            <div className="meal-modal" onClick={e => e.stopPropagation()}>
              {/* Meal Image - with loading state */}
              <div className="meal-modal-image">
                {mealImageLoading ? (
                  <div className="meal-image-loading">
                    <div className="meal-image-spinner"></div>
                    <span>Loading image...</span>
                  </div>
                ) : mealImageUrl ? (
                  <img src={mealImageUrl} alt={selectedMeal.name} />
                ) : (
                  <div className="meal-image-placeholder">
                    <Utensils size={48} />
                  </div>
                )}
              </div>

              {/* Meal Name */}
              <h2 className="meal-modal-name">{selectedMeal.name}</h2>

              {/* Macro Stats - MOVED ABOVE action buttons */}
              <div className="meal-modal-macros">
                <div className="meal-modal-macro">
                  <span className="macro-value">{selectedMeal.calories || 0}</span>
                  <span className="macro-label">Cal</span>
                </div>
                <div className="meal-modal-macro protein">
                  <span className="macro-value">{selectedMeal.protein || 0}g</span>
                  <span className="macro-label">Protein</span>
                </div>
                <div className="meal-modal-macro carbs">
                  <span className="macro-value">{selectedMeal.carbs || 0}g</span>
                  <span className="macro-label">Carbs</span>
                </div>
                <div className="meal-modal-macro fat">
                  <span className="macro-value">{selectedMeal.fat || 0}g</span>
                  <span className="macro-label">Fat</span>
                </div>
              </div>

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

              {/* Close Button */}
              <button className="meal-modal-close" onClick={closeMealModal}>
                <X size={24} />
              </button>
            </div>
          </div>
        )}

        {/* Custom Meal Modal - Full Tabbed Version */}
        {showCustomModal && (
          <div className="meal-modal-overlay" onClick={closeCustomModal}>
            <div className="custom-meal-modal-full" onClick={e => e.stopPropagation()}>
              <div className="custom-meal-header">
                <h2>🎯 Custom Meal</h2>
                <p>Create your own meal</p>
              </div>

              {/* Tabs */}
              <div className="custom-meal-tabs">
                <button
                  className={`custom-meal-tab ${customMealTab === 'calculate' ? 'active' : ''}`}
                  onClick={() => setCustomMealTab('calculate')}
                >
                  <span className="tab-icon">🧮</span>
                  <span className="tab-label">Calculate</span>
                </button>
                <button
                  className={`custom-meal-tab ${customMealTab === 'manual' ? 'active' : ''}`}
                  onClick={() => setCustomMealTab('manual')}
                >
                  <span className="tab-icon">✏️</span>
                  <span className="tab-label">Manual</span>
                </button>
                <button
                  className={`custom-meal-tab ${customMealTab === 'saved' ? 'active' : ''}`}
                  onClick={() => { setCustomMealTab('saved'); loadSavedMeals(); }}
                >
                  <span className="tab-icon">📚</span>
                  <span className="tab-label">My Saved</span>
                </button>
              </div>

              {/* Calculate Tab */}
              {customMealTab === 'calculate' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">💡 Search our food database for ingredients. Add them with quantities to calculate macros.</p>

                  {/* Food Search */}
                  <div className="food-search-container">
                    <div className="food-search-input-wrapper">
                      <Search size={18} className="search-icon" />
                      <input
                        type="text"
                        className="food-search-input"
                        placeholder="Search foods (e.g., chicken breast, rice...)"
                        value={foodSearchQuery}
                        onChange={e => handleFoodSearch(e.target.value)}
                      />
                    </div>

                    {/* Search Results */}
                    {(foodSearchResults.length > 0 || foodSearchLoading) && (
                      <div className="food-search-results">
                        {foodSearchLoading ? (
                          <div className="search-loading">Searching foods...</div>
                        ) : (
                          foodSearchResults.map((food, idx) => (
                            <div key={idx} className="food-search-item" onClick={() => addIngredient(food)}>
                              <div className="food-name">{food.name}</div>
                              <div className="food-macros">
                                Per 100g: {food.caloriesPer100g} cal | {food.proteinPer100g}g P | {food.carbsPer100g}g C | {food.fatPer100g}g F
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected Ingredients */}
                  <div className="ingredients-section">
                    <h4>Selected Ingredients ({selectedIngredients.length})</h4>
                    {selectedIngredients.length === 0 ? (
                      <p className="no-ingredients">No ingredients added yet</p>
                    ) : (
                      <div className="ingredients-list">
                        {selectedIngredients.map((ing, idx) => (
                          <div key={idx} className="ingredient-item">
                            <span className="ingredient-name">{ing.name.split(',')[0]}</span>
                            <div className="ingredient-controls">
                              <button className="qty-btn" onClick={() => updateIngredientQty(idx, ing.quantity - (ing.selectedUnit === 'g' ? 10 : 0.5))}>
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                className="qty-input"
                                value={ing.quantity}
                                onChange={e => updateIngredientQty(idx, e.target.value)}
                                min="0"
                                step={ing.selectedUnit === 'g' ? 10 : 0.5}
                              />
                              <button className="qty-btn" onClick={() => updateIngredientQty(idx, ing.quantity + (ing.selectedUnit === 'g' ? 10 : 0.5))}>
                                <Plus size={14} />
                              </button>
                              <select
                                className="unit-select"
                                value={ing.selectedUnit}
                                onChange={e => updateIngredientUnit(idx, e.target.value)}
                              >
                                {ing.measures.map(m => (
                                  <option key={m.label} value={m.label}>
                                    {m.label}{!m.isGrams ? ` (${m.weight}g)` : ''}
                                  </option>
                                ))}
                              </select>
                              <button className="remove-btn" onClick={() => removeIngredient(idx)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Calculated Totals */}
                  <div className="calculated-totals">
                    <h4>📊 Calculated Totals</h4>
                    <div className="totals-grid">
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().calories}</span>
                        <span className="total-label">Calories</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().protein}g</span>
                        <span className="total-label">Protein</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().carbs}g</span>
                        <span className="total-label">Carbs</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().fat}g</span>
                        <span className="total-label">Fat</span>
                      </div>
                    </div>
                  </div>

                  {/* Meal Name & Instructions */}
                  <div className="form-group">
                    <input
                      type="text"
                      className="custom-meal-input"
                      placeholder={getAutoMealName() || 'Meal name (optional - auto-generated if blank)'}
                      value={calculatedMealName}
                      onChange={e => setCalculatedMealName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <textarea
                      className="custom-meal-input"
                      placeholder="Cooking instructions (optional)"
                      value={calculatedInstructions}
                      onChange={e => setCalculatedInstructions(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Save for Later */}
                  <label className="save-for-later">
                    <input
                      type="checkbox"
                      checked={saveForLater}
                      onChange={e => setSaveForLater(e.target.checked)}
                    />
                    <span>💾 Save this meal for future use</span>
                  </label>

                  {/* Submit Button */}
                  <button
                    className={`create-meal-btn ${selectedIngredients.length === 0 ? 'disabled' : ''}`}
                    onClick={handleSubmitCalculatedMeal}
                    disabled={selectedIngredients.length === 0}
                  >
                    ✅ Create Meal
                  </button>
                </div>
              )}

              {/* Manual Tab */}
              {customMealTab === 'manual' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">💡 Enter the meal name and macros directly. Use nutrition labels or apps like MyFitnessPal.</p>

                  <div className="form-group">
                    <input
                      type="text"
                      className="custom-meal-input"
                      placeholder="Meal name (e.g., Protein Shake, Chicken Salad...)"
                      value={customMealData.name}
                      onChange={e => setCustomMealData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="macros-grid">
                    <div className="macro-input-group">
                      <label>Calories</label>
                      <input
                        type="number"
                        value={customMealData.calories}
                        onChange={e => setCustomMealData(prev => ({ ...prev, calories: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
                      <label>Protein (g)</label>
                      <input
                        type="number"
                        value={customMealData.protein}
                        onChange={e => setCustomMealData(prev => ({ ...prev, protein: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
                      <label>Carbs (g)</label>
                      <input
                        type="number"
                        value={customMealData.carbs}
                        onChange={e => setCustomMealData(prev => ({ ...prev, carbs: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
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
                    <textarea
                      className="custom-meal-input"
                      placeholder="Cooking instructions (optional)"
                      value={customMealData.instructions}
                      onChange={e => setCustomMealData(prev => ({ ...prev, instructions: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  {/* Save for Later */}
                  <label className="save-for-later">
                    <input
                      type="checkbox"
                      checked={saveForLater}
                      onChange={e => setSaveForLater(e.target.checked)}
                    />
                    <span>💾 Save this meal for future use</span>
                  </label>

                  {/* Submit Button */}
                  <button
                    className={`create-meal-btn ${!customMealData.name ? 'disabled' : ''}`}
                    onClick={handleSubmitManualMeal}
                    disabled={!customMealData.name}
                  >
                    ✅ Create Meal
                  </button>
                </div>
              )}

              {/* Saved Tab */}
              {customMealTab === 'saved' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">📚 Your saved custom meals. Click "Use" to add to your plan.</p>

                  {savedMealsLoading ? (
                    <div className="loading-state">Loading saved meals...</div>
                  ) : savedMeals.length === 0 ? (
                    <div className="empty-saved">
                      No saved meals yet. Create a meal and check "Save for future use" to add it here.
                    </div>
                  ) : (
                    <div className="saved-meals-list">
                      {savedMeals.map(meal => (
                        <div key={meal.id} className="saved-meal-item">
                          <div className="saved-meal-info">
                            <div className="saved-meal-name">{meal.name}</div>
                            <div className="saved-meal-macros">
                              {meal.calories} cal | {meal.protein}g P | {meal.carbs}g C | {meal.fat}g F
                            </div>
                          </div>
                          <div className="saved-meal-actions">
                            <button className="use-btn" onClick={() => useSavedMeal(meal.id)}>Use</button>
                            <button className="delete-btn" onClick={() => deleteSavedMeal(meal.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className="cancel-btn-full" onClick={closeCustomModal}>
                    Cancel
                  </button>
                </div>
              )}

              <button className="meal-modal-close" onClick={closeCustomModal}>
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
