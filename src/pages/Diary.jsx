import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Camera, Search, Heart, Copy, ArrowLeft, FileText, Sunrise, Sun, Moon, Apple, Droplets, Bot, Maximize2, BarChart3, Check, Trash2, Dumbbell, UtensilsCrossed, Mic, X, ChefHat, Sparkles, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { FavoritesModal, SnapPhotoModal, ScanLabelModal } from '../components/FoodModals';

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
  const [showScanLabelModal, setShowScanLabelModal] = useState(false);
  const [saveMealType, setSaveMealType] = useState('');
  const [copyDateInput, setCopyDateInput] = useState('');
  const [copyMode, setCopyMode] = useState('from');

  // AI Assistant states
  const [aiMessages, setAiMessages] = useState([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const aiInputRef = useRef(null);
  const [pendingFoodLog, setPendingFoodLog] = useState(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [suggestionContext, setSuggestionContext] = useState(null);
  const [selectedAIMealType, setSelectedAIMealType] = useState(null);

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

  // Collapsible meal sections
  const [collapsedMeals, setCollapsedMeals] = useState(() => {
    // Load from localStorage
    const cached = localStorage.getItem('diary_collapsed_meals');
    return cached ? JSON.parse(cached) : {};
  });

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
  const SwipeableEntry = ({ entry, onDelete, isSelected, onToggleSelect, inSelectionMode, onLongPress }) => {
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
            <span className="meal-entry-serving">{entry.number_of_servings || 1} serving</span>
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
                    isSelected={selectedEntries.has(entry.id)}
                    onToggleSelect={() => toggleEntrySelection(entry.id)}
                    inSelectionMode={selectionMode}
                    onLongPress={handleLongPress}
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
            disabled={waterLoading || waterIntake <= 0}
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
            disabled={waterLoading || waterIntake >= waterGoal}
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

                  {/* Dynamic suggestions */}
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
                    <button
                      className="ai-modal-pill"
                      onClick={() => askAI('I have some ingredients - help me make a meal')}
                    >
                      <ChefHat size={18} />
                      <span>What can I make?</span>
                    </button>
                  </div>

                  {/* Quick Actions */}
                  <div className="ai-modal-quick-actions">
                    <button className="ai-modal-pill" onClick={() => askAI('What should I eat to hit my protein goal?')}>
                      <Dumbbell size={18} />
                      <span>Need protein</span>
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
                <input
                  ref={aiInputRef}
                  type="text"
                  className="ai-modal-input"
                  placeholder="Ask me anything or log food..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAiChat()}
                  disabled={aiLogging}
                  autoFocus
                />
                <button
                  className="ai-modal-send"
                  onClick={() => handleAiChat()}
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

      {/* AI Log Modal - Text input for food logging */}
      {showAILogModal && (
        <div className="modal-overlay active" onClick={() => setShowAILogModal(false)}>
          <div className="modal-content ai-log-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowAILogModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>AI Food Log</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ marginBottom: '16px', color: '#64748b' }}>
                Describe what you ate and I'll log it for you
              </p>

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
                autoFocus
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
    </div>
  );
}

export default Diary;
