import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Star, Camera, Search, Heart, Copy, ArrowLeft, FileText, Sunrise, Sun, Moon, Apple, Droplets, Bot, Maximize2, BarChart3, Check, Trash2 } from 'lucide-react';
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

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Diary() {
  const { clientData } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Load initial data from cache for instant display
  const dateKey = formatDateKey(currentDate);
  const cachedDiary = clientData?.id ? getCache(`diary_${clientData.id}_${dateKey}`) : null;

  const [entries, setEntries] = useState(cachedDiary?.entries || []);
  const [loading, setLoading] = useState(false); // Start false for instant UI
  const [totals, setTotals] = useState(cachedDiary?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [goals, setGoals] = useState(cachedDiary?.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75 });
  const [waterIntake, setWaterIntake] = useState(cachedDiary?.water || 0);
  const [waterGoal] = useState(8);
  const [waterLoading, setWaterLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLogging, setAiLogging] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState('snack');

  // Format date for display
  const formatDateDisplay = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(currentDate);
    selected.setHours(0, 0, 0, 0);

    const diffDays = Math.round((selected - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 1) return 'Tomorrow';
    return currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatFullDate = () => {
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Navigate date
  const changeDate = (days) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  // Load diary entries and water intake - with caching
  useEffect(() => {
    if (!clientData?.id) return;

    const dateStr = formatDate(currentDate);
    const cacheKey = `diary_${clientData.id}_${dateStr}`;

    // Load from cache first for instant display
    const cached = getCache(cacheKey);
    if (cached) {
      setEntries(cached.entries || []);
      setTotals(cached.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 });
      setGoals(cached.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75 });
      setWaterIntake(cached.water || 0);
    }

    // Fetch fresh data in background
    Promise.all([
      apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateStr}`),
      apiGet(`/.netlify/functions/water-intake?clientId=${clientData.id}&date=${dateStr}`).catch(() => null)
    ]).then(([diaryData, waterData]) => {
      const newEntries = diaryData.entries || [];
      const newGoals = diaryData.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75 };
      const newWater = waterData?.glasses || 0;

      // Calculate totals
      const calculatedTotals = newEntries.reduce((acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

      // Update state
      setEntries(newEntries);
      setGoals(newGoals);
      setWaterIntake(newWater);
      setTotals(calculatedTotals);

      // Cache for next time
      setCache(cacheKey, {
        entries: newEntries,
        totals: calculatedTotals,
        goals: newGoals,
        water: newWater
      });
    }).catch(err => {
      console.error('Error loading diary:', err);
    });

  }, [clientData?.id, currentDate]);

  // Handle water intake actions - optimistic updates with cache
  const handleWaterAction = async (action, amount = 1) => {
    if (!clientData?.id) return;

    // Calculate new value optimistically
    let newGlasses = waterIntake;
    if (action === 'add') {
      newGlasses = Math.min(waterGoal, waterIntake + amount);
    } else if (action === 'remove') {
      newGlasses = Math.max(0, waterIntake - amount);
    } else if (action === 'complete') {
      newGlasses = waterGoal;
    }

    // Update UI immediately (optimistic update)
    setWaterIntake(newGlasses);

    // Update cache
    const dateStr = formatDate(currentDate);
    const cacheKey = `diary_${clientData.id}_${dateStr}`;
    const cached = getCache(cacheKey) || {};
    setCache(cacheKey, { ...cached, water: newGlasses });

    // Save to server in background
    try {
      await apiPost('/.netlify/functions/water-intake', {
        clientId: clientData.id,
        date: dateStr,
        action: action,
        glasses: amount
      });
    } catch (err) {
      console.error('Error saving water intake:', err);
    }
  };

  // Handle AI food logging
  const handleAiLog = async () => {
    if (!aiInput.trim() || !clientData?.id) return;
    setAiLogging(true);

    try {
      // Step 1: Analyze food with AI
      const aiData = await apiPost('/.netlify/functions/analyze-food-text', {
        text: aiInput
      });

      if (!aiData?.foods || aiData.foods.length === 0) {
        console.error('No foods recognized');
        return;
      }

      // Step 2: Log each food item
      const dateStr = formatDate(currentDate);
      let newEntries = [];
      let addedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      for (const food of aiData.foods) {
        const result = await apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate: dateStr,
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

        if (result.entry) {
          newEntries.push(result.entry);
        }

        addedTotals.calories += food.calories || 0;
        addedTotals.protein += food.protein || 0;
        addedTotals.carbs += food.carbs || 0;
        addedTotals.fat += food.fat || 0;
      }

      // Update local state
      const updatedEntries = [...entries, ...newEntries];
      const updatedTotals = {
        calories: totals.calories + addedTotals.calories,
        protein: totals.protein + addedTotals.protein,
        carbs: totals.carbs + addedTotals.carbs,
        fat: totals.fat + addedTotals.fat
      };

      setEntries(updatedEntries);
      setTotals(updatedTotals);
      setAiInput('');

      // Update cache
      const cacheKey = `diary_${clientData.id}_${dateStr}`;
      const cached = getCache(cacheKey) || {};
      setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });
    } catch (err) {
      console.error('Error logging food:', err);
    } finally {
      setAiLogging(false);
    }
  };

  // Handle deleting a food entry
  const handleDeleteEntry = async (entryId, foodName) => {
    // Confirm before deleting
    if (!window.confirm(`Delete "${foodName}"?`)) {
      return;
    }

    try {
      await apiDelete(`/.netlify/functions/food-diary?entryId=${entryId}`);

      // Find the entry to subtract from totals
      const deletedEntry = entries.find(e => e.id === entryId);
      const updatedEntries = entries.filter(e => e.id !== entryId);
      let updatedTotals = totals;

      if (deletedEntry) {
        updatedTotals = {
          calories: totals.calories - (deletedEntry.calories || 0),
          protein: totals.protein - (deletedEntry.protein || 0),
          carbs: totals.carbs - (deletedEntry.carbs || 0),
          fat: totals.fat - (deletedEntry.fat || 0)
        };
        setTotals(updatedTotals);
      }

      setEntries(updatedEntries);

      // Update cache
      const dateStr = formatDate(currentDate);
      const cacheKey = `diary_${clientData.id}_${dateStr}`;
      const cached = getCache(cacheKey) || {};
      setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  // Group entries by meal type
  const groupedEntries = {
    breakfast: entries.filter(e => e.meal_type === 'breakfast'),
    lunch: entries.filter(e => e.meal_type === 'lunch'),
    dinner: entries.filter(e => e.meal_type === 'dinner'),
    snack: entries.filter(e => e.meal_type === 'snack')
  };

  // Calculate remaining and progress
  const remaining = goals.calorie_goal - totals.calories;
  const calorieProgress = Math.min(100, Math.round((totals.calories / goals.calorie_goal) * 100));
  const proteinProgress = Math.min(100, Math.round((totals.protein / goals.protein_goal) * 100));
  const carbsProgress = Math.min(100, Math.round((totals.carbs / goals.carbs_goal) * 100));
  const fatProgress = Math.min(100, Math.round((totals.fat / goals.fat_goal) * 100));

  // Calorie ring component
  const CalorieRing = () => {
    const radius = 85;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (calorieProgress / 100) * circumference;

    return (
      <div className="calorie-ring-container">
        <svg viewBox="0 0 200 200" className="calorie-ring-svg">
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="calorie-ring-bg"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="calorie-ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="calorie-ring-value">
          <span className="calorie-remaining">{remaining}</span>
          <span className="calorie-label">Remaining</span>
        </div>
      </div>
    );
  };

  // Meal section icons
  const getMealIcon = (mealType) => {
    switch (mealType) {
      case 'breakfast': return <Sunrise size={18} className="meal-section-icon breakfast" />;
      case 'lunch': return <Sun size={18} className="meal-section-icon lunch" />;
      case 'dinner': return <Moon size={18} className="meal-section-icon dinner" />;
      case 'snack': return <Apple size={18} className="meal-section-icon snack" />;
      default: return null;
    }
  };

  // Meal section component
  const MealSection = ({ title, entries, mealType }) => {
    const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);

    return (
      <div className="meal-section">
        <div className="meal-section-header">
          <div className="meal-section-title">
            {getMealIcon(mealType)}
            <span>{title}</span>
          </div>
          <div className="meal-section-actions">
            <span className="meal-section-cals">{mealCals} cal</span>
            <button
              className="meal-add-btn"
              onClick={() => setSelectedMealType(mealType)}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="meal-entries">
            {entries.map(entry => (
              <div key={entry.id} className="meal-entry">
                <div className="meal-entry-info">
                  <span className="meal-entry-name">{entry.food_name}</span>
                  <span className="meal-entry-serving">{entry.number_of_servings || 1} serving</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="meal-entry-cals">{entry.calories || 0}</span>
                  <button
                    onClick={() => handleDeleteEntry(entry.id, entry.food_name)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="meal-section-footer">
          <button
            className="meal-footer-btn add"
            onClick={() => setSelectedMealType(mealType)}
          >
            <Plus size={16} />
            Add Food
          </button>
          <button className="meal-footer-btn save">
            <Heart size={16} />
            Save Meal
          </button>
        </div>
      </div>
    );
  };

  // Water glass visual
  const WaterGlasses = () => {
    const glasses = Array(waterGoal).fill(0);
    return (
      <div className="water-glasses">
        {glasses.map((_, i) => (
          <div
            key={i}
            className={`water-glass ${i < waterIntake ? 'filled' : ''}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="diary-page">
      {/* Date Navigation */}
      <div className="date-navigator">
        <button className="date-nav-btn" onClick={() => changeDate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <div className="date-display">
          <span className="date-label">{formatDateDisplay()}</span>
          <span className="date-full">{formatFullDate()}</span>
        </div>
        <button className="date-nav-btn" onClick={() => changeDate(1)}>
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Quick Actions Row */}
      <div className="diary-quick-actions">
        <button className="diary-action-btn">
          <Copy size={16} />
          Copy Day
        </button>
        <button className="diary-action-btn">
          <ArrowLeft size={16} />
          Copy Yesterday
        </button>
        <button className="diary-action-btn">
          <FileText size={16} />
          Daily
        </button>
        <button className="diary-action-btn">
          <BarChart3 size={16} />
          Weekly
        </button>
      </div>

      {/* Add Food Section */}
      <div className="add-food-section">
        <div className="add-food-header">
          <Plus size={18} className="add-food-icon" />
          <span>Add Food</span>
        </div>
        <div className="add-food-options">
          <button className="add-food-option">
            <Star size={20} />
            <span>AI Log</span>
          </button>
          <button className="add-food-option">
            <Camera size={20} />
            <span>Photo</span>
          </button>
          <button className="add-food-option">
            <Search size={20} />
            <span>Search</span>
          </button>
          <button className="add-food-option">
            <Heart size={20} />
            <span>Favorites</span>
          </button>
        </div>
      </div>

      {/* Calorie Summary */}
      <div className="calorie-summary">
        <h3 className="calorie-title">Calories</h3>
        <CalorieRing />
        <div className="calorie-breakdown">
          <div className="calorie-stat">
            <span className="calorie-stat-value">{goals.calorie_goal}</span>
            <span className="calorie-stat-label">Goal</span>
          </div>
          <span className="calorie-operator">-</span>
          <div className="calorie-stat">
            <span className="calorie-stat-value">{totals.calories}</span>
            <span className="calorie-stat-label">Food</span>
          </div>
          <span className="calorie-operator">=</span>
          <div className="calorie-stat">
            <span className="calorie-stat-value remaining">{remaining}</span>
            <span className="calorie-stat-label">Left</span>
          </div>
        </div>

        {/* Macro Progress Bars */}
        <div className="macro-progress-bars">
          <div className="macro-bar-item">
            <span className="macro-bar-label protein">P:</span>
            <span className="macro-bar-value">{Math.round(totals.protein)}/{goals.protein_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill protein" style={{ width: `${proteinProgress}%` }} />
            </div>
          </div>
          <div className="macro-bar-item">
            <span className="macro-bar-label carbs">C:</span>
            <span className="macro-bar-value">{Math.round(totals.carbs)}/{goals.carbs_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill carbs" style={{ width: `${carbsProgress}%` }} />
            </div>
          </div>
          <div className="macro-bar-item">
            <span className="macro-bar-label fat">F:</span>
            <span className="macro-bar-value">{Math.round(totals.fat)}/{goals.fat_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill fat" style={{ width: `${fatProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Meal Sections */}
      {loading ? (
        <div className="meal-sections-loading">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton meal-section-skeleton" />
          ))}
        </div>
      ) : (
        <div className="meal-sections">
          <MealSection title="Breakfast" entries={groupedEntries.breakfast} mealType="breakfast" />
          <MealSection title="Lunch" entries={groupedEntries.lunch} mealType="lunch" />
          <MealSection title="Dinner" entries={groupedEntries.dinner} mealType="dinner" />
          <MealSection title="Snacks" entries={groupedEntries.snack} mealType="snack" />
        </div>
      )}

      {/* Water Intake */}
      <div className="water-intake-card">
        <div className="water-intake-header">
          <div className="water-intake-title">
            <Droplets size={18} className="water-icon" />
            <span>Water Intake</span>
          </div>
          <span className="water-goal-badge">Goal: {waterGoal} glasses</span>
        </div>
        <div className="water-intake-content">
          <WaterGlasses />
          <div className="water-intake-count">
            <span className="water-count">{waterIntake}/{waterGoal}</span>
            <span className="water-label">glasses today</span>
          </div>
        </div>
        <div className="water-intake-actions">
          <button
            className="water-btn add"
            onClick={() => handleWaterAction('add', 1)}
            disabled={waterLoading || waterIntake >= waterGoal}
          >
            +1 Glass
          </button>
          <button
            className="water-btn add"
            onClick={() => handleWaterAction('add', 2)}
            disabled={waterLoading || waterIntake >= waterGoal}
          >
            +2 Glasses
          </button>
          <button
            className="water-btn remove"
            onClick={() => handleWaterAction('remove', 1)}
            disabled={waterLoading || waterIntake <= 0}
          >
            -1
          </button>
          <button
            className="water-btn complete"
            onClick={() => handleWaterAction('complete')}
            disabled={waterLoading || waterIntake >= waterGoal}
          >
            {waterIntake >= waterGoal ? 'Complete!' : 'Complete Goal'}
          </button>
        </div>
      </div>

      {/* AI Nutrition Assistant */}
      <div className="ai-assistant-card">
        <div className="ai-assistant-header">
          <div className="ai-assistant-title">
            <Bot size={18} className="ai-icon" />
            <span>AI Food Logger</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Logging to: <strong style={{ color: '#0d9488', textTransform: 'capitalize' }}>{selectedMealType}</strong>
            </span>
          </div>
        </div>
        <div className="ai-assistant-suggestions">
          <button className="ai-suggestion protein">Need {Math.max(0, goals.protein_goal - Math.round(totals.protein))}g more protein</button>
          <button className="ai-suggestion recipe">What can I make?</button>
        </div>
        <div className="ai-assistant-chips">
          <button className="ai-chip" onClick={() => setSelectedMealType('breakfast')}>Breakfast</button>
          <button className="ai-chip" onClick={() => setSelectedMealType('lunch')}>Lunch</button>
          <button className="ai-chip" onClick={() => setSelectedMealType('dinner')}>Dinner</button>
          <button className="ai-chip" onClick={() => setSelectedMealType('snack')}>Snack</button>
        </div>
        <div className="ai-input-row">
          <input
            type="text"
            className="ai-input"
            placeholder="Describe what you ate... e.g., 'chicken salad with ranch'"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAiLog()}
            disabled={aiLogging}
          />
          <button
            className="ai-send-btn"
            onClick={handleAiLog}
            disabled={aiLogging || !aiInput.trim()}
            style={aiLogging ? { opacity: 0.7 } : {}}
          >
            {aiLogging ? 'Logging...' : 'Log'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Diary;
