import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Camera, Search, Heart, Copy, ArrowLeft, FileText, Sunrise, Sun, Moon, Apple, Droplets, Bot, Maximize2, BarChart3, Check, Trash2, Dumbbell, UtensilsCrossed, Mic, X, ChefHat, Sparkles, Send, Zap, MapPin, Salad } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete, ensureFreshSession } from '../utils/api';
import { FavoritesModal, SnapPhotoModal, ScanLabelModal, SearchFoodsModal } from '../components/FoodModals';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

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
  const { clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Load initial data from cache for instant display
  const dateKey = formatDateKey(currentDate);
  const cachedDiary = clientData?.id ? getCache(`diary_${clientData.id}_${dateKey}`) : null;

  const [entries, setEntries] = useState(cachedDiary?.entries || []);
  const [loading, setLoading] = useState(false); // Start false for instant UI
  const [totals, setTotals] = useState(cachedDiary?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0, cholesterol: 0 });
  const [goals, setGoals] = useState(cachedDiary?.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75, fiber_goal: 28, sugar_goal: 50, sodium_goal: 2300, potassium_goal: 3500, calcium_goal: 1000, iron_goal: 18, vitaminC_goal: 90, cholesterol_goal: 300 });
  const [waterIntake, setWaterIntake] = useState(cachedDiary?.water || 0);
  const [waterGoal] = useState(8);
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
  const [showScanLabelModal, setShowScanLabelModal] = useState(false);
  const [saveMealType, setSaveMealType] = useState('');
  const [copyDateInput, setCopyDateInput] = useState('');
  const [copyMode, setCopyMode] = useState('from');
  const [showEditEntryModal, setShowEditEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  // AI Assistant states
  const [aiMessages, setAiMessages] = useState([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const aiInputRef = useRef(null);
  const [pendingFoodLog, setPendingFoodLog] = useState(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [suggestionContext, setSuggestionContext] = useState(null);
  const [selectedAIMealType, setSelectedAIMealType] = useState(null);

  // Voice input states
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const preVoiceInputRef = useRef('');

  // Water debounce ref
  const waterDebounceRef = useRef(null);
  const waterPendingRef = useRef(null);

  // Food search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Weekly summary states
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Multi-select states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState(new Set());

  // Diary interactions (reactions & comments from coach)
  const [interactions, setInteractions] = useState({ reactions: {}, comments: {} });

  // Interaction detail modal state
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState(null);

  // Collapsible meal sections
  const [collapsedMeals, setCollapsedMeals] = useState(() => {
    // Load from localStorage
    const cached = localStorage.getItem('diary_collapsed_meals');
    return cached ? JSON.parse(cached) : {};
  });

  // Pull-to-refresh: Refresh diary data
  const refreshDiaryData = useCallback(async () => {
    if (!clientData?.id) return;

    // Ensure fresh session before fetching
    await ensureFreshSession();

    const dateStr = formatDateKey(currentDate);

    try {
      const [diaryData, waterData] = await Promise.all([
        apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateStr}`),
        apiGet(`/.netlify/functions/water-intake?clientId=${clientData.id}&date=${dateStr}`).catch(() => null)
      ]);

      const newEntries = diaryData.entries || [];
      const newGoals = diaryData.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75 };
      const newWater = waterData?.glasses || 0;

      // Fetch interactions (reactions & comments) for these entries
      if (newEntries.length > 0) {
        try {
          const interactionsData = await apiGet(
            `/.netlify/functions/get-diary-interactions?clientId=${clientData.id}&date=${dateStr}`
          );
          setInteractions({
            reactions: interactionsData.reactions || {},
            comments: interactionsData.comments || {}
          });
        } catch (err) {
          console.log('No interactions found or error fetching:', err.message);
          setInteractions({ reactions: {}, comments: {} });
        }
      } else {
        setInteractions({ reactions: {}, comments: {} });
      }

      // Calculate totals
      const calculatedTotals = newEntries.reduce((acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0),
        fiber: acc.fiber + (entry.fiber || 0),
        sugar: acc.sugar + (entry.sugar || 0),
        sodium: acc.sodium + (entry.sodium || 0),
        potassium: acc.potassium + (entry.potassium || 0),
        calcium: acc.calcium + (entry.calcium || 0),
        iron: acc.iron + (entry.iron || 0),
        vitaminC: acc.vitaminC + (entry.vitamin_c || entry.vitaminC || 0),
        cholesterol: acc.cholesterol + (entry.cholesterol || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0, cholesterol: 0 });

      setEntries(newEntries);
      setGoals(newGoals);
      setWaterIntake(newWater);
      setTotals(calculatedTotals);

      // Update cache
      const cacheKey = `diary_${clientData.id}_${dateStr}`;
      setCache(cacheKey, {
        entries: newEntries,
        totals: calculatedTotals,
        goals: newGoals,
        water: newWater
      });
    } catch (err) {
      console.error('Error refreshing diary:', err);
    }
  }, [clientData?.id, currentDate]);

  // Setup pull-to-refresh
  const { isRefreshing, pullDistance, containerProps, threshold } = usePullToRefresh(refreshDiaryData);

  // Cleanup microphone on component unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        const rec = recognitionRef.current;
        recognitionRef.current = null;

        // Clear all handlers
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;

        try {
          rec.stop();
        } catch (e) {
          console.log('Cleanup: Error calling stop:', e);
        }

        try {
          rec.abort();
        } catch (e) {
          console.log('Cleanup: Error calling abort:', e);
        }
      }
    };
  }, []);

  // Cleanup microphone when AI modal closes
  useEffect(() => {
    if (!aiExpanded && recognitionRef.current) {
      setIsRecording(false);
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      // Stop first, then clear handlers - order matters!
      try {
        rec.stop();
      } catch (e) {
        console.log('Modal close cleanup: Error stopping recognition:', e);
      }

      // Clear handlers and force abort after stop completes
      setTimeout(() => {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch (e) {
          // Ignore - already stopped
        }
      }, 150);
    }
  }, [aiExpanded]);

  // Toggle meal collapse
  const toggleMealCollapse = (mealType) => {
    setCollapsedMeals(prev => {
      const updated = { ...prev, [mealType]: !prev[mealType] };
      localStorage.setItem('diary_collapsed_meals', JSON.stringify(updated));
      return updated;
    });
  };

  // Toggle entry selection
  const toggleEntrySelection = (entryId) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  // Select all entries
  const selectAllEntries = () => {
    setSelectedEntries(new Set(entries.map(e => e.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedEntries(new Set());
    setSelectionMode(false);
  };

  // Delete selected entries
  const deleteSelectedEntries = async () => {
    if (selectedEntries.size === 0) return;

    const count = selectedEntries.size;
    if (!window.confirm(`Delete ${count} selected item${count > 1 ? 's' : ''}?`)) return;

    // Delete all selected entries in parallel
    const entriesToDelete = Array.from(selectedEntries);
    console.log('Deleting entries:', entriesToDelete);

    const deletePromises = entriesToDelete.map(entryId =>
      apiDelete(`/.netlify/functions/food-diary?entryId=${entryId}`)
        .then(() => ({ entryId, success: true }))
        .catch(err => {
          console.error(`Failed to delete entry ${entryId}:`, err);
          return { entryId, success: false, error: err };
        })
    );

    const results = await Promise.all(deletePromises);
    console.log('Delete results:', results);

    // Separate successful and failed deletions
    const successfulIds = new Set(results.filter(r => r.success).map(r => r.entryId));
    const failedCount = results.filter(r => !r.success).length;

    if (successfulIds.size > 0) {
      // Calculate totals to subtract for successfully deleted entries
      const deletedEntries = entries.filter(e => successfulIds.has(e.id));
      const subtractTotals = deletedEntries.reduce((acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
        carbs: acc.carbs + (e.carbs || 0),
        fat: acc.fat + (e.fat || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

      // Update state - only remove successfully deleted entries
      const updatedEntries = entries.filter(e => !successfulIds.has(e.id));
      const updatedTotals = {
        calories: totals.calories - subtractTotals.calories,
        protein: totals.protein - subtractTotals.protein,
        carbs: totals.carbs - subtractTotals.carbs,
        fat: totals.fat - subtractTotals.fat
      };

      setEntries(updatedEntries);
      setTotals(updatedTotals);

      // Update cache
      const dateStr = formatDate(currentDate);
      const cacheKey = `diary_${clientData.id}_${dateStr}`;
      const cached = getCache(cacheKey) || {};
      setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });
    }

    // Exit selection mode
    clearSelection();

    // Show error if some failed
    if (failedCount > 0) {
      alert(`Failed to delete ${failedCount} item${failedCount > 1 ? 's' : ''}. ${successfulIds.size > 0 ? `${successfulIds.size} item${successfulIds.size > 1 ? 's were' : ' was'} deleted successfully.` : ''}`);
    }
  };

  // Fetch weekly data when modal opens
  const fetchWeeklyData = async () => {
    if (!clientData?.id) return;
    setWeeklyLoading(true);

    try {
      const days = [];
      const today = new Date();

      // Fetch past 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);

        try {
          const data = await apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateStr}`);
          const dayEntries = data.entries || [];
          const dayTotals = dayEntries.reduce((acc, e) => ({
            calories: acc.calories + (e.calories || 0),
            protein: acc.protein + (e.protein || 0),
            carbs: acc.carbs + (e.carbs || 0),
            fat: acc.fat + (e.fat || 0)
          }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

          days.push({
            date: dateStr,
            dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
            ...dayTotals,
            logged: dayEntries.length > 0
          });
        } catch {
          days.push({
            date: dateStr,
            dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
            calories: 0, protein: 0, carbs: 0, fat: 0,
            logged: false
          });
        }
      }

      // Calculate weekly totals and averages
      const daysLogged = days.filter(d => d.logged).length;
      const weekTotals = days.reduce((acc, d) => ({
        calories: acc.calories + d.calories,
        protein: acc.protein + d.protein,
        carbs: acc.carbs + d.carbs,
        fat: acc.fat + d.fat
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

      const avgCalories = daysLogged > 0 ? Math.round(weekTotals.calories / daysLogged) : 0;
      const avgProtein = daysLogged > 0 ? Math.round(weekTotals.protein / daysLogged) : 0;

      setWeeklyData({
        days,
        totals: weekTotals,
        averages: { calories: avgCalories, protein: avgProtein },
        daysLogged
      });
    } catch (err) {
      console.error('Error fetching weekly data:', err);
    } finally {
      setWeeklyLoading(false);
    }
  };

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

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load diary entries and water intake - with caching
  useEffect(() => {
    if (!clientData?.id) return;

    const dateStr = formatDate(currentDate);
    const cacheKey = `diary_${clientData.id}_${dateStr}`;

    // Load from cache first for instant display
    const cached = getCache(cacheKey);
    if (cached) {
      setEntries(cached.entries || []);
      setTotals(cached.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0, cholesterol: 0 });
      setGoals(cached.goals || { calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75, fiber_goal: 28, sugar_goal: 50, sodium_goal: 2300, potassium_goal: 3500, calcium_goal: 1000, iron_goal: 18, vitaminC_goal: 90, cholesterol_goal: 300 });
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

      // Calculate totals (including micronutrients)
      const calculatedTotals = newEntries.reduce((acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0),
        fiber: acc.fiber + (entry.fiber || 0),
        sugar: acc.sugar + (entry.sugar || 0),
        sodium: acc.sodium + (entry.sodium || 0),
        potassium: acc.potassium + (entry.potassium || 0),
        calcium: acc.calcium + (entry.calcium || 0),
        iron: acc.iron + (entry.iron || 0),
        vitaminC: acc.vitaminC + (entry.vitamin_c || entry.vitaminC || 0),
        cholesterol: acc.cholesterol + (entry.cholesterol || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminC: 0, cholesterol: 0 });

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

  // Handle water intake actions - debounced to allow rapid tapping
  const handleWaterAction = (action, amount = 1) => {
    if (!clientData?.id) return;

    // Calculate new value based on current pending value or current state
    const currentValue = waterPendingRef.current !== null ? waterPendingRef.current : waterIntake;
    let newGlasses = currentValue;

    if (action === 'add') {
      newGlasses = Math.min(waterGoal, currentValue + amount);
    } else if (action === 'remove') {
      newGlasses = Math.max(0, currentValue - amount);
    } else if (action === 'complete') {
      newGlasses = waterGoal;
    }

    // Update UI immediately
    setWaterIntake(newGlasses);
    waterPendingRef.current = newGlasses;

    // Update cache immediately
    const dateStr = formatDate(currentDate);
    const cacheKey = `diary_${clientData.id}_${dateStr}`;
    const cached = getCache(cacheKey) || {};
    setCache(cacheKey, { ...cached, water: newGlasses });

    // Cancel previous debounce timer
    if (waterDebounceRef.current) {
      clearTimeout(waterDebounceRef.current);
    }

    // Set new debounce timer - save after 800ms of no tapping
    waterDebounceRef.current = setTimeout(async () => {
      const valueToSave = waterPendingRef.current;
      waterPendingRef.current = null;

      // Don't save if value is null or clientId is missing
      if (valueToSave === null || valueToSave === undefined || !clientData?.id) {
        return;
      }

      try {
        await apiPost('/.netlify/functions/water-intake', {
          clientId: clientData.id,
          date: dateStr,
          glasses: valueToSave
        });
      } catch (err) {
        console.error('Error saving water intake:', err);
      }
    }, 800);
  };

  // Handle AI food logging
  const handleAiLog = async () => {
    if (!aiInput.trim()) return;

    // Check if auth is still loading
    if (authLoading || !clientData) {
      console.log('AI Log: Auth still loading...');
      alert('Loading your profile... Please try again in a moment.');
      return;
    }

    // Check if there was an error fetching client data
    if (!clientData.id) {
      console.error('AI Log: clientData.id is null (fetch may have failed)', { clientData });
      alert('Your profile is still loading. Please wait a moment and try again.');
      return;
    }

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
    // Confirmation is handled by SwipeableEntry component
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

  // Handle opening edit modal for a food entry
  const handleEditEntry = (entry) => {
    setEditingEntry({
      ...entry,
      numberOfServings: entry.number_of_servings || 1
    });
    setShowEditEntryModal(true);
  };

  // Handle updating a food entry
  const handleUpdateEntry = async (updatedEntry) => {
    try {
      const result = await apiPut('/.netlify/functions/food-diary', {
        entryId: updatedEntry.id,
        numberOfServings: updatedEntry.numberOfServings,
        calories: updatedEntry.calories,
        protein: updatedEntry.protein,
        carbs: updatedEntry.carbs,
        fat: updatedEntry.fat,
        fiber: updatedEntry.fiber,
        sugar: updatedEntry.sugar,
        sodium: updatedEntry.sodium
      });

      if (result.entry) {
        // Find the old entry to calculate totals difference
        const oldEntry = entries.find(e => e.id === updatedEntry.id);
        const updatedEntries = entries.map(e =>
          e.id === updatedEntry.id ? result.entry : e
        );

        // Update totals
        let updatedTotals = totals;
        if (oldEntry) {
          updatedTotals = {
            calories: totals.calories - (oldEntry.calories || 0) + (result.entry.calories || 0),
            protein: totals.protein - (oldEntry.protein || 0) + (result.entry.protein || 0),
            carbs: totals.carbs - (oldEntry.carbs || 0) + (result.entry.carbs || 0),
            fat: totals.fat - (oldEntry.fat || 0) + (result.entry.fat || 0)
          };
          setTotals(updatedTotals);
        }

        setEntries(updatedEntries);

        // Update cache
        const dateStr = formatDate(currentDate);
        const cacheKey = `diary_${clientData.id}_${dateStr}`;
        const cached = getCache(cacheKey) || {};
        setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });
      }

      setShowEditEntryModal(false);
      setEditingEntry(null);
    } catch (err) {
      console.error('Error updating entry:', err);
      alert('Failed to update entry');
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
      const data = await apiGet(`/.netlify/functions/food-search?query=${encodeURIComponent(query)}&clientId=${clientData?.id}`);
      setSearchResults(data.results || []);
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

  // Parse food suggestions from AI response [[FOOD: name | cal | prot | carbs | fat]]
  const parseFoodSuggestions = (text) => {
    const suggestions = [];
    const regex = /\[\[FOOD:\s*([^|\]]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\]\]/gi;
    let match;
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while ((match = regex.exec(normalizedText)) !== null) {
      suggestions.push({
        name: match[1].trim(),
        calories: parseInt(match[2]) || 0,
        protein: parseInt(match[3]) || 0,
        carbs: parseInt(match[4]) || 0,
        fat: parseInt(match[5]) || 0
      });
    }

    const cleanText = normalizedText
      .replace(/\[\[FOOD:[^\]]+\]\]/gi, '')
      .replace(/\n\s*\n+/g, '\n')
      .trim();

    return { cleanText, suggestions };
  };

  // Open AI chat and ask a question
  const askAI = async (question, context = null) => {
    // Track context for "More ideas" button
    if (context) {
      setSuggestionContext(context);
    } else if (question.toLowerCase().includes('protein')) {
      setSuggestionContext('protein');
    } else if (question.toLowerCase().includes('dinner')) {
      setSuggestionContext('dinner');
    } else if (question.toLowerCase().includes('snack')) {
      setSuggestionContext('snack');
    } else if (question.toLowerCase().includes('lunch')) {
      setSuggestionContext('lunch');
    } else if (question.toLowerCase().includes('breakfast')) {
      setSuggestionContext('breakfast');
    }

    setAiInput(question);
    setTimeout(() => {
      handleAiChat(question);
    }, 100);
  };

  // Voice input functions for AI assistant
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser. Please try Chrome or Safari.');
      return;
    }

    if (isRecording) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('Previous recognition cleanup:', e);
      }
      recognitionRef.current = null;
    }

    // Store current input before voice starts
    preVoiceInputRef.current = aiInput;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const baseText = preVoiceInputRef.current;

      // Update input with transcript
      if (finalTranscript) {
        // Final result - append to original text (before voice started)
        setAiInput(baseText ? `${baseText} ${finalTranscript}` : finalTranscript);

        // Auto-stop recording once we have a final result
        stopVoiceInput();
      } else if (interimTranscript) {
        // Show interim as preview (will be replaced by final)
        setAiInput(baseText ? `${baseText} ${interimTranscript}` : interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Voice recognition error:', event.error);

      // User-friendly error messages for each error type
      const errorMessages = {
        'no-speech': 'No speech detected. Please try again and speak clearly.',
        'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings.',
        'audio-capture': 'Could not access your microphone. Please check that:\n• No other app is using the microphone\n• Your microphone is properly connected\n• You have granted microphone permissions',
        'network': 'Network error. Voice recognition requires an internet connection.',
        'service-not-allowed': 'Voice recognition is not available. Please try again later.',
        'bad-grammar': 'Could not understand the speech. Please try again.',
        'language-not-supported': 'Language not supported. Please try speaking in English.'
      };

      if (event.error !== 'aborted') {
        const message = errorMessages[event.error] || `Voice input error: ${event.error}. Please try again.`;
        alert(message);
      }
      resetVoiceUI();
    };

    recognition.onend = () => {
      resetVoiceUI();
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      alert('Could not start microphone. Please try again.');
      resetVoiceUI();
    }
  };

  const stopVoiceInput = () => {
    // Update UI immediately
    setIsRecording(false);

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      // IMPORTANT: Stop FIRST, then clear handlers after a delay
      // Clearing handlers before stop() can cause the mic to stay active
      try {
        rec.stop();
      } catch (e) {
        console.log('Error calling stop():', e);
      }

      // Clear handlers and force abort after allowing stop() to complete
      setTimeout(() => {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch (e) {
          // Ignore - recognition already stopped
        }
      }, 150);
    }
  };

  const resetVoiceUI = () => {
    setIsRecording(false);

    // Stop recognition if it's still running
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      // Stop first, then clear handlers - order matters!
      try {
        rec.stop();
      } catch (e) {
        console.log('ResetVoiceUI: Error stopping recognition:', e);
      }

      // Clear handlers and force abort after stop completes
      setTimeout(() => {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch (e) {
          // Ignore - already stopped
        }
      }, 150);
    }
  };

  // Handle AI chat message
  const handleAiChat = async (message = aiInput) => {
    if (!message.trim()) return;

    // Check if auth is still loading
    if (authLoading || !clientData) {
      console.log('AI Chat: Auth still loading, please wait...');
      alert('Loading your profile... Please try again in a moment.');
      return;
    }

    // Check if there was an error fetching client data
    if (!clientData.id) {
      console.error('AI Chat: clientData.id is null (fetch may have failed)', { clientData });
      // Don't show error - just let it fail gracefully or retry
      // This can happen on slow connections
      alert('Your profile is still loading. Please wait a moment and try again.');
      return;
    }

    setAiLogging(true);
    setSelectedSuggestion(null);

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

      // Parse food suggestions from response
      const { cleanText, suggestions } = parseFoodSuggestions(data.response);

      if (suggestions.length > 0) {
        // Add message with parsed suggestions
        setAiMessages(prev => [...prev, {
          role: 'assistant',
          content: cleanText,
          suggestions: suggestions
        }]);
      } else if (data.parsed && data.parsed.action === 'log_food') {
        // Direct food log request
        setPendingFoodLog(data.parsed);
        setSelectedAIMealType(getDefaultMealType());
        setAiMessages(prev => [...prev, {
          role: 'assistant',
          content: data.parsed.confirmation || `Ready to log ${data.parsed.food_name}:`,
          pendingFood: data.parsed
        }]);
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

  // Get default meal type based on time
  const getDefaultMealType = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 21) return 'dinner';
    return 'snack';
  };

  // Handle food suggestion click - show action menu
  const handleFoodSuggestionClick = (food) => {
    setSelectedSuggestion(food);
  };

  // Log food suggestion
  const logFoodSuggestion = (food) => {
    setSelectedSuggestion(null);
    setPendingFoodLog({
      food_name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      confirmation: `Ready to log ${food.name}:`
    });
    setSelectedAIMealType(getDefaultMealType());
  };

  // Get recipe details
  const getFoodDetails = (food) => {
    setSelectedSuggestion(null);
    setAiInput(`What's in the ${food.name}? Give me the recipe or ingredients.`);
    setTimeout(() => handleAiChat(`What's in the ${food.name}? Give me the recipe or ingredients.`), 100);
  };

  // Revise food suggestion
  const reviseFoodSuggestion = (food) => {
    setSelectedSuggestion(null);
    setAiInput(`I want to adjust the ${food.name}. Can you help me revise the portion size or ingredients?`);
    if (aiInputRef.current) aiInputRef.current.focus();
  };

  // Request more ideas
  const requestMoreIdeas = () => {
    let query = 'Give me different food options';
    switch (suggestionContext) {
      case 'protein': query = 'Give me more high-protein food options'; break;
      case 'dinner': query = 'Give me more dinner ideas'; break;
      case 'snack': query = 'Give me more snack ideas'; break;
      case 'lunch': query = 'Give me more lunch ideas'; break;
      case 'breakfast': query = 'Give me more breakfast ideas'; break;
      default: query = 'Give me different food options';
    }
    setAiInput(query);
    setTimeout(() => handleAiChat(query), 100);
  };

  // Confirm food log from AI
  const confirmAIFoodLog = async () => {
    if (!pendingFoodLog || !clientData?.id) return;

    const food = pendingFoodLog;
    const mealType = selectedAIMealType || getDefaultMealType();
    const dateStr = formatDate(currentDate);

    try {
      const result = await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: dateStr,
        mealType: mealType,
        foodName: food.food_name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: 1,
        foodSource: 'ai'
      });

      // Update local state
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

      // Clear pending and show success
      setPendingFoodLog(null);
      setSelectedAIMealType(null);
      setAiMessages(prev => [...prev, { role: 'assistant', content: `Added "${food.food_name}" to your ${mealType}!` }]);
    } catch (err) {
      console.error('Error adding food:', err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t add that food. Please try manually.' }]);
    }
  };

  // Cancel food log
  const cancelAIFoodLog = () => {
    setPendingFoodLog(null);
    setSelectedAIMealType(null);
    setAiMessages(prev => [...prev, { role: 'assistant', content: 'No problem! Let me know if you want to log something else.' }]);
  };

  // Save meal as favorite
  const handleSaveMeal = async (mealName) => {
    if (!mealName.trim() || !clientData?.id) return;

    const mealEntries = groupedEntries[saveMealType];
    if (!mealEntries || mealEntries.length === 0) {
      alert('No foods in this meal to save');
      return;
    }

    // Calculate total macros for the meal
    const mealTotals = mealEntries.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    try {
      await apiPost('/.netlify/functions/toggle-favorite', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        mealName: mealName,
        mealType: saveMealType,
        calories: Math.round(mealTotals.calories),
        protein: Math.round(mealTotals.protein),
        carbs: Math.round(mealTotals.carbs),
        fat: Math.round(mealTotals.fat),
        notes: mealEntries.map(e => e.food_name).join(', ')
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
  // Micronutrient progress (use goals or daily values, handle undefined)
  const fiberProgress = Math.min(100, Math.round(((totals.fiber || 0) / (goals.fiber_goal || 28)) * 100));
  const sugarProgress = Math.min(100, Math.round(((totals.sugar || 0) / (goals.sugar_goal || 50)) * 100));
  const sodiumProgress = Math.min(100, Math.round(((totals.sodium || 0) / (goals.sodium_goal || 2300)) * 100));
  const potassiumProgress = Math.min(100, Math.round(((totals.potassium || 0) / (goals.potassium_goal || 3500)) * 100));
  const calciumProgress = Math.min(100, Math.round(((totals.calcium || 0) / (goals.calcium_goal || 1000)) * 100));
  const ironProgress = Math.min(100, Math.round(((totals.iron || 0) / (goals.iron_goal || 18)) * 100));
  const vitaminCProgress = Math.min(100, Math.round(((totals.vitaminC || 0) / (goals.vitaminC_goal || 90)) * 100));
  const cholesterolProgress = Math.min(100, Math.round(((totals.cholesterol || 0) / (goals.cholesterol_goal || 300)) * 100));

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

  // Swipeable entry component with long-press for selection
  const SwipeableEntry = ({ entry, onDelete, onEdit, isSelected, onToggleSelect, inSelectionMode, onLongPress, reactions, comments }) => {
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const [swiped, setSwiped] = useState(false);
    const longPressTimer = useRef(null);
    const minSwipeDistance = 50;
    const longPressDuration = 500; // ms

    const onTouchStart = (e) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);

      // Start long-press timer
      longPressTimer.current = setTimeout(() => {
        onLongPress();
        // Vibrate if supported
        if (navigator.vibrate) navigator.vibrate(50);
      }, longPressDuration);
    };

    const onTouchMove = (e) => {
      // Cancel long-press if finger moves
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (inSelectionMode) return;
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
      // Clear long-press timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      if (inSelectionMode) return;
      if (!touchStart || !touchEnd) return;
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;

      if (isLeftSwipe) {
        setSwiped(true);
      } else if (isRightSwipe) {
        setSwiped(false);
      }
    };

    const handleDelete = () => {
      if (window.confirm(`Delete "${entry.food_name}"?`)) {
        onDelete();
      }
    };

    const handleClick = () => {
      if (inSelectionMode) {
        onToggleSelect();
      } else if (!swiped) {
        onEdit(entry);
      }
    };

    return (
      <div
        className={`meal-entry-swipeable ${swiped ? 'swiped' : ''} ${isSelected ? 'selected' : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
      >
        <div className="meal-entry-content">
          {inSelectionMode && (
            <div className={`meal-entry-checkbox ${isSelected ? 'checked' : ''}`}>
              {isSelected && <Check size={14} />}
            </div>
          )}
          <div className="meal-entry-info">
            <span className="meal-entry-name">{entry.food_name}</span>
            <span className="meal-entry-serving">
              {entry.number_of_servings || 1} serving
              {/* Show coach interaction indicators */}
              {(reactions?.length > 0 || comments?.length > 0) && (
                <button
                  className="meal-entry-interactions"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedInteraction({
                      foodName: entry.food_name,
                      reactions: reactions || [],
                      comments: comments || []
                    });
                    setShowInteractionModal(true);
                  }}
                >
                  {reactions?.map((r, i) => (
                    <span key={i} className="meal-entry-reaction">
                      {r.reaction}
                    </span>
                  ))}
                  {comments?.length > 0 && (
                    <span className="meal-entry-comment-count">
                      💬{comments.length}
                    </span>
                  )}
                </button>
              )}
            </span>
          </div>
          <span className="meal-entry-cals">{entry.calories || 0}</span>
        </div>
        {!inSelectionMode && (
          <button className="meal-entry-delete-btn" onClick={handleDelete}>
            <Trash2 size={20} />
            <span>Delete</span>
          </button>
        )}
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

  // Meal section component - collapsible
  const MealSection = ({ title, entries, mealType }) => {
    const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
    const isCollapsed = collapsedMeals[mealType];

    const openAddFood = () => {
      setSelectedMealType(mealType);
      setShowAILogModal(true);
    };

    const openSaveMeal = () => {
      if (entries.length === 0) {
        alert('Add some foods first to save as a meal');
        return;
      }
      setSaveMealType(mealType);
      setShowSaveMealModal(true);
    };

    const handleLongPress = () => {
      setSelectionMode(true);
    };

    return (
      <div className={`meal-section ${isCollapsed ? 'collapsed' : ''}`}>
        <div
          className="meal-section-header"
          onClick={() => toggleMealCollapse(mealType)}
          role="button"
          aria-expanded={!isCollapsed}
        >
          <div className="meal-section-title">
            {getMealIcon(mealType)}
            <span>{title}</span>
            {isCollapsed && entries.length > 0 && (
              <span className="meal-item-count">• {entries.length} item{entries.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="meal-section-right">
            <span className="meal-section-cals">{mealCals} cal</span>
            <ChevronDown size={18} className={`meal-collapse-icon ${isCollapsed ? 'collapsed' : ''}`} />
          </div>
        </div>

        {!isCollapsed && (
          <>
            {entries.length > 0 && (
              <div className="meal-entries">
                {entries.map(entry => (
                  <SwipeableEntry
                    key={entry.id}
                    entry={entry}
                    onDelete={() => handleDeleteEntry(entry.id, entry.food_name)}
                    onEdit={handleEditEntry}
                    isSelected={selectedEntries.has(entry.id)}
                    onToggleSelect={() => toggleEntrySelection(entry.id)}
                    inSelectionMode={selectionMode}
                    onLongPress={handleLongPress}
                    reactions={interactions.reactions[entry.id] || []}
                    comments={interactions.comments[entry.id] || []}
                  />
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
          </>
        )}
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
    <div className="diary-page" {...containerProps}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={threshold}
      />

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
        <button className="diary-action-btn" onClick={() => setShowDailyReportModal(true)}>
          <FileText size={16} />
          Daily
        </button>
        <button className="diary-action-btn" onClick={() => { fetchWeeklyData(); setShowWeeklySummaryModal(true); }}>
          <BarChart3 size={16} />
          Weekly
        </button>
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

        {/* Macro Progress Bars - Horizontal Scroll */}
        <div className="macro-progress-scroll">
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
            {/* Micronutrients - scroll right to see */}
            <div className="macro-bar-item">
              <span className="macro-bar-label fiber">Fiber:</span>
              <span className="macro-bar-value">{Math.round(totals.fiber || 0)}/{goals.fiber_goal || 28}g</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill fiber" style={{ width: `${fiberProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label sugar">Sugar:</span>
              <span className="macro-bar-value">{Math.round(totals.sugar || 0)}/{goals.sugar_goal || 50}g</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill sugar" style={{ width: `${sugarProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label sodium">Na:</span>
              <span className="macro-bar-value">{Math.round(totals.sodium || 0)}/{goals.sodium_goal || 2300}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill sodium" style={{ width: `${sodiumProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label potassium">K:</span>
              <span className="macro-bar-value">{Math.round(totals.potassium || 0)}/{goals.potassium_goal || 3500}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill potassium" style={{ width: `${potassiumProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label calcium">Ca:</span>
              <span className="macro-bar-value">{Math.round(totals.calcium || 0)}/{goals.calcium_goal || 1000}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill calcium" style={{ width: `${calciumProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label iron">Fe:</span>
              <span className="macro-bar-value">{(totals.iron || 0).toFixed(1)}/{goals.iron_goal || 18}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill iron" style={{ width: `${ironProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label vitaminC">Vit C:</span>
              <span className="macro-bar-value">{Math.round(totals.vitaminC || 0)}/{goals.vitaminC_goal || 90}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill vitaminC" style={{ width: `${vitaminCProgress}%` }} />
              </div>
            </div>
            <div className="macro-bar-item">
              <span className="macro-bar-label cholesterol">Chol:</span>
              <span className="macro-bar-value">{Math.round(totals.cholesterol || 0)}/{goals.cholesterol_goal || 300}mg</span>
              <div className="macro-bar-track">
                <div className="macro-bar-fill cholesterol" style={{ width: `${cholesterolProgress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Mode Bar - only shows when in selection mode (activated by long-press) */}
      {selectionMode && (
        <div className="selection-mode-bar active">
          <button className="selection-btn cancel" onClick={clearSelection}>
            <X size={16} />
            Cancel
          </button>
          <span className="selection-count">{selectedEntries.size} selected</span>
          <div className="selection-actions">
            <button className="selection-btn select-all" onClick={selectAllEntries}>
              Select All
            </button>
            {selectedEntries.size > 0 && (
              <button className="selection-btn delete" onClick={deleteSelectedEntries}>
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Water Intake - Compact */}
      <div className="water-intake-compact">
        <div className="water-intake-left">
          <Droplets size={18} className="water-icon" />
          <span className="water-label">Water</span>
          <span className="water-progress">{waterIntake}/{waterGoal}</span>
        </div>
        <div className="water-intake-controls">
          <button
            className="water-btn-compact"
            onClick={() => handleWaterAction('remove', 1)}
            disabled={waterIntake <= 0}
            aria-label="Remove one glass"
          >
            −
          </button>
          <div className="water-progress-bar">
            <div
              className="water-progress-fill"
              style={{ width: `${Math.min((waterIntake / waterGoal) * 100, 100)}%` }}
            />
          </div>
          <button
            className="water-btn-compact"
            onClick={() => handleWaterAction('add', 1)}
            disabled={waterIntake >= waterGoal}
            aria-label="Add one glass"
          >
            +
          </button>
        </div>
      </div>

      {/* AI Nutrition Assistant - Teaser Card (Collapsed) */}
      {!aiExpanded && (
        <div className="ai-teaser-card">
          <div className="ai-teaser-header">
            <div className="ai-teaser-title">
              <Bot size={20} className="ai-icon" />
              <span>AI Nutrition Assistant</span>
            </div>
            <button
              className="ai-teaser-open-btn"
              onClick={() => setAiExpanded(true)}
            >
              <Maximize2 size={16} />
              <span>Open</span>
            </button>
          </div>

          <p className="ai-teaser-subtitle">Get personalized nutrition advice</p>

          {/* Preview Pills - just show 2-3 */}
          <div className="ai-teaser-pills">
            {goals.protein_goal - totals.protein > 30 && (
              <button
                className="ai-teaser-pill protein"
                onClick={() => { setAiExpanded(true); askAI('What high protein foods should I eat?'); }}
              >
                <Dumbbell size={16} />
                <span>Need protein</span>
              </button>
            )}
            <button
              className="ai-teaser-pill"
              onClick={() => { setAiExpanded(true); askAI('Give me a healthy snack idea'); }}
            >
              <Apple size={16} />
              <span>Snack ideas</span>
            </button>
            <button
              className="ai-teaser-pill"
              onClick={() => { setAiExpanded(true); askAI('How am I doing today?'); }}
            >
              <BarChart3 size={16} />
              <span>My progress</span>
            </button>
          </div>
        </div>
      )}

      {/* AI Nutrition Assistant - Full Modal (Expanded) */}
      {aiExpanded && (
        <>
          <div className="ai-modal-overlay" onClick={() => setAiExpanded(false)} />
          <div className="ai-modal">
            {/* Modal Header */}
            <div className="ai-modal-header">
              <div className="ai-modal-title">
                <Bot size={20} className="ai-icon" />
                <span>AI Nutrition Assistant</span>
              </div>
              <button
                className="ai-modal-close"
                onClick={() => setAiExpanded(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="ai-modal-content">
              {/* Welcome Screen - when no messages */}
              {aiMessages.length === 0 && !aiLogging && (
                <div className="ai-modal-welcome">
                  <p className="ai-modal-greeting">Hi {clientData?.name?.split(' ')[0] || 'there'},</p>
                  <h2 className="ai-modal-headline">How can I help with nutrition today?</h2>

                  {/* Dynamic suggestions based on current macros */}
                  <div className="ai-modal-suggestions">
                    {goals.protein_goal - totals.protein > 30 && (
                      <button
                        className="ai-modal-pill protein"
                        onClick={() => askAI('What high protein foods should I eat?')}
                      >
                        <Dumbbell size={18} />
                        <span>Need {Math.round(goals.protein_goal - totals.protein)}g more protein</span>
                      </button>
                    )}
                    {goals.calorie_goal - totals.calories > 500 && (
                      <button
                        className="ai-modal-pill calories"
                        onClick={() => askAI(`What should I eat with ${goals.calorie_goal - totals.calories} calories left?`)}
                      >
                        <BarChart3 size={18} />
                        <span>{goals.calorie_goal - totals.calories} cal remaining</span>
                      </button>
                    )}
                    {/* Show "hungry but low on calories" when they have less than 300 cal left but aren't over yet */}
                    {goals.calorie_goal - totals.calories > 0 && goals.calorie_goal - totals.calories <= 300 && (
                      <button
                        className="ai-modal-pill hungry"
                        onClick={() => askAI('I\'m hungry but almost at my calorie limit. What filling, low-calorie foods can I eat?')}
                      >
                        <Salad size={18} />
                        <span>Hungry but only {Math.round(goals.calorie_goal - totals.calories)} cal left</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Actions - 2 column grid */}
                  <div className="ai-modal-quick-actions grid">
                    <button className="ai-modal-pill" onClick={() => askAI('I have some ingredients - help me make a meal')}>
                      <ChefHat size={18} />
                      <span>What can I make?</span>
                    </button>
                    <button className="ai-modal-pill" onClick={() => askAI('Give me a quick meal I can make in under 5 minutes')}>
                      <Zap size={18} />
                      <span>Quick & easy</span>
                    </button>
                    <button className="ai-modal-pill" onClick={() => askAI('I\'m eating out - what should I order that fits my macros?')}>
                      <MapPin size={18} />
                      <span>Eating out</span>
                    </button>
                    <button className="ai-modal-pill" onClick={() => askAI('Give me a healthy snack idea')}>
                      <Apple size={18} />
                      <span>Snack ideas</span>
                    </button>
                    <button className="ai-modal-pill" onClick={() => askAI('How am I doing today?')}>
                      <BarChart3 size={18} />
                      <span>My progress</span>
                    </button>
                    <button className="ai-modal-pill" onClick={() => askAI('What can I eat for dinner?')}>
                      <UtensilsCrossed size={18} />
                      <span>Dinner ideas</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              {aiMessages.length > 0 && (
                <div className="ai-modal-messages">
                  {aiMessages.map((msg, idx) => (
                    <div key={idx} className={`ai-modal-message ${msg.role}`}>
                      <div className="ai-message-text">{msg.content}</div>

                      {/* Food suggestion cards */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="ai-food-suggestions">
                          {msg.suggestions.map((food, foodIdx) => (
                            <button
                              key={foodIdx}
                              className="ai-food-suggestion-btn"
                              onClick={() => handleFoodSuggestionClick(food)}
                            >
                              <div className="suggestion-name">{food.name}</div>
                              <div className="suggestion-macros">
                                {food.calories} cal &bull; {food.protein}g P &bull; {food.carbs}g C &bull; {food.fat}g F
                              </div>
                            </button>
                          ))}
                          <button className="more-ideas-btn" onClick={requestMoreIdeas} disabled={aiLogging}>
                            {aiLogging ? 'Loading...' : 'More ideas'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Selected suggestion action menu */}
                  {selectedSuggestion && (
                    <div className="food-suggestion-actions">
                      <div className="action-header">{selectedSuggestion.name}</div>
                      <div className="action-macros">
                        {selectedSuggestion.calories} cal &bull; {selectedSuggestion.protein}g P &bull; {selectedSuggestion.carbs}g C &bull; {selectedSuggestion.fat}g F
                      </div>
                      <div className="action-buttons">
                        <button className="action-btn log-btn" onClick={() => logFoodSuggestion(selectedSuggestion)}>
                          <Check size={14} /> Log
                        </button>
                        <button className="action-btn details-btn" onClick={() => getFoodDetails(selectedSuggestion)}>
                          <FileText size={14} /> Details
                        </button>
                        <button className="action-btn revise-btn" onClick={() => reviseFoodSuggestion(selectedSuggestion)}>
                          <span>&#9998;</span> Revise
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pending food log confirmation */}
                  {pendingFoodLog && (
                    <div className="ai-modal-message assistant food-log">
                      {pendingFoodLog.confirmation || 'Ready to log this food:'}
                      <div className="ai-food-log-preview">
                        <div className="food-name">{pendingFoodLog.food_name}</div>
                        <div className="food-macros">
                          {pendingFoodLog.calories} cal &bull; {pendingFoodLog.protein}g P &bull; {pendingFoodLog.carbs}g C &bull; {pendingFoodLog.fat}g F
                        </div>
                      </div>
                      <div className="ai-meal-type-selector">
                        <label>Add to:</label>
                        {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
                          <button
                            key={type}
                            className={`ai-meal-type-btn ${selectedAIMealType === type ? 'selected' : ''}`}
                            onClick={() => setSelectedAIMealType(type)}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                      <div className="ai-food-log-actions">
                        <button className="confirm-btn" onClick={confirmAIFoodLog}>
                          <Check size={14} /> Add
                        </button>
                        <button className="cancel-btn" onClick={cancelAIFoodLog}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loading State */}
              {aiLogging && (
                <div className="ai-modal-loading">
                  <div className="ai-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* Fixed Bottom Input Area */}
            <div className="ai-modal-input-area">
              {/* Meal Type Selector */}
              <div className="ai-modal-meal-selector">
                <span className="meal-label">Logging to:</span>
                {['breakfast', 'lunch', 'dinner', 'snack'].map(meal => (
                  <button
                    key={meal}
                    className={`ai-meal-chip ${selectedMealType === meal ? 'active' : ''}`}
                    onClick={() => setSelectedMealType(meal)}
                  >
                    {meal.charAt(0).toUpperCase() + meal.slice(1)}
                  </button>
                ))}
              </div>

              {/* Input Row */}
              <div className="ai-modal-input-row">
                <button
                  className={`voice-btn ${isRecording ? 'recording' : ''}`}
                  onClick={toggleVoiceInput}
                  aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={isRecording}
                >
                  <Mic size={20} />
                </button>
                <input
                  ref={aiInputRef}
                  type="text"
                  className="ai-modal-input"
                  placeholder="Ask me anything or log food..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAiChat()}
                  disabled={aiLogging}
                />
                <button
                  className="ai-modal-send"
                  onClick={() => {
                    // Stop recording when send is pressed
                    if (isRecording) {
                      stopVoiceInput();
                    }
                    handleAiChat();
                  }}
                  disabled={aiLogging || !aiInput.trim()}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </>
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
              {weeklyLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="ai-loading-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <p style={{ marginTop: '12px', color: '#64748b' }}>Loading weekly data...</p>
                </div>
              ) : weeklyData ? (
                <>
                  {/* Weekly Averages */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '12px', padding: '16px', color: 'white', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{weeklyData.averages.calories}</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Avg Calories/Day</div>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '12px', padding: '16px', color: 'white', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{weeklyData.averages.protein}g</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Avg Protein/Day</div>
                    </div>
                  </div>

                  {/* Daily Breakdown */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--gray-700)' }}>Daily Breakdown</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {weeklyData.days.map((day, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: day.logged ? 'var(--gray-50)' : 'transparent', borderRadius: '8px', border: day.logged ? 'none' : '1px dashed var(--gray-300)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--gray-700)', minWidth: '36px' }}>{day.dayName}</span>
                            {day.logged ? (
                              <Check size={14} style={{ color: '#10b981' }} />
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No data</span>
                            )}
                          </div>
                          {day.logged && (
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                              <span style={{ color: 'var(--gray-600)' }}>{day.calories} cal</span>
                              <span style={{ color: '#3b82f6' }}>{Math.round(day.protein)}g P</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Week Totals */}
                  <div style={{ background: 'var(--gray-100)', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ marginBottom: '8px', color: 'var(--gray-700)' }}>Week Totals</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9rem' }}>
                      <div><strong>Total Calories:</strong> {weeklyData.totals.calories.toLocaleString()}</div>
                      <div><strong>Total Protein:</strong> {Math.round(weeklyData.totals.protein)}g</div>
                      <div><strong>Total Carbs:</strong> {Math.round(weeklyData.totals.carbs)}g</div>
                      <div><strong>Total Fat:</strong> {Math.round(weeklyData.totals.fat)}g</div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748b' }}>
                      Days logged: {weeklyData.daysLogged}/7
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ textAlign: 'center', color: '#64748b' }}>
                  Unable to load weekly data.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {showEditEntryModal && editingEntry && (
        <div className="modal-overlay active" onClick={() => { setShowEditEntryModal(false); setEditingEntry(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Edit Food</h3>
              <button className="modal-close" onClick={() => { setShowEditEntryModal(false); setEditingEntry(null); }}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div className="edit-food-name" style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>
                {editingEntry.food_name}
              </div>
              {editingEntry.brand && (
                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '16px' }}>{editingEntry.brand}</div>
              )}

              {/* Servings Adjuster */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>Number of Servings</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => {
                      const newServings = Math.max(0.25, (editingEntry.numberOfServings || 1) - 0.25);
                      const ratio = newServings / (editingEntry.number_of_servings || 1);
                      const original = entries.find(e => e.id === editingEntry.id);
                      setEditingEntry({
                        ...editingEntry,
                        numberOfServings: newServings,
                        calories: Math.round((original?.calories || 0) / (original?.number_of_servings || 1) * newServings),
                        protein: Math.round((original?.protein || 0) / (original?.number_of_servings || 1) * newServings),
                        carbs: Math.round((original?.carbs || 0) / (original?.number_of_servings || 1) * newServings),
                        fat: Math.round((original?.fat || 0) / (original?.number_of_servings || 1) * newServings)
                      });
                    }}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: '2px solid #e2e8f0',
                      background: 'white',
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: '1.3rem', fontWeight: 600, minWidth: '60px', textAlign: 'center' }}>
                    {editingEntry.numberOfServings || 1}
                  </span>
                  <button
                    onClick={() => {
                      const newServings = (editingEntry.numberOfServings || 1) + 0.25;
                      const original = entries.find(e => e.id === editingEntry.id);
                      setEditingEntry({
                        ...editingEntry,
                        numberOfServings: newServings,
                        calories: Math.round((original?.calories || 0) / (original?.number_of_servings || 1) * newServings),
                        protein: Math.round((original?.protein || 0) / (original?.number_of_servings || 1) * newServings),
                        carbs: Math.round((original?.carbs || 0) / (original?.number_of_servings || 1) * newServings),
                        fat: Math.round((original?.fat || 0) / (original?.number_of_servings || 1) * newServings)
                      });
                    }}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: '2px solid #e2e8f0',
                      background: 'white',
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Nutrition Preview */}
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontWeight: 500, marginBottom: '12px', color: '#374151' }}>Nutrition</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#f97316' }}>{editingEntry.calories || 0}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Calories</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#3b82f6' }}>{editingEntry.protein || 0}g</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Protein</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#10b981' }}>{editingEntry.carbs || 0}g</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Carbs</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#f59e0b' }}>{editingEntry.fat || 0}g</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Fat</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { setShowEditEntryModal(false); setEditingEntry(null); }}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateEntry(editingEntry)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Save Changes
                </button>
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
              {/* Meal Type Selector */}
              <div className="modal-meal-selector">
                <label>Add to:</label>
                <div className="meal-type-chips">
                  {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
                    <button
                      key={type}
                      className={`meal-chip ${selectedMealType === type ? 'active' : ''}`}
                      onClick={() => setSelectedMealType(type)}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
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
                <button className="quick-add-btn" onClick={() => { setShowSearchModal(false); setShowPhotoModal(true); }}>
                  <div className="quick-add-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={20} color="white" />
                  </div>
                  <div className="quick-add-text">
                    <div style={{ fontWeight: 600 }}>Snap Photo</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Take a photo of your food</div>
                  </div>
                </button>
                <button className="quick-add-btn" onClick={() => { setShowSearchModal(false); setShowAILogModal(true); }} style={{ marginTop: '10px' }}>
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
                <button className="quick-add-btn" onClick={() => { setShowSearchModal(false); setShowScanLabelModal(true); }} style={{ marginTop: '10px' }}>
                  <div className="quick-add-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={20} color="white" />
                  </div>
                  <div className="quick-add-text">
                    <div style={{ fontWeight: 600 }}>Scan Label</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Scan nutrition facts label</div>
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

      {/* AI Log Modal - Text input for food logging with other options */}
      {showAILogModal && (
        <div className="modal-overlay active" onClick={() => setShowAILogModal(false)}>
          <div className="modal-content ai-log-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowAILogModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Add Food</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              {/* Other Options Row */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '20px',
                overflowX: 'auto',
                paddingBottom: '4px'
              }}>
                <button
                  onClick={() => {
                    setShowAILogModal(false);
                    setShowSearchModal(true);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '12px 16px',
                    background: 'var(--gray-100)',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    minWidth: '70px',
                    transition: 'all 0.2s'
                  }}
                  className="food-option-btn"
                >
                  <Search size={20} style={{ color: 'var(--gray-600)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Search</span>
                </button>
                <button
                  onClick={() => {
                    setShowAILogModal(false);
                    setShowPhotoModal(true);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '12px 16px',
                    background: 'var(--gray-100)',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    minWidth: '70px',
                    transition: 'all 0.2s'
                  }}
                  className="food-option-btn"
                >
                  <Camera size={20} style={{ color: 'var(--gray-600)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Photo</span>
                </button>
                <button
                  onClick={() => {
                    setShowAILogModal(false);
                    setShowFavoritesModal(true);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '12px 16px',
                    background: 'var(--gray-100)',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    minWidth: '70px',
                    transition: 'all 0.2s'
                  }}
                  className="food-option-btn"
                >
                  <Heart size={20} style={{ color: 'var(--gray-600)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Favorites</span>
                </button>
                <button
                  onClick={() => {
                    setShowAILogModal(false);
                    setShowScanLabelModal(true);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '12px 16px',
                    background: 'var(--gray-100)',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    minWidth: '70px',
                    transition: 'all 0.2s'
                  }}
                  className="food-option-btn"
                >
                  <FileText size={20} style={{ color: 'var(--gray-600)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>Scan Label</span>
                </button>
              </div>

              {/* Divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
                color: 'var(--gray-400)'
              }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--gray-200)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>or describe what you ate</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--gray-200)' }} />
              </div>

              {/* Meal Type Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Add to:</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
              </div>

              {/* Food Input */}
              <textarea
                id="aiLogInput"
                placeholder="e.g., 2 eggs with toast and butter, black coffee"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '16px',
                  minHeight: '100px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />

              <button
                className="btn-primary"
                onClick={async () => {
                  const input = document.getElementById('aiLogInput');
                  if (!input.value.trim()) return;

                  setAiInput(input.value);
                  setShowAILogModal(false);

                  // Use handleAiLog for food logging
                  setAiLogging(true);
                  try {
                    const aiData = await apiPost('/.netlify/functions/analyze-food-text', {
                      text: input.value
                    });

                    if (!aiData?.foods || aiData.foods.length === 0) {
                      alert('Could not recognize any foods. Please try again with more details.');
                      return;
                    }

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

                    const cacheKey = `diary_${clientData.id}_${dateStr}`;
                    const cached = getCache(cacheKey) || {};
                    setCache(cacheKey, { ...cached, entries: updatedEntries, totals: updatedTotals });

                    alert(`Added ${aiData.foods.length} food(s) to ${selectedMealType}!`);
                  } catch (err) {
                    console.error('Error logging food:', err);
                    alert('Failed to log food. Please try again.');
                  } finally {
                    setAiLogging(false);
                  }
                }}
                style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#0d9488', color: 'white', border: 'none', fontWeight: 600, fontSize: '1rem' }}
                disabled={aiLogging}
              >
                {aiLogging ? 'Logging...' : 'Log Food'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      <SnapPhotoModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={(nutrition) => {
          // Update totals after logging from photo
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

      {/* Scan Label Modal */}
      <ScanLabelModal
        isOpen={showScanLabelModal}
        onClose={() => setShowScanLabelModal(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={(nutrition) => {
          // Update totals after logging from scan
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

      {/* Search Foods Modal */}
      <SearchFoodsModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={(nutrition) => {
          // Update totals after logging from search
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

      {/* Coach Interaction Detail Modal */}
      {showInteractionModal && selectedInteraction && (
        <div className="modal-overlay" onClick={() => setShowInteractionModal(false)}>
          <div className="interaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="interaction-modal-header">
              <h3>Coach Feedback</h3>
              <button className="modal-close-btn" onClick={() => setShowInteractionModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="interaction-modal-food">
              {selectedInteraction.foodName}
            </div>
            <div className="interaction-modal-content">
              {selectedInteraction.reactions?.length > 0 && (
                <div className="interaction-section">
                  <div className="interaction-section-title">Reactions</div>
                  {selectedInteraction.reactions.map((r, i) => (
                    <div key={i} className="interaction-reaction-item">
                      <div className="interaction-avatar">
                        {r.coachName?.charAt(0)?.toUpperCase() || 'C'}
                      </div>
                      <div className="interaction-details">
                        <span className="interaction-coach-name">{r.coachName || 'Coach'}</span>
                        <span className="interaction-emoji">{r.reaction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedInteraction.comments?.length > 0 && (
                <div className="interaction-section">
                  <div className="interaction-section-title">Comments</div>
                  {selectedInteraction.comments.map((c, i) => (
                    <div key={i} className="interaction-comment-item">
                      <div className="interaction-avatar">
                        {c.authorName?.charAt(0)?.toUpperCase() || 'C'}
                      </div>
                      <div className="interaction-comment-bubble">
                        <span className="interaction-coach-name">{c.authorName || 'Coach'}</span>
                        <p className="interaction-comment-text">{c.comment}</p>
                        <span className="interaction-comment-time">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Diary;
