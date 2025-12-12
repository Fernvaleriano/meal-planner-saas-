import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Star, Camera, Search, Heart, Copy, ArrowLeft, FileText, Sunrise, Sun, Moon, Apple, Droplets, Bot, Maximize2, BarChart3, Check, Trash2, Dumbbell, UtensilsCrossed, Mic, X, ChefHat, Sparkles, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { FavoritesModal } from '../components/FoodModals';

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
  const navigate = useNavigate();
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

  // Modal states
  const [showCopyDayModal, setShowCopyDayModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [showWeeklySummaryModal, setShowWeeklySummaryModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showAILogModal, setShowAILogModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showSaveMealModal, setShowSaveMealModal] = useState(false);
  const [saveMealType, setSaveMealType] = useState('');
  const [copyDateInput, setCopyDateInput] = useState('');
  const [copyMode, setCopyMode] = useState('from');

  // AI Assistant states
  const [aiMessages, setAiMessages] = useState([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const aiInputRef = useRef(null);

  // Food search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

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

  // Copy entries from one date to another
  const copyEntriesFromDate = async (fromDate, toDate) => {
    if (!clientData?.id) return;

    try {
      // Fetch entries from source date
      const data = await apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${fromDate}`);

      if (!data.entries || data.entries.length === 0) {
        alert('No entries to copy from that date');
        return;
      }

      // Copy each entry to target date
      let copiedCount = 0;
      for (const entry of data.entries) {
        try {
          await apiPost('/.netlify/functions/food-diary', {
            clientId: clientData.id,
            coachId: clientData.coach_id,
            entryDate: toDate,
            mealType: entry.meal_type,
            foodName: entry.food_name,
            brand: entry.brand,
            servingSize: entry.serving_size,
            servingUnit: entry.serving_unit,
            numberOfServings: entry.number_of_servings,
            calories: entry.calories,
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
            fiber: entry.fiber,
            foodSource: 'copied'
          });
          copiedCount++;
        } catch (e) { /* ignore individual failures */ }
      }

      alert(`Copied ${copiedCount} entries!`);

      // Reload if we copied to current date
      if (toDate === formatDate(currentDate)) {
        // Trigger reload by re-setting date
        setCurrentDate(new Date(currentDate));
      }
    } catch (err) {
      console.error('Error copying entries:', err);
      alert('Failed to copy entries');
    }
  };

  // Copy from yesterday
  const copyFromYesterday = async () => {
    const yesterday = new Date(currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    await copyEntriesFromDate(formatDate(yesterday), formatDate(currentDate));
  };

  // Execute copy from date picker
  const executeCopyDate = async () => {
    if (!copyDateInput) {
      alert('Please select a date');
      return;
    }
    setShowCopyDayModal(false);
    if (copyMode === 'from') {
      await copyEntriesFromDate(copyDateInput, formatDate(currentDate));
    } else {
      await copyEntriesFromDate(formatDate(currentDate), copyDateInput);
    }
    setCopyDateInput('');
  };

  // Food search
  const handleFoodSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await apiGet(`/.netlify/functions/food-search?q=${encodeURIComponent(query)}`);
      setSearchResults(data.foods || []);
    } catch (err) {
      console.error('Error searching foods:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Add food from search results
  const addFoodFromSearch = async (food) => {
    if (!clientData?.id) return;
    try {
      const dateStr = formatDate(currentDate);
      const result = await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: dateStr,
        mealType: selectedMealType,
        foodName: food.name,
        brand: food.brand,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        servingSize: food.serving_size || 1,
        servingUnit: food.serving_unit || 'serving',
        numberOfServings: 1,
        foodSource: 'search'
      });

      if (result.entry) {
        const updatedEntries = [...entries, result.entry];
        const updatedTotals = {
          calories: totals.calories + (food.calories || 0),
          protein: totals.protein + (food.protein || 0),
          carbs: totals.carbs + (food.carbs || 0),
          fat: totals.fat + (food.fat || 0)
        };
        setEntries(updatedEntries);
        setTotals(updatedTotals);

        // Update cache
        const cacheKey = `diary_${clientData.id}_${dateStr}`;
        const cached = getCache(cacheKey) || {};
        setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });
      }
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error adding food:', err);
    }
  };

  // Open AI chat and ask a question
  const askAI = async (question) => {
    setAiInput(question);
    // Auto-send after a short delay
    setTimeout(() => {
      handleAiChat(question);
    }, 100);
  };

  // Handle AI chat message
  const handleAiChat = async (message = aiInput) => {
    if (!message.trim() || !clientData?.id) return;
    setAiLogging(true);

    // Add user message
    setAiMessages(prev => [...prev, { role: 'user', content: message }]);
    setAiInput('');

    try {
      const data = await apiPost('/.netlify/functions/client-diary-ai', {
        clientId: clientData.id,
        clientFirstName: clientData.first_name,
        message: message,
        todayEntries: entries || [],
        goals: goals || {},
        totals: totals || { calories: 0, protein: 0, carbs: 0, fat: 0 }
      });

      if (data.error) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        return;
      }

      // Check if AI wants to log food
      if (data.parsed && data.parsed.action === 'log_food') {
        // Handle food logging from AI
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch (err) {
      console.error('AI error:', err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t connect. Please try again.' }]);
    } finally {
      setAiLogging(false);
    }
  };

  // Save meal as favorite
  const handleSaveMeal = async (mealName) => {
    if (!mealName.trim() || !clientData?.id) return;

    const mealEntries = groupedEntries[saveMealType];
    if (!mealEntries || mealEntries.length === 0) {
      alert('No foods in this meal to save');
      return;
    }

    try {
      await apiPost('/.netlify/functions/favorite-meals', {
        clientId: clientData.id,
        name: mealName,
        foods: mealEntries.map(e => ({
          food_name: e.food_name,
          calories: e.calories,
          protein: e.protein,
          carbs: e.carbs,
          fat: e.fat,
          serving_size: e.serving_size,
          serving_unit: e.serving_unit,
          number_of_servings: e.number_of_servings
        }))
      });
      alert('Meal saved to favorites!');
      setShowSaveMealModal(false);
    } catch (err) {
      console.error('Error saving meal:', err);
      alert('Failed to save meal');
    }
  };

  // Handle adding from favorites
  const handleAddFromFavorite = async (favorite) => {
    if (!clientData?.id) return;
    const dateStr = formatDate(currentDate);

    try {
      let newEntries = [];
      let addedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      for (const food of favorite.foods) {
        const result = await apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate: dateStr,
          mealType: selectedMealType,
          foodName: food.food_name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: food.serving_size || 1,
          servingUnit: food.serving_unit || 'serving',
          numberOfServings: food.number_of_servings || 1,
          foodSource: 'favorite'
        });

        if (result.entry) {
          newEntries.push(result.entry);
        }
        addedTotals.calories += food.calories || 0;
        addedTotals.protein += food.protein || 0;
        addedTotals.carbs += food.carbs || 0;
        addedTotals.fat += food.fat || 0;
      }

      const updatedEntries = [...entries, ...newEntries];
      const updatedTotals = {
        calories: totals.calories + addedTotals.calories,
        protein: totals.protein + addedTotals.protein,
        carbs: totals.carbs + addedTotals.carbs,
        fat: totals.fat + addedTotals.fat
      };

      setEntries(updatedEntries);
      setTotals(updatedTotals);

      // Update cache
      const cacheKey = `diary_${clientData.id}_${dateStr}`;
      const cached = getCache(cacheKey) || {};
      setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });

      setShowFavoritesModal(false);
    } catch (err) {
      console.error('Error adding from favorite:', err);
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

    const openAddFood = () => {
      setSelectedMealType(mealType);
      setShowSearchModal(true);
    };

    const openSaveMeal = () => {
      if (entries.length === 0) {
        alert('Add some foods first to save as a meal');
        return;
      }
      setSaveMealType(mealType);
      setShowSaveMealModal(true);
    };

    return (
      <div className="meal-section">
        <div className="meal-section-header">
          <div className="meal-section-title">
            {getMealIcon(mealType)}
            <span>{title}</span>
          </div>
          <span className="meal-section-cals">{mealCals} cal</span>
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
            onClick={openAddFood}
          >
            <Plus size={16} />
            Add Food
          </button>
          {entries.length > 0 && (
            <button className="meal-footer-btn save" onClick={openSaveMeal}>
              <Heart size={16} />
              Save Meal
            </button>
          )}
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
        <button className="diary-action-btn" onClick={() => setShowCopyDayModal(true)}>
          <Copy size={16} />
          Copy Day
        </button>
        <button className="diary-action-btn" onClick={copyFromYesterday}>
          <ArrowLeft size={16} />
          Copy Yesterday
        </button>
        <button className="diary-action-btn" onClick={() => setShowDailyReportModal(true)}>
          <FileText size={16} />
          Daily
        </button>
        <button className="diary-action-btn" onClick={() => setShowWeeklySummaryModal(true)}>
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
          <button className="add-food-option" onClick={() => setAiExpanded(true)}>
            <Star size={20} />
            <span>AI Log</span>
          </button>
          <button className="add-food-option" onClick={() => navigate('/app-test/dashboard')}>
            <Camera size={20} />
            <span>Photo</span>
          </button>
          <button className="add-food-option" onClick={() => setShowSearchModal(true)}>
            <Search size={20} />
            <span>Search</span>
          </button>
          <button className="add-food-option" onClick={() => setShowFavoritesModal(true)}>
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
      <div className={`ai-assistant-card ${aiExpanded ? 'expanded' : ''}`}>
        <div className="ai-assistant-header">
          <div className="ai-assistant-title">
            <Bot size={18} className="ai-icon" />
            <span>AI Nutrition Assistant</span>
          </div>
          <button
            className="ai-expand-btn"
            onClick={() => setAiExpanded(!aiExpanded)}
          >
            {aiExpanded ? <X size={16} /> : <Maximize2 size={16} />}
            <span>{aiExpanded ? 'Close' : 'Expand'}</span>
          </button>
        </div>

        {/* Smart Suggestions based on macro gaps */}
        <div className="ai-suggestions-bar">
          {goals.protein_goal - totals.protein > 30 && (
            <button
              className="ai-suggestion-chip protein"
              onClick={() => askAI('What high protein foods should I eat?')}
            >
              Need {Math.round(goals.protein_goal - totals.protein)}g more protein
            </button>
          )}
          {goals.calorie_goal - totals.calories > 500 && (
            <button
              className="ai-suggestion-chip"
              onClick={() => askAI(`What should I eat with ${goals.calorie_goal - totals.calories} calories left?`)}
            >
              {goals.calorie_goal - totals.calories} cal remaining
            </button>
          )}
          <button
            className="ai-suggestion-chip ingredients"
            onClick={() => askAI('I have some ingredients - help me make a meal')}
          >
            <ChefHat size={14} /> What can I make?
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="ai-quick-actions">
          <button className="ai-quick-btn" onClick={() => askAI('What should I eat to hit my protein goal?')}>
            <Dumbbell size={14} style={{ color: '#ef4444' }} /> Need protein
          </button>
          <button className="ai-quick-btn" onClick={() => askAI('Give me a healthy snack idea')}>
            <Apple size={14} style={{ color: '#ef4444' }} /> Snack ideas
          </button>
          <button className="ai-quick-btn" onClick={() => askAI('How am I doing today?')}>
            <BarChart3 size={14} style={{ color: '#10b981' }} /> My progress
          </button>
          <button className="ai-quick-btn" onClick={() => askAI('What can I eat for dinner?')}>
            <UtensilsCrossed size={14} style={{ color: '#8b5cf6' }} /> Dinner ideas
          </button>
        </div>

        {/* Chat Messages (shown when expanded) */}
        {aiExpanded && aiMessages.length > 0 && (
          <div className="ai-chat-messages">
            {aiMessages.map((msg, idx) => (
              <div key={idx} className={`ai-message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {aiLogging && (
          <div className="ai-loading">
            <div className="ai-loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>Thinking...</span>
          </div>
        )}

        {/* Meal Type Chips */}
        <div className="ai-assistant-chips">
          <span style={{ fontSize: '0.8rem', color: '#64748b', marginRight: '8px' }}>Logging to:</span>
          {['breakfast', 'lunch', 'dinner', 'snack'].map(meal => (
            <button
              key={meal}
              className={`ai-chip ${selectedMealType === meal ? 'active' : ''}`}
              onClick={() => setSelectedMealType(meal)}
            >
              {meal.charAt(0).toUpperCase() + meal.slice(1)}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="ai-input-row">
          <input
            ref={aiInputRef}
            type="text"
            className="ai-input"
            placeholder="Ask me anything or log food... (e.g., 'log 2 eggs and toast')"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAiChat()}
            disabled={aiLogging}
          />
          <button
            className="ai-send-btn"
            onClick={() => handleAiChat()}
            disabled={aiLogging || !aiInput.trim()}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* AI Expanded Overlay */}
      {aiExpanded && (
        <div className="ai-expanded-overlay" onClick={() => setAiExpanded(false)} />
      )}

      {/* Copy Day Modal */}
      {showCopyDayModal && (
        <div className="modal-overlay active" onClick={() => setShowCopyDayModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowCopyDayModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Copy Day</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  {copyMode === 'from' ? 'Copy entries FROM this date:' : 'Copy entries TO this date:'}
                </label>
                <input
                  type="date"
                  value={copyDateInput}
                  onChange={(e) => setCopyDateInput(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  className={`ai-chip ${copyMode === 'from' ? 'active' : ''}`}
                  onClick={() => setCopyMode('from')}
                >
                  Copy From Date
                </button>
                <button
                  className={`ai-chip ${copyMode === 'to' ? 'active' : ''}`}
                  onClick={() => setCopyMode('to')}
                >
                  Copy To Date
                </button>
              </div>
              <button
                className="btn-primary"
                onClick={executeCopyDate}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#0d9488', color: 'white', border: 'none', fontWeight: 600 }}
              >
                Copy Entries
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Report Modal */}
      {showDailyReportModal && (
        <div className="modal-overlay active" onClick={() => setShowDailyReportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowDailyReportModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Daily Report</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div className="daily-report-card">
                <h3>Daily Summary - {formatFullDate()}</h3>
                <div className="report-stats">
                  <div className="report-stat">
                    <span className="report-value">{totals.calories}</span>
                    <span className="report-label">Calories</span>
                  </div>
                  <div className="report-stat">
                    <span className="report-value">{Math.round(totals.protein)}g</span>
                    <span className="report-label">Protein</span>
                  </div>
                  <div className="report-stat">
                    <span className="report-value">{Math.round(totals.carbs)}g</span>
                    <span className="report-label">Carbs</span>
                  </div>
                  <div className="report-stat">
                    <span className="report-value">{Math.round(totals.fat)}g</span>
                    <span className="report-label">Fat</span>
                  </div>
                </div>
                <div className="report-progress">
                  <div className="progress-item">
                    <span>Calories</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${calorieProgress}%` }} />
                    </div>
                    <span>{calorieProgress}%</span>
                  </div>
                  <div className="progress-item">
                    <span>Protein</span>
                    <div className="progress-bar">
                      <div className="progress-fill protein" style={{ width: `${proteinProgress}%` }} />
                    </div>
                    <span>{proteinProgress}%</span>
                  </div>
                  <div className="progress-item">
                    <span>Water</span>
                    <div className="progress-bar">
                      <div className="progress-fill water" style={{ width: `${(waterIntake / waterGoal) * 100}%` }} />
                    </div>
                    <span>{waterIntake}/{waterGoal}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Summary Modal */}
      {showWeeklySummaryModal && (
        <div className="modal-overlay active" onClick={() => setShowWeeklySummaryModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowWeeklySummaryModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Weekly Summary</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ textAlign: 'center', color: '#64748b' }}>
                Weekly summary shows your progress over the past 7 days.
              </p>
              <div style={{ marginTop: '16px', padding: '16px', background: '#f1f5f9', borderRadius: '12px' }}>
                <p><strong>Today's Stats:</strong></p>
                <p>Calories: {totals.calories} / {goals.calorie_goal}</p>
                <p>Protein: {Math.round(totals.protein)}g / {goals.protein_goal}g</p>
                <p>Water: {waterIntake} / {waterGoal} glasses</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Food Search Modal */}
      {showSearchModal && (
        <div className="modal-overlay active" onClick={() => setShowSearchModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowSearchModal(false)}>&times;</button>
              <input
                type="text"
                className="search-input"
                placeholder="Search for food..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleFoodSearch(e.target.value);
                }}
                autoFocus
              />
            </div>
            <div className="modal-body">
              <div className="search-results">
                {searchLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((food, idx) => (
                    <div key={idx} className="search-result-item" onClick={() => addFoodFromSearch(food)}>
                      <div className="food-info">
                        <span className="food-name">{food.name}</span>
                        {food.brand && <span className="food-brand">{food.brand}</span>}
                      </div>
                      <span className="food-cals">{food.calories} cal</span>
                    </div>
                  ))
                ) : searchQuery ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    No results found
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    Type to search for foods
                  </div>
                )}
              </div>

              {/* Quick Add Options */}
              <div className="quick-add-section" style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <div style={{ fontWeight: 600, marginBottom: '12px', color: '#64748b' }}>Or try these options</div>
                <button className="quick-add-btn" onClick={() => { setShowSearchModal(false); setAiExpanded(true); }}>
                  <div className="quick-add-icon" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mic size={20} color="white" />
                  </div>
                  <div className="quick-add-text">
                    <div style={{ fontWeight: 600 }}>AI Voice/Text Log</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Speak or type what you ate</div>
                  </div>
                </button>
                <button className="quick-add-btn" onClick={() => { setShowSearchModal(false); setShowFavoritesModal(true); }} style={{ marginTop: '10px' }}>
                  <div className="quick-add-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Heart size={20} color="white" />
                  </div>
                  <div className="quick-add-text">
                    <div style={{ fontWeight: 600 }}>From Favorites</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Add your saved favorite meals</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Meal Modal */}
      {showSaveMealModal && (
        <div className="modal-overlay active" onClick={() => setShowSaveMealModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowSaveMealModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Save Meal to Favorites</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Meal Name</label>
              <input
                type="text"
                id="saveMealName"
                placeholder={`e.g., My ${saveMealType.charAt(0).toUpperCase() + saveMealType.slice(1)}`}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}
              />
              <button
                className="btn-primary"
                onClick={() => handleSaveMeal(document.getElementById('saveMealName').value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#0d9488', color: 'white', border: 'none', fontWeight: 600 }}
              >
                Save to Favorites
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Favorites Modal */}
      <FavoritesModal
        isOpen={showFavoritesModal}
        onClose={() => setShowFavoritesModal(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={(nutrition) => {
          // Update totals after logging from favorites
          const updatedTotals = {
            calories: totals.calories + (nutrition.calories || 0),
            protein: totals.protein + (nutrition.protein || 0),
            carbs: totals.carbs + (nutrition.carbs || 0),
            fat: totals.fat + (nutrition.fat || 0)
          };
          setTotals(updatedTotals);

          // Update cache
          const dateStr = formatDate(currentDate);
          const cacheKey = `diary_${clientData?.id}_${dateStr}`;
          const cached = getCache(cacheKey) || {};
          setCache(cacheKey, { ...cached, totals: updatedTotals });
        }}
      />
    </div>
  );
}

export default Diary;
