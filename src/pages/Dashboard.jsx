import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Search, Heart, ScanLine, Mic, ChevronRight, ChevronDown, BarChart3, ClipboardCheck, TrendingUp, BookOpen, Pill, ChefHat, Check, CheckCircle, Minus, Plus, X, Sunrise, Sun, Sunset, Moon, Coffee, Utensils, Dumbbell, Star, Clock, Trophy, UserCircle, Scale, Users, Sparkles } from 'lucide-react';
import InstallAppBanner from '../components/InstallAppBanner';
import StoriesBar from '../components/StoriesBar';
import DropsBanner from '../components/DropsBanner';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { getSpeechLang } from '../utils/speechLang';
import { SnapPhotoModal, SearchFoodsModal, FavoritesModal, ScanLabelModal } from '../components/FoodModals';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { onAppResume } from '../hooks/useAppLifecycle';
import { useToast } from '../components/Toast';
import { useLanguage } from '../context/LanguageContext';
import { getDateLocale } from '../utils/dateLocale';

const WeightProofModal = lazy(() => import('../components/WeightProofModal'));

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
  const { t, language } = useLanguage();
  const { isModuleVisible, getLabel, branding } = useBranding();
  // Workout-only ("lite mode") gym members have the diary module turned off.
  // When nutrition is disabled we hide the food-logging / macro / weigh-in
  // sections and show a workout-focused home instead. Full coaching clients
  // (diary on — the default) see the exact same home as before.
  const nutritionEnabled = isModuleVisible('diary');
  const today = getTodayKey();

  // Load all cached data for instant display
  const cachedDashboard = clientData?.id ? getCache(`dashboard_${clientData.id}_${today}`) : null;
  const cachedCoach = clientData?.id ? getCache(`coach_${clientData.id}`) : null;
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
  const [weightProofOpen, setWeightProofOpen] = useState(false);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const preVoiceInputRef = useRef(''); // Store input text before voice started
  const logSuccessTimerRef = useRef(null);
  // Indexes of parsedFoods already written to the diary this batch — lets a
  // retry after a mid-batch failure skip foods that were already logged
  // instead of duplicating them.
  const loggedFoodIndexesRef = useRef(new Set());

  // Food confirmation state
  const [parsedFoods, setParsedFoods] = useState(null);
  const [servings, setServings] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // True when any of today's parallel fetches failed and the displayed
  // numbers may not reflect server truth. Surfaces a subtle banner so
  // we don't silently show zeroes / cached values as if they were live.
  const [dataStale, setDataStale] = useState(false);

  // Refresh dashboard data
  const refreshData = useCallback(async () => {
    if (!clientData?.id) return;

    const dateKey = getTodayKey();

    try {
      // FAILED sentinel lets callers distinguish "fetch errored" from
      // "fetch succeeded with empty payload" — without it, every error
      // collapses to null and the UI silently keeps showing stale values.
      const FAILED = Symbol('fetch-failed');
      // Fetch all data in parallel
      const [diaryRaw, supplementsRaw, intakeRaw] = await Promise.all([
        apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateKey}`).catch(() => FAILED),
        clientData.coach_id ? apiGet(`/.netlify/functions/client-protocols?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => FAILED) : null,
        apiGet(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&date=${dateKey}`).catch(() => FAILED)
      ]);
      const anyFailed = diaryRaw === FAILED || supplementsRaw === FAILED || intakeRaw === FAILED;
      setDataStale(anyFailed);
      const diaryData = diaryRaw === FAILED ? null : diaryRaw;
      const supplementsData = supplementsRaw === FAILED ? null : supplementsRaw;
      const intakeData = intakeRaw === FAILED ? null : intakeRaw;

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
  // Without this, users see stale data on re-entry and have to pull-to-refresh.
  useEffect(() => {
    const unsub = onAppResume(() => {
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

    // FAILED sentinel — see refreshData for the rationale. We need to
    // distinguish a real fetch failure from a successful empty response
    // so the stale-data indicator shows up instead of zeroing the UI.
    const FAILED = Symbol('fetch-failed');
    // Fetch all data in parallel for faster initial load
    Promise.all([
      apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateKey}`).catch(() => FAILED),
      clientData.coach_id ? apiGet(`/.netlify/functions/client-protocols?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => FAILED) : Promise.resolve(null),
      apiGet(`/.netlify/functions/supplement-intake?clientId=${clientData.id}&date=${dateKey}`).catch(() => FAILED),
      clientData.coach_id ? apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`).catch(() => FAILED) : Promise.resolve(null)
    ]).then(([diaryRaw, supplementsRaw, intakeRaw, storiesRaw]) => {
      const anyFailed =
        diaryRaw === FAILED || supplementsRaw === FAILED ||
        intakeRaw === FAILED || storiesRaw === FAILED;
      setDataStale(anyFailed);
      const diaryData = diaryRaw === FAILED ? null : diaryRaw;
      const supplementsData = supplementsRaw === FAILED ? null : supplementsRaw;
      const intakeData = intakeRaw === FAILED ? null : intakeRaw;
      const storiesData = storiesRaw === FAILED ? null : storiesRaw;
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
      if (todayProgress.calories === 0) return t('dashboard.coachingEarlyNoLog');
      return t('dashboard.coachingEarlyLogged', { protein: todayProgress.protein });
    }
    // Late morning
    if (hour >= 9 && hour < 12) {
      if (todayProgress.calories === 0) return t('dashboard.coachingMorningNoLog');
      return t('dashboard.coachingMorningLogged', { proteinLeft });
    }
    // Midday
    if (hour >= 12 && hour < 15) {
      if (caloriePercent >= 60) return t('dashboard.coachingMiddayGood');
      return t('dashboard.coachingMiddayBehind', { caloriesLeft, proteinLeft });
    }
    // Afternoon
    if (hour >= 15 && hour < 18) {
      if (proteinLeft <= 30) return t('dashboard.coachingAfternoonClose');
      return t('dashboard.coachingAfternoonCheck', { proteinLeft });
    }
    // Evening
    if (hour >= 18 && hour < 21) {
      if (caloriePercent >= 90) return t('dashboard.coachingEveningGood');
      return t('dashboard.coachingEveningPush', { caloriesLeft });
    }
    // Late night
    if (todayProgress.calories === 0) return t('dashboard.coachingLateNoLog');
    return t('dashboard.coachingLateWrap', { caloriePercent });
  };

  // Calculate overall progress percentage
  const getOverallProgress = () => {
    if (!targets.calories) return 0;
    return Math.min(100, Math.round((todayProgress.calories / targets.calories) * 100));
  };

  // Format today's date
  const formatTodayDate = () => {
    return new Date().toLocaleDateString(getDateLocale(), {
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
        text: foodInput,
        language
      });

      if (!aiData?.foods || aiData.foods.length === 0) {
        showError(t('dashboard.errorNoFood'));
        return;
      }

      // Show confirmation with parsed foods
      setParsedFoods(aiData.foods);
      loggedFoodIndexesRef.current = new Set(); // fresh batch — nothing logged yet
      setServings(1);
      setShowConfirmation(true);
    } catch (err) {
      console.error('Error analyzing food:', err);
      if (err.isTimeout) {
        showError(t('dashboard.errorTimeout'));
      } else if (err.isAuthError) {
        showError(t('dashboard.errorSession'));
      } else if (err.status === 429) {
        showError(t('dashboard.errorTooManyRequests'));
      } else if (err.status === 503 || (err.message && err.message.includes('busy'))) {
        showError(t('dashboard.errorAIBusy'));
      } else {
        showError(t('dashboard.errorAnalyzingFood', { message: err.message || 'Unknown error' }));
      }
    } finally {
      setIsLogging(false);
    }
  };

  // Handle food logging - Step 2: Confirm and actually log
  const confirmLogFood = async () => {
    if (!parsedFoods || parsedFoods.length === 0) return;

    if (!clientData?.id) {
      showError(t('dashboard.errorWaitForProfile'));
      return;
    }

    setIsLogging(true);

    try {
      const today = getTodayKey();
      let totalAdded = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      for (const [foodIdx, food] of parsedFoods.entries()) {
        // Already written by a previous attempt that failed mid-batch —
        // POSTing it again would duplicate the diary entry.
        if (loggedFoodIndexesRef.current.has(foodIdx)) continue;
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

        loggedFoodIndexesRef.current.add(foodIdx);
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
      showError(t('dashboard.errorLoggingFood'));
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
            showError(t('dashboard.voiceErrorNoTranscript'));
          }
        } catch (err) {
          console.error('Transcription failed:', err);
          showError(t('dashboard.voiceErrorTranscriptFailed'));
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
        showError(t('dashboard.voiceErrorMicDenied'));
      } else {
        showError(t('dashboard.voiceErrorMicAccess'));
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
      showError(t('dashboard.voiceErrorNotSupported'));
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
          showError(t('dashboard.voiceErrorIOSDenied'));
        } else {
          showError(t('dashboard.voiceErrorIOSMic'));
        }
        return;
      }
    }

    // Store current input before voice starts
    preVoiceInputRef.current = foodInput;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = getSpeechLang();
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
        'no-speech': t('dashboard.voiceErrorNoSpeech'),
        'not-allowed': t('dashboard.voiceErrorNotAllowed'),
        'audio-capture': isIOS()
          ? t('dashboard.voiceErrorAudioCaptureIOS')
          : t('dashboard.voiceErrorAudioCapture'),
        'network': t('dashboard.voiceErrorNetwork'),
        'service-not-allowed': t('dashboard.voiceErrorServiceNotAllowed'),
        'bad-grammar': t('dashboard.voiceErrorBadGrammar'),
        'language-not-supported': t('dashboard.voiceErrorLangNotSupported'),
      };

      if (event.error !== 'aborted') {
        const message = errorMessages[event.error] || t('dashboard.voiceErrorGeneric', { error: event.error });
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
      showError(t('dashboard.voiceErrorStartFailed'));
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
    if (!startDate) return { status: 'not_started', message: t('dashboard.titrationNotStarted') };

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
    if (currentPhaseIndex === -1) return { status: 'not_started', message: t('dashboard.titrationStartsSoon') };

    const phase = phases[currentPhaseIndex];
    const weeksLeft = phase.weekEnd - currentWeek;
    const daysUntilChange = (weeksLeft * 7) + (7 - (daysDiff % 7));
    const nextPhase = currentPhaseIndex + 1 < phases.length ? phases[currentPhaseIndex + 1] : null;

    return {
      status: 'active',
      currentDose: phase.dose,
      currentPhaseIndex,
      totalPhases: phases.length,
      weekRange: t('dashboard.titrationWeekRange', { start: phase.weekStart, end: phase.weekEnd }),
      upcomingChange: nextPhase && daysUntilChange <= 7 ? t('dashboard.titrationUpcoming', { dose: nextPhase.dose, days: daysUntilChange }) : null
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
  const ProgressRing = ({ current, target, color, label, isCalories }) => {
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
          <span className="target">/{target}{isCalories ? ' kcal' : 'g'}</span>
        </div>
        <div className="progress-ring-label">{label}</div>
      </div>
    );
  };

  return (
    <div
      className="dashboard"
      ref={bindToContainer}
      style={!nutritionEnabled ? {
        // Workout-only "gym home": fill exactly the visible area (no more) so
        // the page is static / non-scrollable, and let the branded footer
        // center in the leftover space. Offset = top nav (~66) + page top
        // padding (24) + page bottom padding (100, reserves room above the
        // fixed bottom nav) + the safe-area insets those already include.
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100dvh - 190px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
      } : undefined}
    >
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      {/* Install App Banner - prompts users to add to home screen */}
      <InstallAppBanner />

      {/* Client stories — teammates' + your own 24h stories, Instagram-style.
          Coach stories stay in the top nav; this row is the client group. */}
      {!clientData?.is_coach && clientData?.id && clientData?.coach_id && (
        <StoriesBar
          mode="client"
          clientId={clientData.id}
          coachId={clientData.coach_id}
          selfName={clientData.client_name}
          selfAvatar={clientData.profile_photo_url}
        />
      )}

      {dataStale && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: '8px 16px',
            padding: '6px 10px',
            fontSize: 12,
            background: 'rgba(255, 152, 0, 0.12)',
            color: '#9a5b00',
            border: '1px solid rgba(255, 152, 0, 0.35)',
            borderRadius: 6,
            textAlign: 'center'
          }}
        >
          {t('dashboard.dataStale')}
        </div>
      )}

      {/* Nutrition sections (AI food logging, weigh-in, macro progress) —
          shown for full coaching clients, hidden for workout-only gym members. */}
      {nutritionEnabled && (<>
      {/* AI Hero Input Section */}
      <div className="ai-hero-card">
        <div className="ai-hero-header">
          <div className="ai-hero-title">
            <h2 id="ai-hero-title">{t('dashboard.whatDidYouEat')}</h2>
            <span className="ai-powered-label">{t('dashboard.aiPoweredLogging')}</span>
          </div>
        </div>

        {/* Time-of-day coaching message */}
        <p className="coaching-message">{getCoachingMessage()}</p>

        {/* Meal Type Selector */}
        <div className="meal-type-selector" role="group" aria-label={t('dashboard.mealTypeGroupAriaLabel')}>
          {[
            { id: 'breakfast', Icon: Sunrise, labelKey: 'mealBreakfast' },
            { id: 'lunch', Icon: Sun, labelKey: 'mealLunch' },
            { id: 'dinner', Icon: Moon, labelKey: 'mealDinner' },
            { id: 'snack', Icon: Coffee, labelKey: 'mealSnack' }
          ].map(meal => (
            <button
              key={meal.id}
              className={`meal-type-btn ${selectedMealType === meal.id ? 'active' : ''}`}
              onClick={() => setSelectedMealType(meal.id)}
              aria-label={t('dashboard.mealSelectAriaLabel', { mealLabel: t(`dashboard.${meal.labelKey}`) })}
              aria-pressed={selectedMealType === meal.id}
            >
              <span className="meal-icon" aria-hidden="true"><meal.Icon size={24} /></span>
              <span className="meal-label">{t(`dashboard.${meal.labelKey}`)}</span>
            </button>
          ))}
        </div>

        {/* Food Input */}
        <label htmlFor="food-description" className="visually-hidden">{t('dashboard.foodInputLabel')}</label>
        <textarea
          id="food-description"
          className="food-input"
          placeholder={t('dashboard.foodInputPlaceholder')}
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
            aria-label={isTranscribing ? t('dashboard.voiceAriaTranscribing') : isRecording ? t('dashboard.voiceAriaStop') : t('dashboard.voiceAriaStart')}
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
            {isLogging ? t('dashboard.logFoodAnalyzing') : logSuccess ? t('dashboard.logFoodLogged') : t('dashboard.logFoodDefault')}
            {logSuccess ? <Check size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* Food Confirmation Box */}
        {showConfirmation && parsedFoods && (
          <div className="food-confirmation-box">
            <div className="food-confirmation-header">
              <CheckCircle size={18} className="confirm-icon" />
              <span>{t('dashboard.confirmReadyToLog')}</span>
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
              <span id="servings-label">{t('dashboard.confirmServingsLabel')}</span>
              <div className="servings-adjuster" role="group" aria-labelledby="servings-label">
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => Math.max(0.5, prev - 0.5))}
                  aria-label={t('dashboard.confirmDecreaseAriaLabel')}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="servings-value" aria-live="polite">{servings}</span>
                <button
                  className="servings-btn"
                  onClick={() => setServings(prev => prev + 0.5)}
                  aria-label={t('dashboard.confirmIncreaseAriaLabel')}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="food-confirmation-macros">
              <div className="macro-item">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.calories || 0), 0) * servings)}</span>
                <span className="macro-label">{t('dashboard.confirmMacroCalories')}</span>
              </div>
              <div className="macro-item protein">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.protein || 0), 0) * servings)}g</span>
                <span className="macro-label">{t('dashboard.confirmMacroProtein')}</span>
              </div>
              <div className="macro-item carbs">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.carbs || 0), 0) * servings)}g</span>
                <span className="macro-label">{t('dashboard.confirmMacroCarbs')}</span>
              </div>
              <div className="macro-item fat">
                <span className="macro-value">{Math.round(parsedFoods.reduce((sum, f) => sum + (f.fat || 0), 0) * servings)}g</span>
                <span className="macro-label">{t('dashboard.confirmMacroFat')}</span>
              </div>
            </div>

            <div className="food-confirmation-actions">
              <button className="confirm-cancel-btn" onClick={cancelLogFood}>
                {t('dashboard.confirmCancel')}
              </button>
              <button
                className="confirm-add-btn"
                onClick={confirmLogFood}
                disabled={isLogging}
              >
                <Check size={18} />
                {isLogging ? t('dashboard.confirmAdding') : t('dashboard.confirmAddTo', { mealType: selectedMealType ? t(`dashboard.meal${selectedMealType.charAt(0).toUpperCase() + selectedMealType.slice(1)}`) : '' })}
              </button>
            </div>
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="ai-hero-quick-actions" role="group" aria-label={t('dashboard.quickActionsAriaLabel')}>
          <button className="quick-action-pill" onClick={() => setPhotoModalOpen(true)} aria-label={t('dashboard.pillLogByPhotoAria')}>
            <Camera size={16} aria-hidden="true" /> {t('dashboard.pillLogByPhoto')}
          </button>
          <button className="quick-action-pill" onClick={() => setSearchModalOpen(true)} aria-label={t('dashboard.pillSearchFoodsAria')}>
            <Search size={16} aria-hidden="true" /> {t('dashboard.pillSearchFoods')}
          </button>
          <button className="quick-action-pill" onClick={() => setFavoritesModalOpen(true)} aria-label={t('dashboard.pillFavoritesAria')}>
            <Heart size={16} aria-hidden="true" /> {t('dashboard.pillFavorites')}
          </button>
          <button className="quick-action-pill" onClick={() => setScanLabelModalOpen(true)} aria-label={t('dashboard.pillScanLabelAria')}>
            <ScanLine size={16} aria-hidden="true" /> {t('dashboard.pillScanLabel')}
          </button>
        </div>
      </div>

      {/* Weigh-In Banner — AI reads scale photo and logs into measurements */}
      <button
        className="gym-proof-banner weight-proof-banner"
        onClick={() => setWeightProofOpen(true)}
        aria-label={t('dashboard.weighInAriaLabel')}
      >
        <div className="gym-proof-banner-icon weight-proof-banner-icon">
          <Scale size={20} />
        </div>
        <div className="gym-proof-banner-text">
          <span className="gym-proof-banner-title">{t('dashboard.weighInTitle')}</span>
          <span className="gym-proof-banner-sub">{t('dashboard.weighInSub')}</span>
        </div>
        <ChevronRight size={18} className="gym-proof-banner-arrow" />
      </button>

      {/* Today's Progress Card */}
      <div className="progress-card">
        <div className="progress-card-header">
          <div className="progress-card-title">
            <BarChart3 size={20} className="progress-icon" />
            <h3>{t('dashboard.progressCardTitle')}</h3>
          </div>
          <span className="progress-date">{formatTodayDate()}</span>
        </div>

        <div className="progress-rings">
          <ProgressRing
            current={todayProgress.calories}
            target={targets.calories}
            color="#4ec5b7"
            label={t('dashboard.ringCalories')}
            isCalories
          />
          <ProgressRing
            current={todayProgress.protein}
            target={targets.protein}
            color="#4ec5b7"
            label={t('dashboard.ringProtein')}
          />
          <ProgressRing
            current={todayProgress.carbs}
            target={targets.carbs}
            color="#4ec5b7"
            label={t('dashboard.ringCarbs')}
          />
          <ProgressRing
            current={todayProgress.fat}
            target={targets.fat}
            color="#4ec5b7"
            label={t('dashboard.ringFat')}
          />
        </div>

        <div className="daily-progress-bar">
          <div className="daily-progress-header">
            <span>{t('dashboard.dailyGoalProgress')}</span>
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
          {t('dashboard.viewDiary')}
        </Link>
      </div>
      </>)}

      {/* Today's Supplements Section */}
      {supplements.length > 0 && (
        <div className="todays-supplements-card">
          <div className="supplements-header">
            <div className="supplements-title">
              <Pill size={20} className="supplements-icon" />
              <span>{t('dashboard.supplementsTitle')}</span>
            </div>
            <span className="supplements-counter">{takenSupplementsCount}/{supplements.length}</span>
          </div>
          {/* Compliance progress bar — fills as supplements are checked off */}
          <div className="supplements-progress-bar" role="progressbar" aria-valuenow={takenSupplementsCount} aria-valuemin={0} aria-valuemax={supplements.length}>
            <div
              className="supplements-progress-fill"
              style={{ width: `${supplements.length > 0 ? (takenSupplementsCount / supplements.length) * 100 : 0}%` }}
            />
          </div>
          <div className="supplements-list">
            {(() => {
              // Map timing keys to Lucide components. Both dashed and
              // underscored variants are listed because the backend uses
              // either depending on the entry point that created the
              // supplement record. Same goes for timingLabels below.
              const timingIcons = {
                morning: Sunrise,
                'with-breakfast': Coffee,
                'with_breakfast': Coffee,
                'before-workout': Dumbbell,
                'before_workout': Dumbbell,
                'after-workout': Dumbbell,
                'after_workout': Dumbbell,
                'with-lunch': Utensils,
                'with_lunch': Utensils,
                'with-meals': Utensils,
                'with_meals': Utensils,
                'with-dinner': Utensils,
                'with_dinner': Utensils,
                evening: Sunset,
                bedtime: Moon,
                'before-bed': Moon,
                'before_bed': Moon,
                custom: Star,
              };
              const timingLabels = {
                morning: t('dashboard.timingMorning'),
                'with-breakfast': t('dashboard.timingWithBreakfast'),
                'with_breakfast': t('dashboard.timingWithBreakfast'),
                'before-workout': t('dashboard.timingBeforeWorkout'),
                'before_workout': t('dashboard.timingBeforeWorkout'),
                'after-workout': t('dashboard.timingAfterWorkout'),
                'after_workout': t('dashboard.timingAfterWorkout'),
                'with-lunch': t('dashboard.timingWithLunch'),
                'with_lunch': t('dashboard.timingWithLunch'),
                'with-meals': t('dashboard.timingWithMeals'),
                'with_meals': t('dashboard.timingWithMeals'),
                'with-dinner': t('dashboard.timingWithDinner'),
                'with_dinner': t('dashboard.timingWithDinner'),
                evening: t('dashboard.timingEvening'),
                bedtime: t('dashboard.timingBedtime'),
                'before-bed': t('dashboard.timingBedtime'),
                'before_bed': t('dashboard.timingBedtime'),
                custom: t('dashboard.timingCustom'),
              };
              // Chronological order through the day. Keys not in this list
              // sort to the end (alphabetical fallback inside the bucket).
              const TIMING_ORDER = [
                'morning',
                'with-breakfast', 'with_breakfast',
                'before-workout', 'before_workout',
                'after-workout', 'after_workout',
                'with-lunch', 'with_lunch',
                'with-meals', 'with_meals',
                'with-dinner', 'with_dinner',
                'evening',
                'bedtime', 'before-bed', 'before_bed',
                'custom',
              ];
              const orderIndex = (k) => {
                const i = TIMING_ORDER.indexOf(k);
                return i === -1 ? TIMING_ORDER.length : i;
              };
              // Humanize unknown timing keys: replace _/- with spaces and
              // Title Case so a stray "with_snack" renders as "With Snack"
              // instead of "WITH_SNACK".
              const humanizeTiming = (t) => t
                .split(/[_-]/)
                .filter(Boolean)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');

              // Group by timing
              const grouped = supplements.reduce((acc, supp) => {
                const timing = supp.timing || 'custom';
                if (!acc[timing]) acc[timing] = [];
                acc[timing].push(supp);
                return acc;
              }, {});

              const sortedEntries = Object.entries(grouped).sort(
                ([a], [b]) => orderIndex(a) - orderIndex(b) || a.localeCompare(b)
              );

              return sortedEntries.map(([timing, supps]) => {
                const TimingIcon = timingIcons[timing] || Clock;
                return (
                <div key={timing} className="supplement-group">
                  <div className="supplement-group-label">
                    <TimingIcon size={13} />
                    <span>{timingLabels[timing] || humanizeTiming(timing)}</span>
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
                              <span className="supplement-titration-badge active">{t('dashboard.supplementPhaseBadge', { current: titration.currentPhaseIndex + 1, total: titration.totalPhases })}</span>
                            )}
                          </div>
                          {hasExpandableContent && (
                            <button
                              className={`supplement-expand-btn ${isExpanded ? 'expanded' : ''}`}
                              onClick={(e) => toggleSupplementExpanded(supp.id, e)}
                              aria-label={t('dashboard.supplementExpandAriaLabel')}
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
                                    {titration?.currentPhaseIndex === i ? '> ' : ''}{t('dashboard.titrationWeekRange', { start: phase.weekStart, end: phase.weekEnd })}: {phase.dose}
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
                );
              });
            })()}
          </div>
        </div>
      )}

      {nutritionEnabled ? (
      <>
      {/* Quick Actions Grid — nutrition-oriented for full coaching clients. */}
      <h3 className="section-heading">{t('dashboard.quickActionsHeading')}</h3>
      <div className="quick-actions-grid">
        <Link to="/check-in" className="quick-action-card">
          <div className="quick-action-card-icon">
            <ClipboardCheck size={24} />
          </div>
          <span>{t('dashboard.quickActionCheckIn')}</span>
        </Link>
        <Link to="/progress" className="quick-action-card">
          <div className="quick-action-card-icon">
            <TrendingUp size={24} />
          </div>
          <span>{t('dashboard.quickActionProgress')}</span>
        </Link>
        <Link to="/recipes" className="quick-action-card">
          <div className="quick-action-card-icon">
            <ChefHat size={24} />
          </div>
          <span>{t('dashboard.quickActionRecipes')}</span>
        </Link>
        <div className="quick-action-card" onClick={() => setFavoritesModalOpen(true)} style={{ cursor: 'pointer' }}>
          <div className="quick-action-card-icon">
            <Heart size={24} />
          </div>
          <span>{t('dashboard.quickActionFavorites')}</span>
        </div>
        {isModuleVisible('leaderboard') && (
          <Link to="/leaderboard" className="quick-action-card">
            <div className="quick-action-card-icon">
              <Trophy size={24} />
            </div>
            <span>{getLabel('ranks')}</span>
          </Link>
        )}
        <Link to="/settings" className="quick-action-card">
          <div className="quick-action-card-icon">
            <UserCircle size={24} />
          </div>
          <span>{t('dashboard.quickActionProfile')}</span>
        </Link>
      </div>
      </>
      ) : (
      /* ── Workout-only (lite mode) GYM HOME ── */
      <div className="gym-home" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Greeting */}
        <div style={{ margin: '4px 2px 16px' }}>
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
            {t('dashboard.gymGreeting', { name: (clientData?.client_name || '').split(' ')[0] || t('dashboard.gymGreetingFallback') })}
          </h2>
          <p style={{ opacity: 0.6, margin: '4px 0 0', fontSize: 14.5 }}>
            {branding?.brand_welcome_message || t('dashboard.gymGreetingSub')}
          </p>
        </div>

        {/* AI hero card — the headline action */}
        <Link
          to="/workouts"
          state={{ openGenerate: true }}
          style={{
            display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
            background: 'var(--brand-primary, #FF5A1F)', color: 'var(--brand-on-primary, #fff)',
            borderRadius: 16, padding: '18px 16px', marginBottom: 14,
            boxShadow: '0 8px 20px rgba(0,0,0,0.14)',
          }}
        >
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16.5 }}>{t('dashboard.gymAiTitle')}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{t('dashboard.gymAiSub')}</div>
          </div>
          <ChevronRight size={22} style={{ opacity: 0.9 }} />
        </Link>

        {/* Newest gym drop (clothing / supplement promo) — renders nothing
            unless the gym has the Shop module on and an active drop. */}
        <DropsBanner />

        {/* Tiles */}
        <div className="quick-actions-grid">
          <Link to="/workouts" className="quick-action-card">
            <div className="quick-action-card-icon"><Dumbbell size={24} /></div>
            <span>{t('dashboard.gymTodaysWorkout')}</span>
          </Link>
          <Link to="/workouts" state={{ openClub: true }} className="quick-action-card">
            <div className="quick-action-card-icon"><Users size={24} /></div>
            <span>{t('dashboard.quickActionClubWorkouts')}</span>
          </Link>
          <Link to="/progress" className="quick-action-card">
            <div className="quick-action-card-icon"><TrendingUp size={24} /></div>
            <span>{t('dashboard.quickActionProgress')}</span>
          </Link>
          <Link to="/settings" className="quick-action-card">
            <div className="quick-action-card-icon"><UserCircle size={24} /></div>
            <span>{t('dashboard.quickActionProfile')}</span>
          </Link>
        </div>

        {/* Faint branded footer — fills the space below the tiles and reinforces
            the gym's brand. Logo is optional; "Powered by <Gym>" auto-fills from
            the gym's name so every gym gets it with no setup. */}
        {branding?.brand_name && (
          <div style={{
            flex: 1, minHeight: 100, paddingTop: 28, paddingBottom: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            textAlign: 'center', opacity: 0.32,
          }}>
            {branding?.brand_logo_url && (
              <img
                src={branding.brand_logo_url}
                alt=""
                aria-hidden="true"
                style={{ height: 44, maxWidth: 160, objectFit: 'contain' }}
              />
            )}
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              {t('dashboard.gymPoweredBy', { name: branding.brand_name })}
            </div>
          </div>
        )}
      </div>
      )}

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
      {weightProofOpen && (
        <Suspense fallback={null}>
          <WeightProofModal
            isOpen={weightProofOpen}
            onClose={() => setWeightProofOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default Dashboard;
