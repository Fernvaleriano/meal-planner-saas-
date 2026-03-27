import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, Heart, ScanLine, Mic, ChevronRight, ChevronDown, BarChart3, ClipboardCheck, TrendingUp, BookOpen, Utensils, Pill, ChefHat, Check, CheckCircle, Minus, Plus, X, Sunrise, Sun, Moon, Coffee, Trophy } from 'lucide-react';
import InstallAppBanner from '../components/InstallAppBanner';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { SnapPhotoModal, SearchFoodsModal, FavoritesModal, ScanLabelModal } from '../components/FoodModals';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { onAppResume } from '../hooks/useAppLifecycle';
import { useToast } from '../components/Toast';

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

// Get today's date key for cache (uses local timezone, NOT UTC)
const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Dashboard() {
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();
  const today = getTodayKey();

  // Load all cached data for instant display
  const cachedDashboard = clientData?.id ? getCache(`dashboard_${clientData.id}_${today}`) : null;
  const cachedCoach = clientData?.id ? getCache(`coach_${clientData.id}`) : null;
  const cachedPlans = clientData?.id ? getCache(`plans_${clientData.id}`) : null;
  const cachedSupplements = clientData?.id ? getCache(`supplements_${clientData.id}`) : null;

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
  const [expandedSupplements, setExpandedSupplements] = useState({});
  const [coachData, setCoachData] = useState(cachedCoach?.coachData || null);
  const [hasStories, setHasStories] = useState(cachedCoach?.hasStories || false);

  // Modal states
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [scanLabelModalOpen, setScanLabelModalOpen] = useState(false);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const preVoiceInputRef = useRef(''); // Store input text before voice started
  const logSuccessTimerRef = useRef(null);

  // Food confirmation state
  const [parsedFoods, setParsedFoods] = useState(null);
  const [servings, setServings] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Refresh dashboard data
  const refreshData = useCallback(async () => {
    if (!clientData?.id) return;

    const dateKey = getTodayKey();

    try {
      // Fetch all data in parallel
      const [diaryData, plansData, supplementsData, intakeData] = await Promise.all([
        apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateKey}`).catch(() => null),
        apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`).catch(() => null),
        clientData.coach_id ? apiGet(`/.netlify/functions/client-protocols?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => null) : null,
        apiGet(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&date=${dateKey}`).catch(() => null)
      ]);

      // Update diary progress
      if (diaryData?.entries) {
        const totals = diaryData.entries.reduce((acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        setTodayProgress(totals);

        if (diaryData?.goals) {
          setTargets({
            calories: diaryData.goals.calorie_goal || 2600,
            protein: diaryData.goals.protein_goal || 221,
            carbs: diaryData.goals.carbs_goal || 260,
            fat: diaryData.goals.fat_goal || 75
          });
        }
      }

      // Update meal plans
      if (plansData?.plans) {
        setMealPlans(plansData.plans.slice(0, 3));
      }

      // Update supplements
      if (supplementsData?.protocols) {
        setSupplements(supplementsData.protocols);
      }

      // Update supplement intake
      if (intakeData?.intake) {
        const intakeMap = {};
        intakeData.intake.forEach(record => {
          intakeMap[record.protocol_id] = true;
        });
        setSupplementIntake(intakeMap);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }, [clientData?.id, clientData?.coach_id]);

  // Keep Home in sync with Diary when food entries are changed elsewhere
  useEffect(() => {
    const onDataChanged = (event) => {
      const changedUrl = event?.detail?.url || '';
      if (changedUrl.includes('/.netlify/functions/food-diary')) {
        refreshData();
      }
    };

    window.addEventListener('app:data-changed', onDataChanged);
    return () => window.removeEventListener('app:data-changed', onDataChanged);
  }, [refreshData]);

  // Setup pull-to-refresh using the reusable hook
  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshData);

  // Re-fetch data when app resumes from background.
  // Without this, backgrounding for >5s leaves stale data on screen.
  useEffect(() => {
    const unsub = onAppResume((backgroundMs) => {
      if (backgroundMs < 3000) return;
      refreshData();
    });
    return () => unsub();
  }, [refreshData]);

  // Handle food logged from modals
  const handleFoodLogged = (nutrition) => {
    const dateKey = getTodayKey();
    setTodayProgress(prev => {
      const newProgress = {
        calories: prev.calories + nutrition.calories,
        protein: prev.protein + nutrition.protein,
        carbs: prev.carbs + nutrition.carbs,
        fat: prev.fat + nutrition.fat
      };

      // Update cache using latest state (avoids stale closure totals)
      const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
      setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, progress: newProgress });
      return newProgress;
    });

    // Show success feedback
    setLogSuccess(true);
    if (logSuccessTimerRef.current) clearTimeout(logSuccessTimerRef.current);
    logSuccessTimerRef.current = setTimeout(() => setLogSuccess(false), 3000);
  };

  // Auto-select meal type based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) setSelectedMealType('breakfast');
    else if (hour >= 11 && hour < 15) setSelectedMealType('lunch');
    else if (hour >= 15 && hour < 21) setSelectedMealType('dinner');
    else setSelectedMealType('snack');
  }, []);

  // Cleanup timers and microphone on component unmount
  useEffect(() => {
    return () => {
      if (logSuccessTimerRef.current) clearTimeout(logSuccessTimerRef.current);
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
        }

        try {
          rec.abort();
        } catch (e) {
        }
      }
      // Also cleanup MediaRecorder if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
          mediaRecorderRef.current.stop();
        } catch (e) {
        }
        mediaRecorderRef.current = null;
      }
    };
  }, []);

  // Load today's progress, meal plans, and supplements - all in parallel for faster loading
  useEffect(() => {
    if (!clientData?.id) return;

    const dateKey = getTodayKey();

    // Fetch all data in parallel for faster initial load
    Promise.all([
      apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateKey}`).catch(() => null),
      apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`).catch(() => null),
      clientData.coach_id ? apiGet(`/.netlify/functions/client-protocols?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => null) : Promise.resolve(null),
      apiGet(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&date=${dateKey}`).catch(() => null),
      clientData.coach_id ? apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => null) : Promise.resolve(null)
    ]).then(([diaryData, plansData, supplementsData, intakeData, storiesData]) => {
      // Process diary data
      if (diaryData?.entries) {
        const totals = diaryData.entries.reduce((acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        setTodayProgress(totals);

        const newTargets = diaryData?.goals ? {
          calories: diaryData.goals.calorie_goal || 2600,
          protein: diaryData.goals.protein_goal || 221,
          carbs: diaryData.goals.carbs_goal || 260,
          fat: diaryData.goals.fat_goal || 75
        } : targets;

        if (diaryData?.goals) {
          setTargets(newTargets);
        }

        const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
        setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, progress: totals, targets: newTargets });
      }

      // Process meal plans
      if (plansData?.plans) {
        const plans = plansData.plans.slice(0, 3);
        setMealPlans(plans);
        setCache(`plans_${clientData.id}`, plans);
      }

      // Process supplements
      if (supplementsData?.protocols) {
        setSupplements(supplementsData.protocols);
        setCache(`supplements_${clientData.id}`, { protocols: supplementsData.protocols });
      }

      // Process supplement intake
      if (intakeData?.intake) {
        const intakeMap = {};
        intakeData.intake.forEach(record => {
          intakeMap[record.protocol_id] = true;
        });
        setSupplementIntake(intakeMap);

        const currentCache = getCache(`dashboard_${clientData.id}_${dateKey}`) || {};
        setCache(`dashboard_${clientData.id}_${dateKey}`, { ...currentCache, intake: intakeMap });
      }

      // Process coach stories
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
    }).catch(err => console.error('Error loading dashboard data:', err));

  }, [clientData?.id, clientData?.coach_id]);

  // Get time-of-day coaching message
  const getCoachingMessage = () => {
    const hour = new Date().getHours();
    const caloriesLeft = Math.max(0, targets.calories - todayProgress.calories);
    const proteinLeft = Math.max(0, targets.protein - todayProgress.protein);
    const caloriePercent = targets.calories ? Math.round((todayProgress.calories / targets.calories) * 100) : 0;

    // Early morning — nothing logged yet likely
    if (hour >= 5 && hour < 9) {
      if (todayProgress.calories === 0) return "Good morning — start strong with a protein-rich breakfast.";
      return `Good morning — you're already at ${todayProgress.protein}g protein. Keep it up.`;
    }
    // Late morning
    if (hour >= 9 && hour < 12) {
      if (todayProgress.calories === 0) return "Morning's moving — don't forget to log breakfast.";
      return `${proteinLeft}g protein left today. You've got this.`;
    }
    // Midday
    if (hour >= 12 && hour < 15) {
      if (caloriePercent >= 60) return "Solid day so far — stay on track this afternoon.";
      return `Halfway through the day — ${caloriesLeft} cal and ${proteinLeft}g protein to go.`;
    }
    // Afternoon
    if (hour >= 15 && hour < 18) {
      if (proteinLeft <= 30) return "Almost hit your protein goal — finish strong.";
      return `Afternoon check — ${proteinLeft}g protein left. Dinner can close that gap.`;
    }
    // Evening
    if (hour >= 18 && hour < 21) {
      if (caloriePercent >= 90) return "Almost there — great discipline today.";
      return `Evening push — ${caloriesLeft} cal remaining. Let's close it out.`;
    }
    // Late night
    if (todayProgress.calories === 0) return "Day's almost over — log what you ate today.";
    return `Wrapping up — you hit ${caloriePercent}% of your calorie goal today.`;
  };

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
        showError('Could not recognize the food. Please try describing it differently.');
        return;
      }

      // Show confirmation with parsed foods
      setParsedFoods(aiData.foods);
      setServings(1);
      setShowConfirmation(true);
    } catch (err) {
      console.error('Error analyzing food:', err);
      if (err.isTimeout) {
        showError('Food analysis timed out. Please check your connection and try again.');
      } else if (err.isAuthError) {
        showError('Session expired. Please refresh the page and try again.');
      } else if (err.status === 429) {
        showError('Too many requests. Please wait a moment and try again.');
      } else if (err.status === 503 || (err.message && err.message.includes('busy'))) {
        showError('AI service is temporarily busy. Please try again in a moment.');
      } else {
        showError(`Error analyzing food: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setIsLogging(false);
    }
  };

  // Handle food logging - Step 2: Confirm and actually log
  const confirmLogFood = async () => {
    if (!parsedFoods || parsedFoods.length === 0) return;

    if (!clientData?.id) {
      showError('Please wait for your profile to load, then try again.');
      return;
    }

    setIsLogging(true);

    try {
      const today = getTodayKey();
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
          fiber: food.fiber != null ? Math.round((food.fiber * servings) * 10) / 10 : null,
          sugar: food.sugar != null ? Math.round((food.sugar * servings) * 10) / 10 : null,
          sodium: food.sodium != null ? Math.round(food.sodium * servings) : null,
          potassium: food.potassium != null ? Math.round(food.potassium * servings) : null,
          calcium: food.calcium != null ? Math.round(food.calcium * servings) : null,
          iron: food.iron != null ? Math.round((food.iron * servings) * 10) / 10 : null,
          vitaminC: food.vitaminC != null ? Math.round(food.vitaminC * servings) : null,
          cholesterol: food.cholesterol != null ? Math.round(food.cholesterol * servings) : null,
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
      if (logSuccessTimerRef.current) clearTimeout(logSuccessTimerRef.current);
      logSuccessTimerRef.current = setTimeout(() => setLogSuccess(false), 3000);
    } catch (err) {
      console.error('Error logging food:', err);
      showError('Error logging food. Please try again.');
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
  const hasSpeechRecognition = () => ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);

  const toggleVoiceInput = () => {
    if (isRecording) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  // Helper to detect iOS
  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  // MediaRecorder fallback: record audio and transcribe via Whisper API
  const startMediaRecorderFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isWebm = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm');
      const mimeType = isWebm ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];
      preVoiceInputRef.current = foodInput;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all mic tracks
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (blob.size === 0) {
          resetVoiceUI();
          return;
        }

        // Convert to base64 and send to Whisper
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64 = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await apiPost('/.netlify/functions/transcribe-audio', {
            audioData: base64,
            mimeType
          });

          if (res?.transcript) {
            const baseText = preVoiceInputRef.current;
            setFoodInput(baseText ? `${baseText} ${res.transcript}` : res.transcript);
          } else {
            showError('No speech detected. Please try again and speak clearly.');
          }
        } catch (err) {
          console.error('Transcription failed:', err);
          showError('Could not transcribe audio. Please check your internet connection and try again.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('MediaRecorder start failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('Microphone access denied. Please allow microphone access in your device settings.');
      } else {
        showError('Could not access microphone. Please check your permissions.');
      }
      resetVoiceUI();
    }
  };

  const startVoiceInput = async () => {
    // If SpeechRecognition is not available, use MediaRecorder + Whisper fallback
    if (!hasSpeechRecognition()) {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        startMediaRecorderFallback();
        return;
      }
      showError('Voice input is not supported on this device.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
      }
      recognitionRef.current = null;
    }

    // iOS Safari requires microphone to be "warmed up" with getUserMedia first
    // This prevents the audio-capture error that commonly occurs on iOS
    if (isIOS() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed to activate the mic permission
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('iOS microphone warmup failed:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          showError('Microphone access denied. Please allow microphone access in your iPhone Settings > Safari > Microphone.');
        } else {
          showError('Could not access microphone. Please check your microphone permissions in Settings.');
        }
        return;
      }
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

        // Auto-stop recording once we have a final result
        // This releases the mic immediately after the user finishes speaking
        stopVoiceInput();
      } else if (interimTranscript) {
        // Show interim as preview (will be replaced by final)
        setFoodInput(baseText ? `${baseText} ${interimTranscript}` : interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Voice recognition error:', event.error);

      // User-friendly error messages for each error type
      const errorMessages = {
        'no-speech': 'No speech detected. Please try again and speak clearly.',
        'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings.',
        'audio-capture': isIOS()
          ? 'Could not access microphone on your iPhone. Please:\n• Go to Settings > Safari > Microphone and allow access\n• Make sure no other app is using the microphone\n• Try closing and reopening Safari'
          : 'Could not access your microphone. Please check that:\n• No other app is using the microphone\n• Your microphone is properly connected\n• You have granted microphone permissions',
        'network': 'Network error. Voice recognition requires an internet connection.',
        'service-not-allowed': 'Voice recognition is not available. Please try again later.',
        'bad-grammar': 'Could not understand the speech. Please try again.',
        'language-not-supported': 'Language not supported. Please try speaking in English.'
      };

      if (event.error !== 'aborted') {
        const message = errorMessages[event.error] || `Voice input error: ${event.error}. Please try again.`;
        showError(message);
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
      showError('Could not start microphone. Please try again.');
      resetVoiceUI();
    }
  };

  const stopVoiceInput = () => {
    // Update UI immediately
    setIsRecording(false);

    // Stop MediaRecorder if active (Capacitor fallback path)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop(); // triggers onstop which does transcription
      } catch (e) {
      }
      mediaRecorderRef.current = null;
      return;
    }

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      // IMPORTANT: Stop FIRST, then clear handlers after a delay
      // Clearing handlers before stop() can cause the mic to stay active
      try {
        rec.stop();
      } catch (e) {
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

    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current.stop();
      } catch (e) {
      }
      mediaRecorderRef.current = null;
    }

    // Stop recognition if it's still running
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;

      // Stop first, then clear handlers - order matters!
      try {
        rec.stop();
      } catch (e) {
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

  // Get current titration phase for a scheduled supplement
  const getSupplementTitration = (supp) => {
    if (!supp.has_schedule || !supp.schedule || supp.schedule.length === 0) return null;
    const startDate = supp.client_start_date || supp.start_date;
    if (!startDate) return { status: 'not_started', message: 'Not started yet' };

    const start = new Date(startDate);
    const now = new Date();
    const daysDiff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysDiff / 7) + 1;
    const phases = supp.schedule;

    let currentPhaseIndex = -1;
    for (let i = 0; i < phases.length; i++) {
      if (currentWeek >= phases[i].weekStart && currentWeek <= phases[i].weekEnd) {
        currentPhaseIndex = i;
        break;
      }
    }

    if (currentPhaseIndex === -1 && currentWeek > phases[phases.length - 1].weekEnd) {
      return { status: 'completed', currentDose: phases[phases.length - 1].dose, currentPhaseIndex: phases.length, totalPhases: phases.length };
    }
    if (currentPhaseIndex === -1) return { status: 'not_started', message: 'Starts soon' };

    const phase = phases[currentPhaseIndex];
    const weeksLeft = phase.weekEnd - currentWeek;
    const daysUntilChange = (weeksLeft * 7) + (7 - (daysDiff % 7));
    const nextPhase = currentPhaseIndex + 1 < phases.length ? phases[currentPhaseIndex + 1] : null;

    return {
      status: 'active',
      currentDose: phase.dose,
      currentPhaseIndex,
      totalPhases: phases.length,
      weekRange: `Wk ${phase.weekStart}-${phase.weekEnd}`,
      upcomingChange: nextPhase && daysUntilChange <= 7 ? `${nextPhase.dose} in ~${daysUntilChange}d` : null
    };
  };

  const toggleSupplementExpanded = (suppId, e) => {
    e.stopPropagation();
    setExpandedSupplements(prev => ({ ...prev, [suppId]: !prev[suppId] }));
  };

  // Handle supplement checkbox toggle - optimistic update for instant response
  const handleSupplementToggle = async (protocolId) => {
    const isCurrentlyTaken = supplementIntake[protocolId];
    const today = getTodayKey();

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
    <div className="dashboard" ref={bindToContainer}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      {/* Install App Banner - prompts users to add to home screen */}
      <InstallAppBanner />

      {/* AI Hero Input Section */}
      <div className="ai-hero-card">
        <div className="ai-hero-header">
          <div className="ai-hero-icon">
            <span>⭐</span>
          </div>
          <div className="ai-hero-title">
            <h2 id="ai-hero-title">What did you eat?</h2>
            <span className="ai-powered-label">AI-powered logging</span>
          </div>
        </div>

        {/* Time-of-day coaching message */}
        <p className="coaching-message">{getCoachingMessage()}</p>

        {/* Meal Type Selector */}
        <div className="meal-type-selector" role="group" aria-label="Select meal type">
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
              aria-label={`Select ${meal.label}`}
              aria-pressed={selectedMealType === meal.id}
            >
              <span className="meal-icon" aria-hidden="true"><meal.Icon size={24} /></span>
              <span className="meal-label">{meal.label}</span>
            </button>
          ))}
        </div>

        {/* Food Input */}
        <label htmlFor="food-description" className="visually-hidden">Describe what you ate</label>
        <textarea
          id="food-description"
          className="food-input"
          placeholder="Describe what you ate... e.g., 'Grilled chicken with rice and vegetables' or 'A large coffee with oat milk'"
          value={foodInput}
          onChange={(e) => setFoodInput(e.target.value)}
          rows={2}
          aria-describedby="ai-hero-title"
        />

        {/* Action Buttons */}
        <div className="ai-hero-actions">
          <button
            className={`voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
            onClick={toggleVoiceInput}
            disabled={isTranscribing}
            aria-label={isTranscribing ? 'Transcribing...' : isRecording ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={isRecording}
          >
            <Mic size={20} aria-hidden="true" />
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
              <span id="servings-label">Servings:</span>
              <div className="servings-adjuster" role="group" aria-labelledby="servings-label">
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => Math.max(0.5, prev - 0.5))}
                  aria-label="Decrease servings"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="servings-value" aria-live="polite">{servings}</span>
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => prev + 0.5)}
                  aria-label="Increase servings"
                >
                  <Plus size={16} aria-hidden="true" />
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
        <div className="ai-hero-quick-actions" role="group" aria-label="Quick food logging options">
          <button className="quick-action-pill" onClick={() => setPhotoModalOpen(true)} aria-label="Take a photo of your food">
            <Camera size={16} aria-hidden="true" /> Log by Photo
          </button>
          <button className="quick-action-pill" onClick={() => setSearchModalOpen(true)} aria-label="Search food database">
            <Search size={16} aria-hidden="true" /> Search Foods
          </button>
          <button className="quick-action-pill" onClick={() => setFavoritesModalOpen(true)} aria-label="Log from your favorite foods">
            <Heart size={16} aria-hidden="true" /> Favorites
          </button>
          <button className="quick-action-pill" onClick={() => setScanLabelModalOpen(true)} aria-label="Scan nutrition label">
            <ScanLine size={16} aria-hidden="true" /> Scan Nutrition Label
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
                  {supps.map((supp) => {
                    const titration = getSupplementTitration(supp);
                    const isExpanded = expandedSupplements[supp.id];
                    const displayDose = titration?.status === 'active' ? titration.currentDose : (supp.dose || '');
                    const hasExpandableContent = supp.image_url || supp.notes || (supp.has_schedule && supp.schedule?.length > 0);

                    return (
                      <div key={supp.id}>
                        <div
                          className="supplement-checkbox-item"
                          onClick={() => handleSupplementToggle(supp.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className={`supplement-checkbox ${supplementIntake[supp.id] ? 'checked' : ''}`}>
                            {supplementIntake[supp.id] && <Check size={14} color="white" />}
                          </div>
                          {supp.image_url && (
                            <img src={supp.image_url} alt="" className="supplement-image-thumb" onError={(e) => e.target.style.display = 'none'} />
                          )}
                          <div className="supplement-item-info" style={{ flex: 1 }}>
                            <span className="supplement-item-name" style={supplementIntake[supp.id] ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>{supp.name}</span>
                            <span className="supplement-item-dose">{displayDose}</span>
                            {titration?.status === 'active' && titration.upcomingChange && (
                              <span className="supplement-titration-badge upcoming">{titration.upcomingChange}</span>
                            )}
                            {titration?.status === 'active' && !titration.upcomingChange && (
                              <span className="supplement-titration-badge active">Phase {titration.currentPhaseIndex + 1}/{titration.totalPhases}</span>
                            )}
                          </div>
                          {hasExpandableContent && (
                            <button
                              className={`supplement-expand-btn ${isExpanded ? 'expanded' : ''}`}
                              onClick={(e) => toggleSupplementExpanded(supp.id, e)}
                              aria-label="Toggle details"
                            >
                              <ChevronDown size={18} />
                            </button>
                          )}
                        </div>
                        {isExpanded && hasExpandableContent && (
                          <div className="supplement-details">
                            {supp.image_url && (
                              <img src={supp.image_url} alt={supp.name} className="supplement-image" onError={(e) => e.target.style.display = 'none'} />
                            )}
                            {supp.has_schedule && supp.schedule?.length > 0 && (
                              <>
                                <div className="supplement-schedule-timeline">
                                  {supp.schedule.map((phase, i) => (
                                    <div
                                      key={i}
                                      className={`supplement-phase-bar ${titration && i < titration.currentPhaseIndex ? 'past' : ''} ${titration && i === titration.currentPhaseIndex ? 'active' : ''}`}
                                    />
                                  ))}
                                </div>
                                {supp.schedule.map((phase, i) => (
                                  <div key={i} className="supplement-schedule-detail" style={titration?.currentPhaseIndex === i ? { fontWeight: 700, color: 'var(--brand-primary)' } : {}}>
                                    {titration?.currentPhaseIndex === i ? '> ' : ''}Wk {phase.weekStart}-{phase.weekEnd}: {phase.dose}
                                  </div>
                                ))}
                              </>
                            )}
                            {supp.notes && <div className="supplement-notes">{supp.notes}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
        <Link to="/challenges" className="quick-action-card">
          <div className="quick-action-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <Trophy size={24} />
          </div>
          <span>Challenges</span>
        </Link>
      </div>

      {/* Latest Meal Plan Section - only show most recent */}
      <div className="meal-plans-section">
        <h2 className="section-heading-icon">
          <Utensils size={22} className="section-icon-svg" />
          Latest Meal Plan
        </h2>
        <div className="meal-plans-container">
          {mealPlans.length > 0 ? (
            (() => {
              const plan = mealPlans[0]; // Only show most recent plan
              const planData = plan.plan_data || {};
              const days = planData.currentPlan || planData.days || [];
              const numDays = days.length || 1;
              const createdDate = new Date(plan.created_at);
              const formattedDate = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const summary = planData.summary || planData.description || '';

              // Calculate actual calories from meals (not target calories)
              let calories = '-';
              if (days.length > 0) {
                let totalCalories = 0;
                days.forEach(day => {
                  if (day.plan && Array.isArray(day.plan)) {
                    day.plan.forEach(meal => {
                      totalCalories += meal.calories || 0;
                    });
                  }
                });
                const avgCalories = Math.round(totalCalories / days.length);
                if (avgCalories > 0) {
                  calories = avgCalories;
                }
              }

              // Extract goal
              const goalLabels = { 'lose weight': 'Lose Weight', 'maintain': 'Maintain', 'gain muscle': 'Gain Muscle' };
              const goal = planData.goal ? (goalLabels[planData.goal.toLowerCase()] || planData.goal) : '-';

              // Get custom plan name if available
              const planName = plan.plan_name || planData.planName || `${numDays}-Day Meal Plan`;

              return (
                <Link to={`/plans/${plan.id}`} key={plan.id} className="meal-plan-card">
                  <div className="plan-header">
                    <div className="plan-title">{planName}</div>
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
            })()
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
