import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, Heart, ScanLine, Mic, ChevronRight, BarChart3, ClipboardCheck, TrendingUp, BookOpen, Utensils, Pill, ChefHat, Check, CheckCircle, Minus, Plus, X, Sunrise, Sun, Moon, Coffee } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { SnapPhotoModal, SearchFoodsModal, FavoritesModal, ScanLabelModal } from '../components/FoodModals';

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

  // Modal states
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [scanLabelModalOpen, setScanLabelModalOpen] = useState(false);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const preVoiceInputRef = useRef(''); // Store input text before voice started

  // Food confirmation state
  const [parsedFoods, setParsedFoods] = useState(null);
  const [servings, setServings] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Handle food logged from modals
  const handleFoodLogged = (nutrition) => {
    setTodayProgress(prev => ({
      calories: prev.calories + nutrition.calories,
      protein: prev.protein + nutrition.protein,
      carbs: prev.carbs + nutrition.carbs,
      fat: prev.fat + nutrition.fat
    }));

    // Update cache
    const dateKey = getTodayKey();
    const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
    const newProgress = {
      calories: todayProgress.calories + nutrition.calories,
      protein: todayProgress.protein + nutrition.protein,
      carbs: todayProgress.carbs + nutrition.carbs,
      fat: todayProgress.fat + nutrition.fat
    };
    setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, progress: newProgress });

    // Show success feedback
    setLogSuccess(true);
    setTimeout(() => setLogSuccess(false), 3000);
  };

  // Auto-select meal type based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) setSelectedMealType('breakfast');
    else if (hour >= 11 && hour < 15) setSelectedMealType('lunch');
    else if (hour >= 15 && hour < 21) setSelectedMealType('dinner');
    else setSelectedMealType('snack');
  }, []);

  // Cleanup microphone on component unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.log('Cleanup: Error stopping recognition:', e);
        }
        recognitionRef.current = null;
      }
    };
  }, []);

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

  // Handle food logging - Step 1: Analyze and show confirmation
  const handleLogFood = async () => {
    if (!foodInput.trim() || !selectedMealType) return;

    // Stop voice recording if active
    if (isRecording) {
      stopVoiceInput();
    }

    setIsLogging(true);
    setLogSuccess(false);

    try {
      // Call AI to parse the food description
      const aiData = await apiPost('/.netlify/functions/analyze-food-text', {
        text: foodInput
      });

      if (!aiData?.foods || aiData.foods.length === 0) {
        alert('Could not recognize the food. Please try describing it differently.');
        return;
      }

      // Show confirmation with parsed foods
      setParsedFoods(aiData.foods);
      setServings(1);
      setShowConfirmation(true);
    } catch (err) {
      console.error('Error analyzing food:', err);
      alert('Error analyzing food. Please try again.');
    } finally {
      setIsLogging(false);
    }
  };

  // Handle food logging - Step 2: Confirm and actually log
  const confirmLogFood = async () => {
    if (!parsedFoods || parsedFoods.length === 0) return;

    if (!clientData?.id) {
      alert('Please wait for your profile to load, then try again.');
      return;
    }

    setIsLogging(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      let totalAdded = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      for (const food of parsedFoods) {
        const adjustedCalories = Math.round((food.calories || 0) * servings);
        const adjustedProtein = Math.round((food.protein || 0) * servings);
        const adjustedCarbs = Math.round((food.carbs || 0) * servings);
        const adjustedFat = Math.round((food.fat || 0) * servings);

        await apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate: today,
          mealType: selectedMealType,
          foodName: food.name,
          calories: adjustedCalories,
          protein: adjustedProtein,
          carbs: adjustedCarbs,
          fat: adjustedFat,
          servingSize: servings,
          servingUnit: 'serving',
          numberOfServings: servings,
          foodSource: 'ai'
        });

        totalAdded.calories += adjustedCalories;
        totalAdded.protein += adjustedProtein;
        totalAdded.carbs += adjustedCarbs;
        totalAdded.fat += adjustedFat;
      }

      // Update local state with new totals
      setTodayProgress(prev => ({
        calories: prev.calories + totalAdded.calories,
        protein: prev.protein + totalAdded.protein,
        carbs: prev.carbs + totalAdded.carbs,
        fat: prev.fat + totalAdded.fat
      }));

      // Clear and show success
      setFoodInput('');
      setParsedFoods(null);
      setShowConfirmation(false);
      setLogSuccess(true);
      setTimeout(() => setLogSuccess(false), 3000);
    } catch (err) {
      console.error('Error logging food:', err);
      alert('Error logging food. Please try again.');
    } finally {
      setIsLogging(false);
    }
  };

  // Cancel food confirmation
  const cancelLogFood = () => {
    setParsedFoods(null);
    setShowConfirmation(false);
    setServings(1);
  };

  // Voice input functions
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
    preVoiceInputRef.current = foodInput;

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
        setFoodInput(baseText ? `${baseText} ${finalTranscript}` : finalTranscript);
      } else if (interimTranscript) {
        // Show interim as preview (will be replaced by final)
        setFoodInput(baseText ? `${baseText} ${interimTranscript}` : interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Voice recognition error:', event.error);
      if (event.error === 'no-speech') {
        alert('No speech detected. Please try again.');
      } else if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (event.error !== 'aborted') {
        alert('Voice error: ' + event.error);
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
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;

      try {
        rec.abort();
      } catch (e) {
        console.log('Error stopping recognition:', e);
      }
    }
    resetVoiceUI();
  };

  const resetVoiceUI = () => {
    // Also stop recognition if it's still running
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.log('ResetVoiceUI: Error stopping recognition:', e);
      }
    }
    setIsRecording(false);
    recognitionRef.current = null;
  };

  // Handle supplement checkbox toggle - optimistic update for instant response
  const handleSupplementToggle = async (protocolId) => {
    const isCurrentlyTaken = supplementIntake[protocolId];
    const today = new Date().toISOString().split('T')[0];

    // Optimistic update - update UI immediately
    if (isCurrentlyTaken) {
      setSupplementIntake(prev => {
        const updated = { ...prev };
        delete updated[protocolId];
        return updated;
      });
    } else {
      setSupplementIntake(prev => ({
        ...prev,
        [protocolId]: true
      }));
    }

    // Then make API call in background
    try {
      if (isCurrentlyTaken) {
        await apiDelete(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&protocolId=${protocolId}&date=${today}`);
      } else {
        await apiPost('/.netlify/functions/supplement-intake', {
          clientId: clientData.id,
          protocolId: protocolId,
          date: today
        });
      }
    } catch (err) {
      console.error('Error toggling supplement:', err);
      // Revert on error
      if (isCurrentlyTaken) {
        setSupplementIntake(prev => ({ ...prev, [protocolId]: true }));
      } else {
        setSupplementIntake(prev => {
          const updated = { ...prev };
          delete updated[protocolId];
          return updated;
        });
      }
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
      {/* AI Hero Input Section */}
      <div className="ai-hero-card">
        <div className="ai-hero-header">
          <div className="ai-hero-icon">
            <span>⭐</span>
          </div>
          <div className="ai-hero-title">
            <h2>What did you eat?</h2>
            <span className="ai-powered-label">AI-powered logging</span>
          </div>
        </div>

        {/* Meal Type Selector */}
        <div className="meal-type-selector">
          {[
            { id: 'breakfast', Icon: Sunrise, label: 'Breakfast' },
            { id: 'lunch', Icon: Sun, label: 'Lunch' },
            { id: 'dinner', Icon: Moon, label: 'Dinner' },
            { id: 'snack', Icon: Coffee, label: 'Snack' }
          ].map(meal => (
            <button
              key={meal.id}
              className={`meal-type-btn ${selectedMealType === meal.id ? 'active' : ''}`}
              onClick={() => setSelectedMealType(meal.id)}
            >
              <span className="meal-icon"><meal.Icon size={24} /></span>
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
          <button
            className={`voice-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleVoiceInput}
          >
            <Mic size={20} />
          </button>
          <button
            className="log-food-btn"
            onClick={handleLogFood}
            disabled={isLogging || !foodInput.trim() || showConfirmation}
            style={logSuccess ? { background: '#22c55e' } : {}}
          >
            {isLogging ? 'Analyzing...' : logSuccess ? 'Logged!' : 'Log Food'}
            {logSuccess ? <Check size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* Food Confirmation Box */}
        {showConfirmation && parsedFoods && (
          <div className="food-confirmation-box">
            <div className="food-confirmation-header">
              <CheckCircle size={18} className="confirm-icon" />
              <span>Ready to log</span>
            </div>

            {parsedFoods.map((food, idx) => (
              <div key={idx} className="food-confirmation-item">
                <div className="food-confirmation-name">
                  <span>{food.name}</span>
                  <span className="food-calories">{Math.round((food.calories || 0) * servings)} cal</span>
                </div>
              </div>
            ))}

            <div className="food-confirmation-servings">
              <span>Servings:</span>
              <div className="servings-adjuster">
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => Math.max(0.5, prev - 0.5))}
                >
                  <Minus size={16} />
                </button>
                <span className="servings-value">{servings}</span>
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => prev + 0.5)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="food-confirmation-macros">
              <div className="macro-item">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.calories || 0), 0) * servings)}</span>
                <span className="macro-label">CALORIES</span>
              </div>
              <div className="macro-item protein">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.protein || 0), 0) * servings)}g</span>
                <span className="macro-label">PROTEIN</span>
              </div>
              <div className="macro-item carbs">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.carbs || 0), 0) * servings)}g</span>
                <span className="macro-label">CARBS</span>
              </div>
              <div className="macro-item fat">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.fat || 0), 0) * servings)}g</span>
                <span className="macro-label">FAT</span>
              </div>
            </div>

            <div className="food-confirmation-actions">
              <button className="confirm-cancel-btn" onClick={cancelLogFood}>
                Cancel
              </button>
              <button
                className="confirm-add-btn"
                onClick={confirmLogFood}
                disabled={isLogging}
              >
                <Check size={18} />
                {isLogging ? 'Adding...' : `Add to ${selectedMealType?.charAt(0).toUpperCase() + selectedMealType?.slice(1)}`}
              </button>
            </div>
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="ai-hero-quick-actions">
          <button className="quick-action-pill" onClick={() => setPhotoModalOpen(true)}>
            <Camera size={16} /> Snap Photo
          </button>
          <button className="quick-action-pill" onClick={() => setSearchModalOpen(true)}>
            <Search size={16} /> Search Foods
          </button>
          <button className="quick-action-pill" onClick={() => setFavoritesModalOpen(true)}>
            <Heart size={16} /> Favorites
          </button>
          <button className="quick-action-pill" onClick={() => setScanLabelModalOpen(true)}>
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
        <Link to="/check-in" className="quick-action-card">
          <div className="quick-action-card-icon teal">
            <ClipboardCheck size={24} />
          </div>
          <span>Check-In</span>
        </Link>
        <Link to="/progress" className="quick-action-card">
          <div className="quick-action-card-icon pink">
            <TrendingUp size={24} />
          </div>
          <span>Progress</span>
        </Link>
        <Link to="/recipes" className="quick-action-card">
          <div className="quick-action-card-icon yellow">
            <ChefHat size={24} />
          </div>
          <span>Recipes</span>
        </Link>
        <div className="quick-action-card" onClick={() => setFavoritesModalOpen(true)} style={{ cursor: 'pointer' }}>
          <div className="quick-action-card-icon red">
            <Heart size={24} />
          </div>
          <span>Favorites</span>
        </div>
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
              const planData = plan.plan_data || {};
              const days = planData.currentPlan || planData.days || [];
              const numDays = days.length || 1;
              const createdDate = new Date(plan.created_at);
              const formattedDate = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const summary = planData.summary || planData.description || '';

              // Extract calories from first day's targets (same logic as Plans.jsx)
              let calories = '-';
              if (days.length > 0 && days[0]?.targets?.calories) {
                calories = days[0].targets.calories;
              } else if (planData.dailyCalories) {
                calories = planData.dailyCalories;
              } else if (planData.calories) {
                calories = planData.calories;
              }

              // Extract goal
              const goalLabels = { 'lose weight': 'Lose Weight', 'maintain': 'Maintain', 'gain muscle': 'Gain Muscle' };
              const goal = planData.goal ? (goalLabels[planData.goal.toLowerCase()] || planData.goal) : '-';

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
                      <span className="plan-detail-value">{goal}</span>
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

      {/* Food Logging Modals */}
      <SnapPhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={handleFoodLogged}
      />
      <SearchFoodsModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={handleFoodLogged}
      />
      <FavoritesModal
        isOpen={favoritesModalOpen}
        onClose={() => setFavoritesModalOpen(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={handleFoodLogged}
      />
      <ScanLabelModal
        isOpen={scanLabelModalOpen}
        onClose={() => setScanLabelModalOpen(false)}
        mealType={selectedMealType}
        clientData={clientData}
        onFoodLogged={handleFoodLogged}
      />
    </div>
  );
}

export default Dashboard;
