import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Flame, Target, Clock, Utensils, Coffee, Sun, Moon, Apple, Heart, ClipboardList, RefreshCw, Pencil, Crosshair, BookOpen, X, Plus, Minus, Trash2, Search, Undo2, RotateCcw, ShoppingCart, ChefHat, FileDown, Check, MessageSquare, Mic, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { onAppResume } from '../hooks/useAppLifecycle';

import { useToast } from '../components/Toast';
import VoiceNotePlayer from '../components/VoiceNotePlayer';
import { getDateLocale } from '../utils/dateLocale';
// Build a proxy URL for voice notes that never expires
// Falls back to extracting the storage path from old signed URLs
const getVoiceNoteProxyUrl = (meal) => {
  const path = meal.voice_note_path || extractPathFromSignedUrl(meal.voice_note_url);
  if (!path) return meal.voice_note_url || null;
  return `/.netlify/functions/serve-voice-note?path=${encodeURIComponent(path)}`;
};

// Extract the storage file path from an old Supabase signed URL
const extractPathFromSignedUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    // Supabase signed URL format: .../storage/v1/object/sign/workout-assets/<path>?token=...
    const match = url.match(/\/storage\/v1\/object\/sign\/workout-assets\/([^?]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch (e) { /* ignore */ }
  return null;
};

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

// Strip a "Meal N:" / "Meal N -" prefix that some legacy plans store
// inside the meal name itself. The meal_type / section label already
// orders the cards, so the prefix is redundant in the UI.
const stripMealPrefix = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/^\s*meal\s*\d+\s*[:\-–—]\s*/i, '').trim();
};

// Returns ingredient list as the display name for a meal card.
// If ingredients exist, joins them as a comma-separated string.
// Falls back to meal.name if no ingredients are available.
// Pass a translated fallback string (e.g. t('plansPage.mealFallbackName')) as the second arg.
const getMealDisplayName = (meal, fallback = 'Meal') => {
  if (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
    const joined = meal.ingredients.map(ing => {
      if (typeof ing === 'string') return ing;
      const amount = ing.amount || '';
      const name = ing.name || ing.food || '';
      return amount ? `${name} (${amount})` : name;
    }).join(', ');
    return stripMealPrefix(joined) || fallback;
  }
  return stripMealPrefix(meal.name || meal.title || '') || fallback;
};

// Get today's date in local timezone (NOT UTC)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Plans() {
  const { clientData } = useAuth();
  const { branding, isModuleVisible } = useBranding();
  const { t, language } = useLanguage();
  // Gym members get a VIEW-ONLY meal plan: they can see the coach's plan and
  // its macros, but not the nutrition-tracking actions (log to diary, AI
  // swap/revise/custom) — the gym product has meal plans without tracking.
  // Same gym detection used across the app (diary module off = gym member).
  const isGymMember = !clientData?.is_coach && !isModuleVisible('diary');
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  // Read planId from URL path instead of useParams (component is mounted
  // persistently outside the Router, so useParams wouldn't work)
  const planId = location.pathname.match(/^\/plans\/(.+)/)?.[1];

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

  // Plans list filtering / sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'oldest' | 'calories'

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
  // Day multiplier for the grocery list — 1 = shop for the plan as written,
  // 2+ = multiply every ingredient amount to cover that many repeats
  const [groceryDays, setGroceryDays] = useState(1);
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

  // Picture links that failed to load this session (file no longer
  // exists). Kept in state so cards re-render once a replacement loads.
  const [deadImageUrls, setDeadImageUrls] = useState(() => new Set());

  // Log confirmation modal state
  const [showLogConfirm, setShowLogConfirm] = useState(false);
  const [mealToLog, setMealToLog] = useState(null);

  // Undo state - stores the last changed meal
  const [undoData, setUndoData] = useState(null);

  // Original plan for revert feature
  const [originalPlanData, setOriginalPlanData] = useState(null);

  // Meal prep modal state
  const [showMealPrepModal, setShowMealPrepModal] = useState(false);
  const [mealPrepGuide, setMealPrepGuide] = useState(null); // parsed object, or string (fallback)
  const [mealPrepLoading, setMealPrepLoading] = useState(false);
  // Two-step flow: 'setup' asks the client a few questions, then 'guide' shows
  // the AI-generated, coach-style plan built from those answers.
  const [mealPrepStep, setMealPrepStep] = useState('setup');
  const [mealPrepError, setMealPrepError] = useState(false);
  const [mealPrepSetup, setMealPrepSetup] = useState({
    days: null,               // how many days of the plan to prep (null = whole plan)
    sessions: 1,              // cook sessions per week
    time: 'standard',         // 'quick' | 'standard' | 'allin'
    experience: 'intermediate' // 'beginner' | 'intermediate' | 'advanced'
  });

  // Scroll position is managed centrally by Layout (per-path restoration).

  // Pull-to-refresh: Refresh plans data
  const refreshPlansData = useCallback(async () => {
    if (!clientData?.id) return;

    try {
      const data = await apiGet(`/.netlify/functions/meal-plans?clientId=${clientData.id}`).catch(() => null);
      if (data?.plans) {
        setPlans(data.plans);
        setCache(`plans_full_${clientData.id}`, data.plans);

        // Update selected plan if viewing one (preserve loaded images)
        if (selectedPlan) {
          const updatedPlan = data.plans.find(p => String(p.id) === String(selectedPlan.id));
          if (updatedPlan) {
            setSelectedPlan(prevPlan => {
              if (!prevPlan) return updatedPlan;
              // Preserve loaded images from prevPlan
              const mergedPlanData = { ...updatedPlan.plan_data };
              if (prevPlan.plan_data?.currentPlan) {
                mergedPlanData.currentPlan = prevPlan.plan_data.currentPlan.map((day, dayIdx) => {
                  const freshDay = updatedPlan.plan_data?.currentPlan?.[dayIdx];
                  if (!freshDay) return day;
                  return {
                    ...freshDay,
                    plan: freshDay.plan?.map((meal, mealIdx) => ({
                      ...meal,
                      image_url: day.plan?.[mealIdx]?.image_url || meal.image_url
                    }))
                  };
                });
              } else if (prevPlan.plan_data?.days) {
                mergedPlanData.days = prevPlan.plan_data.days.map((day, dayIdx) => {
                  const freshDay = updatedPlan.plan_data?.days?.[dayIdx];
                  if (!freshDay) return day;
                  return {
                    ...freshDay,
                    plan: freshDay.plan?.map((meal, mealIdx) => ({
                      ...meal,
                      image_url: day.plan?.[mealIdx]?.image_url || meal.image_url
                    }))
                  };
                });
              }
              return { ...updatedPlan, plan_data: mergedPlanData };
            });
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing plans:', err);
    }
  }, [clientData?.id, selectedPlan?.id]);

  // Setup pull-to-refresh
  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshPlansData);

  // Re-fetch plans when app resumes from background
  useEffect(() => {
    const unsub = onAppResume(() => {
      refreshPlansData();
    });
    return () => unsub();
  }, [refreshPlansData]);

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
                // If already viewing this plan, merge fresh data but preserve loaded images
                if (prevPlan && String(prevPlan.id) === String(plan.id)) {
                  // Preserve any loaded meal images from prevPlan while updating other fields
                  const mergedPlanData = { ...plan.plan_data };
                  if (prevPlan.plan_data?.currentPlan) {
                    mergedPlanData.currentPlan = prevPlan.plan_data.currentPlan.map((day, dayIdx) => {
                      const freshDay = plan.plan_data?.currentPlan?.[dayIdx];
                      if (!freshDay) return day;
                      return {
                        ...freshDay,
                        plan: freshDay.plan?.map((meal, mealIdx) => ({
                          ...meal,
                          image_url: day.plan?.[mealIdx]?.image_url || meal.image_url
                        }))
                      };
                    });
                  } else if (prevPlan.plan_data?.days) {
                    // Also handle plans with days structure
                    mergedPlanData.days = prevPlan.plan_data.days.map((day, dayIdx) => {
                      const freshDay = plan.plan_data?.days?.[dayIdx];
                      if (!freshDay) return day;
                      return {
                        ...freshDay,
                        plan: freshDay.plan?.map((meal, mealIdx) => ({
                          ...meal,
                          image_url: day.plan?.[mealIdx]?.image_url || meal.image_url
                        }))
                      };
                    });
                  }
                  return { ...plan, plan_data: mergedPlanData };
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

  // Meal names already sent for on-the-spot generation this session,
  // so a re-render/reload can't kick off the same generation twice
  const imageGenAttemptedRef = useRef(new Set());

  // Apply a { mealName: imageUrl } map onto the currently viewed plan
  const applyImagesToPlan = (imagesByName) => {
    if (!imagesByName || Object.keys(imagesByName).length === 0) return;
    setSelectedPlan(prevPlan => {
      if (!prevPlan) return prevPlan;
      const updatedPlan = { ...prevPlan, plan_data: { ...prevPlan.plan_data } };
      const updatedDays = getPlanDays(prevPlan).map(day => ({
        ...day,
        plan: (day.plan || []).map(meal => ({
          ...meal,
          image_url: imagesByName[meal.name] || meal.image_url
        }))
      }));
      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data.currentPlan = updatedDays;
      } else if (updatedPlan.plan_data.days) {
        updatedPlan.plan_data.days = updatedDays;
      }
      return updatedPlan;
    });
  };

  // Merge found images into the localStorage-backed cache.
  // Null results (no image exists) must NOT be stored — they used to
  // count toward the 50-entry cap and evict real cached images.
  const mergeImagesIntoCache = (imagesByName) => {
    const entries = Object.entries(imagesByName).filter(([, url]) => url);
    if (entries.length === 0) return;
    setMealImages(prev => {
      const newImages = { ...prev };
      entries.forEach(([name, url]) => { newImages[name] = url; });
      // Cap cache at 50 entries to prevent localStorage overflow
      const keys = Object.keys(newImages);
      if (keys.length > 50) {
        keys.slice(0, keys.length - 50).forEach(k => delete newImages[k]);
      }
      try { localStorage.setItem('mealImageCache', JSON.stringify(newImages)); } catch (e) { /* quota exceeded */ }
      return newImages;
    });
  };

  // A plan stores a frozen copy of each picture link, so the link can
  // die later (e.g. the picture was regenerated and the old file
  // removed). When an <img> fails to load, drop the dead link and
  // re-look-up the meal by name so the card heals itself.
  const recoverMealImage = async (mealName, deadUrl, useCheap) => {
    try {
      const resp = await apiPost('/.netlify/functions/meal-image-batch', { mealNames: [mealName] });
      const url = resp?.images?.[mealName];
      if (url && url !== deadUrl) {
        mergeImagesIntoCache({ [mealName]: url });
        applyImagesToPlan({ [mealName]: url });
        return;
      }
      if (imageGenAttemptedRef.current.has(mealName)) return;
      imageGenAttemptedRef.current.add(mealName);
      // If the image library itself points at the dead file, regenerate
      // to replace the broken record; otherwise just generate fresh.
      const gen = await apiPost('/.netlify/functions/meal-image', {
        mealName,
        ...(url === deadUrl && { regenerate: true }),
        ...(useCheap && { cheapModel: true })
      });
      if (gen?.imageUrl && gen.imageUrl !== deadUrl) {
        mergeImagesIntoCache({ [mealName]: gen.imageUrl });
        applyImagesToPlan({ [mealName]: gen.imageUrl });
      }
    } catch (err) {
      console.error('Error recovering meal image:', err);
    }
  };

  const handleMealImageError = (meal) => {
    const deadUrl = meal.image_url;
    if (!deadUrl || deadImageUrls.has(deadUrl)) return;
    setDeadImageUrls(prev => new Set(prev).add(deadUrl));
    // Purge the dead link from the localStorage-backed cache
    setMealImages(prev => {
      const cleaned = { ...prev };
      let changed = false;
      Object.keys(cleaned).forEach(k => {
        if (cleaned[k] === deadUrl) { delete cleaned[k]; changed = true; }
      });
      if (!changed) return prev;
      try { localStorage.setItem('mealImageCache', JSON.stringify(cleaned)); } catch (e) { /* quota exceeded */ }
      return cleaned;
    });
    recoverMealImage(meal.name, deadUrl, meal.useCheapModel);
  };

  // Reusable function to load meal images for a plan.
  // 1) apply locally cached images, 2) batch-look-up the rest,
  // 3) generate any image that doesn't exist anywhere yet. Step 3 is
  // what makes pictures reliably appear: plans saved before the coach's
  // page finished generating, swapped/revised meals, and template plans
  // used to stay blank until the client happened to open Details.
  const loadMealImagesForPlan = async (planToLoad) => {
    if (!planToLoad) return;

    const days = getPlanDays(planToLoad);
    const namesToFetch = new Set();
    const cheapModelByName = {};
    const cachedImageUrls = {};

    // Collect meal names that need fetching AND apply cached images
    days.forEach(day => {
      (day.plan || []).forEach(meal => {
        if (!meal.name) return;
        if (meal.useCheapModel) cheapModelByName[meal.name] = true;
        if (meal.image_url) return; // already has a picture
        if (mealImages[meal.name]) {
          cachedImageUrls[meal.name] = mealImages[meal.name];
        } else {
          namesToFetch.add(meal.name);
        }
      });
    });

    // First, apply any cached images immediately
    applyImagesToPlan(cachedImageUrls);

    // Then look up any missing images (deduped, and chunked so a big
    // plan can't trip the server's 50-name limit and lose everything)
    const mealNames = [...namesToFetch];
    if (mealNames.length === 0) return;

    const missing = [];
    try {
      for (let i = 0; i < mealNames.length; i += 50) {
        const chunk = mealNames.slice(i, i + 50);
        const response = await apiPost('/.netlify/functions/meal-image-batch', { mealNames: chunk });
        const found = {};
        chunk.forEach(name => {
          const url = response?.images?.[name];
          if (url) found[name] = url;
          else missing.push(name);
        });
        mergeImagesIntoCache(found);
        applyImagesToPlan(found);
      }
    } catch (err) {
      // Lookup failed — don't generate anything, we can't tell what's
      // truly missing. The next visit will retry the lookup.
      console.error('Error loading meal images:', err);
      return;
    }

    // Finally, generate images that don't exist anywhere yet. Each one
    // is stored server-side under the meal's normalized name, so this
    // is a one-time cost per unique meal — after that every lookup
    // (this client, other clients, the coach's planner) finds it.
    const toGenerate = missing.filter(name => !imageGenAttemptedRef.current.has(name));
    if (toGenerate.length === 0) return;
    toGenerate.forEach(name => imageGenAttemptedRef.current.add(name));

    const CONCURRENCY = 2;
    let nextIdx = 0;
    const worker = async () => {
      while (nextIdx < toGenerate.length) {
        const name = toGenerate[nextIdx++];
        try {
          const response = await apiPost('/.netlify/functions/meal-image', {
            mealName: name,
            ...(cheapModelByName[name] && { cheapModel: true })
          });
          if (response?.imageUrl) {
            mergeImagesIntoCache({ [name]: response.imageUrl });
            applyImagesToPlan({ [name]: response.imageUrl });
          }
        } catch (err) {
          // Image is optional — leave the card without one this session
          console.error('Error generating meal image:', err);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toGenerate.length) }, worker));
  };

  // Load meal images when plan is selected
  useEffect(() => {
    if (!selectedPlan) return;
    loadMealImagesForPlan(selectedPlan);
  }, [selectedPlan?.id]);

  // Save undo states to localStorage (cap at 10 plans)
  useEffect(() => {
    const states = { ...previousMealStates };
    const keys = Object.keys(states);
    if (keys.length > 10) {
      keys.slice(0, keys.length - 10).forEach(k => delete states[k]);
    }
    try { localStorage.setItem('plannerUndoStates', JSON.stringify(states)); } catch (e) { /* quota exceeded */ }
  }, [previousMealStates]);

  // Store original plan data for revert feature + reset per-plan state.
  // This page stays mounted across navigation, so state tied to one plan
  // (original snapshot, undo data, meal prep guide, grocery checks) must be
  // reset whenever the selected plan changes — otherwise plan A's data leaks
  // into plan B (e.g. Revert would overwrite B with A's original).
  useEffect(() => {
    // Clear state belonging to any previously viewed plan
    setUndoData(null);
    setMealPrepGuide(null);
    setMealPrepStep('setup');
    setMealPrepError(false);
    setMealPrepSetup({ days: null, sessions: 1, time: 'standard', experience: 'intermediate' });

    if (!selectedPlan) {
      setOriginalPlanData(null);
      return;
    }

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

    // Re-load this plan's grocery checklist (persisted per plan id)
    try {
      const checks = localStorage.getItem(`grocery-checks-${selectedPlan.id}`);
      setGroceryChecks(checks ? JSON.parse(checks) : {});
    } catch (e) {
      setGroceryChecks({});
    }
    setGroceryDays(1);
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

    // Calculate actual calories from meals (average per day)
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

    const goalLabels = {
      'lose weight': t('plansPage.goalLoseWeight'),
      'maintain': t('plansPage.goalMaintain'),
      'gain muscle': t('plansPage.goalGainMuscle')
    };
    const goal = planData.goal ? (goalLabels[planData.goal.toLowerCase()] || planData.goal) : '-';
    const summary = planData.summary || null;

    // Get custom plan name if coach provided one. Strip any leading "Meal N:"
    // prefix that sometimes leaks in when a meal description was used as the
    // plan title — keeps the header tight.
    const rawPlanName = plan.plan_name || planData.planName || null;
    const planName = rawPlanName ? stripMealPrefix(rawPlanName) : null;

    return { numDays, calories, goal, summary, planName };
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

  // Pick a cover photo for a plan card from the plan's own meal pictures.
  // Prefers a picture already baked into the plan, then the name-keyed
  // image cache, and skips any link that failed to load this session.
  // Returns null when the plan has no usable picture yet (card shows a
  // food-icon placeholder instead).
  const getPlanCoverImage = (plan) => {
    const days = getPlanDays(plan);
    for (const day of days) {
      for (const meal of (day.plan || [])) {
        const baked = meal.image_url;
        if (baked && !deadImageUrls.has(baked)) return baked;
        const cached = meal.name && mealImages[meal.name];
        if (cached && !deadImageUrls.has(cached)) return cached;
      }
    }
    return null;
  };

  // A cover picture that fails to load is marked dead so the card falls
  // back to the placeholder. (Detail view handles regenerating a fresh one
  // when the plan is opened; the list just needs to not show a broken img.)
  const handleCoverImageError = (url) => {
    if (!url || deadImageUrls.has(url)) return;
    setDeadImageUrls(prev => new Set(prev).add(url));
  };

  // Warm the cover-photo cache for the plans list: look up (never generate)
  // a picture for the first meal of each plan that doesn't already have one,
  // so cards can show real food photos without the client opening each plan.
  useEffect(() => {
    if (!plans || plans.length === 0) return;
    let cancelled = false;

    const namesToLookup = new Set();
    plans.forEach(plan => {
      const days = getPlanDays(plan);
      const firstMeal = (days[0]?.plan || []).find(m => m.name);
      if (!firstMeal) return;
      const baked = firstMeal.image_url;
      if (baked && !deadImageUrls.has(baked)) return; // already has a cover
      if (mealImages[firstMeal.name]) return;         // already cached
      namesToLookup.add(firstMeal.name);
    });

    const names = [...namesToLookup];
    if (names.length === 0) return;

    (async () => {
      try {
        for (let i = 0; i < names.length; i += 50) {
          if (cancelled) return;
          const chunk = names.slice(i, i + 50);
          const response = await apiPost('/.netlify/functions/meal-image-batch', { mealNames: chunk });
          const found = {};
          chunk.forEach(name => {
            const url = response?.images?.[name];
            if (url) found[name] = url;
          });
          if (!cancelled && Object.keys(found).length) mergeImagesIntoCache(found);
        }
      } catch (err) {
        // Covers are optional — a failed lookup just leaves placeholders
        console.error('Error loading plan cover images:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [plans]);

  // Get meal icon
  const getMealIcon = (mealType) => {
    const type = mealType?.toLowerCase() || '';
    if (type.includes('breakfast')) return <Coffee size={18} className="meal-type-icon breakfast" />;
    if (type.includes('lunch')) return <Sun size={18} className="meal-type-icon lunch" />;
    if (type.includes('dinner')) return <Moon size={18} className="meal-type-icon dinner" />;
    if (type.includes('snack')) return <Apple size={18} className="meal-type-icon snack" />;
    return <Utensils size={18} className="meal-type-icon" />;
  };

  // Format date — short weekday helps anchor "when was this assigned"
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(getDateLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(getDateLocale(), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Human-friendly relative time: "2 days ago", "3 weeks ago", etc.
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHr = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHr / 24);
    const diffWeek = Math.round(diffDay / 7);
    const diffMonth = Math.round(diffDay / 30);
    const diffYear = Math.round(diffDay / 365);

    if (diffSec < 60) return t('plansPage.relativeJustNow');
    if (diffMin < 60) return t('plansPage.relativeMinAgo', { n: diffMin });
    if (diffHr < 24) return t('plansPage.relativeHrAgo', { n: diffHr });
    if (diffDay < 7) return diffDay === 1 ? t('plansPage.relativeYesterday') : t('plansPage.relativeDaysAgo', { n: diffDay });
    if (diffWeek < 5) return diffWeek === 1 ? t('plansPage.relativeOneWeekAgo') : t('plansPage.relativeWeeksAgo', { n: diffWeek });
    if (diffMonth < 12) return diffMonth === 1 ? t('plansPage.relativeOneMonthAgo') : t('plansPage.relativeMonthsAgo', { n: diffMonth });
    return diffYear === 1 ? t('plansPage.relativeOneYearAgo') : t('plansPage.relativeYearsAgo', { n: diffYear });
  };

  // Infer descriptive tags from plan name + summary keywords.
  const getPlanTags = (plan, details) => {
    const haystack = `${details.planName || ''} ${details.summary || ''}`.toLowerCase();
    const tags = [];
    if (/no[\s-]?cook/.test(haystack)) tags.push(t('plansPage.tagNoCook'));
    if (/high[\s-]?protein|protein[\s-]?focused/.test(haystack)) tags.push(t('plansPage.tagHighProtein'));
    if (/vegan/.test(haystack)) tags.push(t('plansPage.tagVegan'));
    else if (/vegetarian/.test(haystack)) tags.push(t('plansPage.tagVegetarian'));
    if (/keto|low[\s-]?carb/.test(haystack)) tags.push(t('plansPage.tagLowCarb'));
    if (/mediterranean/.test(haystack)) tags.push(t('plansPage.tagMediterranean'));
    if (/gluten[\s-]?free/.test(haystack)) tags.push(t('plansPage.tagGlutenFree'));
    if (/dairy[\s-]?free/.test(haystack)) tags.push(t('plansPage.tagDairyFree'));
    return tags;
  };

  // Open meal detail modal
  const openMealModal = async (meal, dayIdx, mealIdx) => {
    setSelectedMeal({ ...meal, dayIdx, mealIdx });
    setShowMealModal(true);

    // Reset image state and fetch new image
    setMealImageUrl(meal.image_url || null);

    // If no image_url, try to fetch/generate one
    // Use cheap Flux Schnell model for swapped/revised meals to save on API costs
    if (!meal.image_url) {
      setMealImageLoading(true);
      try {
        const response = await apiPost('/.netlify/functions/meal-image', {
          mealName: meal.name,
          ...(meal.useCheapModel && { cheapModel: true })
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

  // Toggle favorite - optimistic update for instant response
  const handleToggleFavorite = async (meal) => {
    if (!clientData?.id) return;

    const mealKey = `${meal.name}-${meal.type || meal.meal_type}`;
    const isFavorited = favorites.has(mealKey);

    // Optimistic update - update UI immediately
    if (isFavorited) {
      setFavorites(prev => {
        const newSet = new Set(prev);
        newSet.delete(mealKey);
        return newSet;
      });
    } else {
      setFavorites(prev => new Set([...prev, mealKey]));
    }

    // Clear favorites cache so it reloads fresh next time
    if (clientData?.id) {
      sessionStorage.removeItem(`favorites_${clientData.id}`);
    }

    try {
      if (isFavorited) {
        // Remove from favorites - call delete API
        await apiDelete(`/.netlify/functions/toggle-favorite?clientId=${clientData.id}&mealName=${encodeURIComponent(meal.name)}`);
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
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
      // Revert optimistic update on error
      if (isFavorited) {
        setFavorites(prev => new Set([...prev, mealKey]));
      } else {
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(mealKey);
          return newSet;
        });
      }
      showError(t('plansPage.errorToggleFavorite'));
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

      const today = getLocalDateString();

      // Normalize to the four types the Diary groups by (breakfast / lunch /
      // dinner / snack) — anything else (e.g. "meal", "Meal 2") would save
      // fine but never show up in the Diary UI. Unrecognized types → snack.
      const rawMealType = (mealToLog.type || mealToLog.meal_type || '').toLowerCase();
      let normalizedMealType = 'snack';
      if (rawMealType.includes('breakfast')) normalizedMealType = 'breakfast';
      else if (rawMealType.includes('lunch')) normalizedMealType = 'lunch';
      else if (rawMealType.includes('dinner')) normalizedMealType = 'dinner';

      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: normalizedMealType,
        foodName: mealToLog.name,
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: 1,
        calories: mealToLog.calories || 0,
        protein: mealToLog.protein || 0,
        carbs: mealToLog.carbs || 0,
        fat: mealToLog.fat || 0,
        fiber: mealToLog.fiber || null,
        sugar: mealToLog.sugar || null,
        sodium: mealToLog.sodium || null,
        potassium: mealToLog.potassium || null,
        calcium: mealToLog.calcium || null,
        iron: mealToLog.iron || null,
        vitaminC: mealToLog.vitaminC || null,
        cholesterol: mealToLog.cholesterol || null,
        foodSource: 'meal_plan'
      });

      setShowLogConfirm(false);
      setMealToLog(null);
      closeMealModal();
      showSuccess(t('plansPage.successLogMeal'));
    } catch (err) {
      console.error('Error logging meal:', err);
      showError(t('plansPage.errorLogMeal'));
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
      // The UI already shows the change optimistically, so a silent failure
      // looks like a successful save — tell the user it didn't stick.
      showError(t('plansPage.errorSavePlan'));
    }
  };

  // Change meal - generate a different meal with similar macros
  const handleChangeMeal = async (meal) => {
    if (!selectedPlan) return;

    // Save original meal for undo (will only set undoData on success)
    const days = getPlanDays(selectedPlan);
    const originalMeal = JSON.parse(JSON.stringify(days[meal.dayIdx].plan[meal.mealIdx]));

    closeMealModal();
    setProcessingMeal({ dayIdx: meal.dayIdx, mealIdx: meal.mealIdx, action: 'change' });

    try {
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
        mealsPerDay: 1,
        language
      });

      let newMeal = data.success && data.data ? data.data : null;

      if (!newMeal) throw new Error('Invalid response');

      // Ensure meal has required fields
      newMeal.type = newMeal.type || meal.type || meal.meal_type || 'meal';
      newMeal.meal_type = newMeal.type;
      newMeal.name = newMeal.name || 'New Meal';
      // Don't copy old image - it's a different meal now.
      newMeal.image_url = null;
      // Use cheap Flux Schnell model for swapped meals to save on API costs
      newMeal.useCheapModel = true;

      // Update the plan with proper immutable updates
      const updatedPlan = { ...selectedPlan };
      const updatedDays = [...getPlanDays(updatedPlan)];

      // Deep clone the specific day and its plan array to avoid mutation
      updatedDays[meal.dayIdx] = { ...updatedDays[meal.dayIdx] };
      updatedDays[meal.dayIdx].plan = [...updatedDays[meal.dayIdx].plan];
      updatedDays[meal.dayIdx].plan[meal.mealIdx] = newMeal;

      if (updatedPlan.plan_data.currentPlan) {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, currentPlan: updatedDays };
      } else {
        updatedPlan.plan_data = { ...updatedPlan.plan_data, days: updatedDays };
      }

      setSelectedPlan(updatedPlan);
      setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
      await savePlanToDatabase(updatedPlan);

      // Fetch new image for the changed meal
      loadMealImagesForPlan(updatedPlan);

      // Only set undo data after successful change
      setUndoData({
        dayIdx: meal.dayIdx,
        mealIdx: meal.mealIdx,
        meal: originalMeal,
        action: 'change'
      });

    } catch (err) {
      console.error('Change meal error:', err);
      showError(t('plansPage.errorChangeMeal'));
    } finally {
      setProcessingMeal(null);
    }
  };

  // Revise meal - modify with AI based on user request
  const handleReviseMeal = async (meal) => {
    // Save original meal for undo (will only set undoData on success)
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
        mealsPerDay: 1,
        language
      });

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
      // Don't copy old image - meal name may have changed.
      revisedMeal.image_url = null;
      // Use cheap Flux Schnell model for revised meals to save on API costs
      revisedMeal.useCheapModel = true;

      // Use calculated macros from backend, fallback to original if not provided
      revisedMeal.calories = (revisedMeal.calories !== undefined && revisedMeal.calories !== null && revisedMeal.calories > 0)
        ? revisedMeal.calories : meal.calories;
      revisedMeal.protein = (revisedMeal.protein !== undefined && revisedMeal.protein !== null)
        ? revisedMeal.protein : meal.protein;
      revisedMeal.carbs = (revisedMeal.carbs !== undefined && revisedMeal.carbs !== null)
        ? revisedMeal.carbs : meal.carbs;
      revisedMeal.fat = (revisedMeal.fat !== undefined && revisedMeal.fat !== null)
        ? revisedMeal.fat : meal.fat;

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

      // Fetch new image for the revised meal
      loadMealImagesForPlan(updatedPlan);

      // Only set undo data after successful revision
      setUndoData({
        dayIdx: meal.dayIdx,
        mealIdx: meal.mealIdx,
        meal: originalMeal,
        action: 'revise'
      });

    } catch (err) {
      console.error('Revise meal error:', err);
      showError(t('plansPage.errorReviseMeal'));
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
    let fiber = 0, sugar = 0, sodium = 0, potassium = 0, calcium = 0, iron = 0, vitaminC = 0, cholesterol = 0;
    selectedIngredients.forEach(ing => {
      const grams = ing.quantityGrams || ing.quantity;
      const factor = grams / 100;
      calories += ing.caloriesPer100g * factor;
      protein += ing.proteinPer100g * factor;
      carbs += ing.carbsPer100g * factor;
      fat += ing.fatPer100g * factor;
      fiber += (ing.fiberPer100g || 0) * factor;
      sugar += (ing.sugarPer100g || 0) * factor;
      sodium += (ing.sodiumPer100g || 0) * factor;
      potassium += (ing.potassiumPer100g || 0) * factor;
      calcium += (ing.calciumPer100g || 0) * factor;
      iron += (ing.ironPer100g || 0) * factor;
      vitaminC += (ing.vitaminCPer100g || 0) * factor;
      cholesterol += (ing.cholesterolPer100g || 0) * factor;
    });
    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      fiber: Math.round(fiber * 10) / 10,
      sugar: Math.round(sugar * 10) / 10,
      sodium: Math.round(sodium),
      potassium: Math.round(potassium),
      calcium: Math.round(calcium),
      iron: Math.round(iron * 10) / 10,
      vitaminC: Math.round(vitaminC * 10) / 10,
      cholesterol: Math.round(cholesterol)
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

  // Load saved meals from database (coach-level library)
  const loadSavedMeals = async () => {
    if (!clientData?.coach_id) return;
    setSavedMealsLoading(true);
    try {
      const response = await apiGet(`/.netlify/functions/saved-meals?coachId=${clientData.coach_id}`);
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

  // Save meal to coach's library (shared across all clients)
  const saveMealToLibrary = async (mealData) => {
    if (!clientData?.coach_id) return;
    try {
      await apiPost('/.netlify/functions/saved-meals', {
        coachId: clientData.coach_id,
        mealData: mealData
      });
      loadSavedMeals(); // Refresh list
    } catch (err) {
      console.error('Error saving meal to library:', err);
    }
  };

  // Delete saved meal from coach's library
  const deleteSavedMeal = async (mealId) => {
    if (!clientData?.coach_id) return;
    try {
      await apiGet(`/.netlify/functions/saved-meals?mealId=${mealId}&coachId=${clientData.coach_id}&_method=DELETE`);
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
      fiber: meal.fiber,
      sugar: meal.sugar,
      sodium: meal.sodium,
      potassium: meal.potassium,
      calcium: meal.calcium,
      iron: meal.iron,
      vitaminC: meal.vitaminC,
      cholesterol: meal.cholesterol,
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
      showError(t('plansPage.errorNoIngredients'));
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
      fiber: totals.fiber,
      sugar: totals.sugar,
      sodium: totals.sodium,
      potassium: totals.potassium,
      calcium: totals.calcium,
      iron: totals.iron,
      vitaminC: totals.vitaminC,
      cholesterol: totals.cholesterol,
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
      showError(t('plansPage.errorNoNameOrCalories'));
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
    // Detect if the meal name is just raw ingredients (e.g. "50g Oats, 200ml Water, ...")
    // If so, skip showing it as a header to avoid displaying ingredients twice
    const nameIsIngredients = /^\d+\s*(g|oz|ml|cups?|tbsp|tsp|scoop|whole|medium|large|small|slice)/i.test((meal.name || '').trim());
    const header = (!nameIsIngredients && meal.name) ? `📖 ${meal.name}\n\n` : '';

    const ingredients = meal.ingredients?.length
      ? `Ingredients:\n${meal.ingredients.map(i => `• ${typeof i === 'string' ? i : `${i.amount || ''} ${i.name || i}`}`).join('\n')}\n\n`
      : '';
    const rawInstructions = meal.instructions || '';
    const cleanedInstructions = rawInstructions.replace(/^Instructions:\s*/i, '');
    const instructions = cleanedInstructions ? `Instructions:\n${cleanedInstructions}` : 'No recipe available for this meal.';

    alert(header + ingredients + instructions);
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
      showError(t('plansPage.errorUndoMeal'));
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

      // Reload images for the reverted plan
      loadMealImagesForPlan(updatedPlan);

      showSuccess(t('plansPage.successRevertPlan'));
    } catch (err) {
      console.error('Revert error:', err);
      showError(t('plansPage.errorRevertPlan'));
    }
  };

  // Pull a leading amount ("1.5", "1/2", "1 1/2") off an ingredient string
  // so amounts can be added up and scaled. Returns null if there's no
  // leading number (e.g. "salt to taste") — those items are never scaled.
  const parseIngredientAmount = (text) => {
    const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/);
    if (!match) return null;
    const qty = match[1].split(/\s+/).reduce((sum, part) => {
      if (part.includes('/')) {
        const [num, den] = part.split('/');
        return sum + parseFloat(num) / parseFloat(den);
      }
      return sum + parseFloat(part);
    }, 0);
    if (!isFinite(qty) || qty <= 0) return null;
    return { qty, rest: match[2] };
  };

  // "1 cup" scaled to 3 should read "3 cups" — anything not in these maps is
  // left untouched. Units pluralize whenever they lead ("3 cups dry oats");
  // foods only when they're the whole item ("3 bananas", but "12 egg whites")
  const GROCERY_UNIT_PLURALS = {
    cup: 'cups', slice: 'slices', scoop: 'scoops', serving: 'servings',
    piece: 'pieces', clove: 'cloves', can: 'cans', bottle: 'bottles',
    bag: 'bags', packet: 'packets', bar: 'bars'
  };
  const GROCERY_FOOD_PLURALS = {
    egg: 'eggs', banana: 'bananas', apple: 'apples', orange: 'oranges',
    potato: 'potatoes', tortilla: 'tortillas'
  };

  const formatGroceryQty = (qty) => String(Math.round(qty * 100) / 100);

  // Generate grocery list from plan. daysMultiplier scales every parsed
  // amount, e.g. 3 = buy enough to eat this plan three times over.
  const generateGroceryList = (daysMultiplier = 1) => {
    if (!selectedPlan) return {};

    const days = getPlanDays(selectedPlan);
    const grouped = {};

    // Categories for common ingredients
    const categorize = (ingredient) => {
      const ing = ingredient.toLowerCase();
      if (ing.includes('chicken') || ing.includes('beef') || ing.includes('pork') || ing.includes('fish') || ing.includes('salmon') || ing.includes('shrimp') || ing.includes('turkey') || ing.includes('lamb') || ing.includes('steak')) return t('plansPage.groceryCategoryProteins');
      if (ing.includes('milk') || ing.includes('cheese') || ing.includes('yogurt') || ing.includes('butter') || ing.includes('cream') || ing.includes('egg')) return t('plansPage.groceryCategoryDairyEggs');
      if (ing.includes('rice') || ing.includes('pasta') || ing.includes('bread') || ing.includes('oat') || ing.includes('flour') || ing.includes('quinoa') || ing.includes('cereal')) return t('plansPage.groceryCategoryGrainsPasta');
      if (ing.includes('apple') || ing.includes('banana') || ing.includes('orange') || ing.includes('berry') || ing.includes('fruit') || ing.includes('lemon') || ing.includes('lime') || ing.includes('avocado')) return t('plansPage.groceryCategoryFruits');
      if (ing.includes('vegetable') || ing.includes('broccoli') || ing.includes('spinach') || ing.includes('carrot') || ing.includes('onion') || ing.includes('garlic') || ing.includes('tomato') || ing.includes('pepper') || ing.includes('lettuce') || ing.includes('cucumber') || ing.includes('zucchini') || ing.includes('celery') || ing.includes('potato') || ing.includes('sweet potato')) return t('plansPage.groceryCategoryVegetables');
      if (ing.includes('oil') || ing.includes('vinegar') || ing.includes('sauce') || ing.includes('dressing') || ing.includes('ketchup') || ing.includes('mustard') || ing.includes('mayo')) return t('plansPage.groceryCategoryCondimentsOils');
      if (ing.includes('salt') || ing.includes('pepper') || ing.includes('spice') || ing.includes('herb') || ing.includes('basil') || ing.includes('oregano') || ing.includes('cinnamon') || ing.includes('paprika')) return t('plansPage.groceryCategorySpicesSeasonings');
      if (ing.includes('almond') || ing.includes('peanut') || ing.includes('walnut') || ing.includes('nut') || ing.includes('seed')) return t('plansPage.groceryCategoryNutsSeeds');
      return t('plansPage.groceryCategoryOther');
    };

    // Singularize the first word so "cups rice" and "cup rice" group together
    const normalizeKey = (rest) => {
      const words = rest.toLowerCase().trim().split(/\s+/);
      if (words[0] && words[0].length > 3 && words[0].endsWith('s')) {
        words[0] = words[0].slice(0, -1);
      }
      return words.join(' ');
    };

    days.forEach(day => {
      (day.plan || []).forEach(meal => {
        if (meal.ingredients && Array.isArray(meal.ingredients)) {
          meal.ingredients.forEach(ing => {
            const ingStr = (typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`).trim();
            if (!ingStr) return;

            const category = categorize(ingStr);
            if (!grouped[category]) grouped[category] = new Map();

            const parsed = parseIngredientAmount(ingStr);
            const normKey = parsed ? normalizeKey(parsed.rest) : ingStr.toLowerCase();
            const existing = grouped[category].get(normKey);

            if (existing) {
              // Same item in another meal/day — add the amounts together
              if (existing.qty !== null && parsed) existing.qty += parsed.qty;
            } else {
              grouped[category].set(normKey, {
                qty: parsed ? parsed.qty : null,
                rest: parsed ? parsed.rest : null,
                text: ingStr
              });
            }
          });
        }
      });
    });

    // Build display strings, scaling amounts by the day multiplier
    const groceryItems = {};
    Object.entries(grouped).forEach(([category, itemsMap]) => {
      groceryItems[category] = [];
      itemsMap.forEach((item, normKey) => {
        let label = item.text;
        if (item.qty !== null) {
          const total = item.qty * daysMultiplier;
          let rest = item.rest;
          if (total > 1) {
            const words = rest.split(/\s+/);
            const first = words[0]?.toLowerCase();
            const plural = GROCERY_UNIT_PLURALS[first] ||
              (words.length === 1 ? GROCERY_FOOD_PLURALS[first] : undefined);
            if (plural) {
              words[0] = plural;
              rest = words.join(' ');
            }
          }
          label = `${formatGroceryQty(total)} ${rest}`;
        }
        groceryItems[category].push({ key: normKey, label });
      });
    });

    return groceryItems;
  };

  // Toggle grocery item checked — keyed by item name (not list position) so
  // checks survive changing the day count, which only rewrites the amounts
  const toggleGroceryCheck = (itemKey) => {
    setGroceryChecks(prev => {
      const updated = { ...prev, [itemKey]: !prev[itemKey] };
      localStorage.setItem(`grocery-checks-${selectedPlan?.id || planId || 'default'}`, JSON.stringify(updated));
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

  // Open the Meal Prep modal. We no longer auto-generate on open — the client
  // first tells us how they want to prep (days, sessions, time, experience),
  // then we build a guide tailored to those answers. If a guide already exists
  // for this plan, jump straight back to it.
  const handleMealPrep = () => {
    setMealPrepError(false);
    // Default the batch target: a multi-day plan defaults to its own length,
    // a single-day plan defaults to a typical 5-day batch.
    setMealPrepSetup(prev => {
      if (prev.days != null) return prev;
      const distinct = getPlanDays(selectedPlan).length || 1;
      return { ...prev, days: distinct > 1 ? Math.min(distinct, 7) : 5 };
    });
    setMealPrepStep(mealPrepGuide ? 'guide' : 'setup');
    setShowMealPrepModal(true);
  };

  // Turn the model's raw text response into a structured guide object. The
  // backend passes AI text straight through, and the Gemini fallback forces
  // JSON — so we accept JSON in either raw or code-fenced form and extract the
  // outermost object. Returns null when it isn't the shape we expect, so the
  // caller can fall back to plain-text rendering.
  const isGuideShape = (obj) =>
    obj && typeof obj === 'object' &&
    (obj.overview || obj.sessions || obj.storage || obj.assembly || obj.tips);

  // Best-effort repair of a JSON string that got cut off mid-generation:
  // close any open string, then close any still-open brackets/braces in order.
  // Lets a truncated response still render as structured cards.
  const repairTruncatedJson = (str) => {
    const stack = [];
    let inStr = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') stack.pop();
    }
    let fixed = str;
    if (inStr) fixed += '"';
    // Drop a dangling ",  or ": that can't be completed
    fixed = fixed.replace(/,\s*$/, '').replace(/:\s*$/, ': ""');
    while (stack.length) {
      fixed += stack.pop() === '{' ? '}' : ']';
    }
    return fixed;
  };

  const parseMealPrepResponse = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'object') return isGuideShape(raw) ? raw : null;

    let text = String(raw).trim().replace(/```json/gi, '').replace(/```/g, '').trim();
    const first = text.indexOf('{');
    if (first === -1) return null;
    const body = text.slice(first);

    // 1) Try a clean parse of the outermost object.
    const last = body.lastIndexOf('}');
    if (last > 0) {
      try {
        const obj = JSON.parse(body.slice(0, last + 1));
        if (isGuideShape(obj)) return obj;
      } catch { /* fall through to repair */ }
    }
    // 2) Response was cut off — repair and retry so we still get cards.
    try {
      const obj = JSON.parse(repairTruncatedJson(body));
      if (isGuideShape(obj)) return obj;
    } catch { /* give up — caller humanizes the text */ }
    return null;
  };

  // Last-resort: turn a JSON-ish (possibly broken) string into readable prose
  // so the client NEVER sees raw braces/keys. Strips structural punctuation and
  // relabels "key": into a friendly heading.
  const humanizeGuideText = (raw) => {
    let s = String(raw);
    const keyLabels = {
      overview: '', title: '', time: '⏱ ', text: '• ', tip: '↳ ',
      item: '• ', howTo: '', fridge: 'Fridge: ', freezer: 'Freezer: ',
      label: '', sessions: 'Prep sessions', storage: 'Storage guide',
      assembly: 'Daily assembly', tasks: '', tips: 'Coach tips'
    };
    s = s
      .replace(/```json/gi, '').replace(/```/g, '')
      .replace(/"(\w+)"\s*:\s*"([^"]*)"/g, (m, k, v) =>
        k in keyLabels ? `${keyLabels[k]}${v}` : `${v}`)
      .replace(/"(\w+)"\s*:\s*\[/g, (m, k) =>
        k in keyLabels && keyLabels[k] ? `\n${keyLabels[k]}` : '')
      .replace(/"(\w+)"\s*:\s*/g, '')
      .replace(/[{}\[\]]/g, '')
      .replace(/^[\s,]+$/gm, '')
      .replace(/,\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return cleanMealPrepText(s);
  };

  // Flatten a structured (or plain-string) guide into readable text — used by
  // the PDF export and the plain-text fallback so raw JSON braces never show.
  const mealPrepGuideToText = (guide) => {
    if (!guide) return '';
    if (typeof guide === 'string') return cleanMealPrepText(guide);
    const lines = [];
    if (guide.overview) { lines.push(guide.overview, ''); }
    (guide.sessions || []).forEach(s => {
      lines.push(`${s.title || 'Prep session'}${s.time ? ` — ${s.time}` : ''}`);
      (s.tasks || []).forEach(tk => lines.push(`• ${tk.text}${tk.tip ? ` (${tk.tip})` : ''}`));
      lines.push('');
    });
    if ((guide.storage || []).length) {
      lines.push(t('plansPage.mealPrepStorageHeading'));
      guide.storage.forEach(it => lines.push(
        `• ${it.item}: ${it.howTo || ''}${it.fridge ? ` — Fridge: ${it.fridge}` : ''}${it.freezer ? `, Freezer: ${it.freezer}` : ''}`
      ));
      lines.push('');
    }
    if ((guide.assembly || []).length) {
      lines.push(t('plansPage.mealPrepAssemblyHeading'));
      guide.assembly.forEach(a => lines.push(`• ${a.label}: ${a.text}`));
      lines.push('');
    }
    if ((guide.tips || []).length) {
      lines.push(t('plansPage.mealPrepTipsHeading'));
      guide.tips.forEach(tp => lines.push(`• ${tp}`));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  // Generate the meal prep guide from the client's setup answers.
  const generateMealPrepGuide = async () => {
    setMealPrepStep('guide');
    setMealPrepError(false);
    setMealPrepLoading(true);
    try {
      const allDays = getPlanDays(selectedPlan);
      const distinctDays = allDays.length || 1;
      // How many days of FOOD the client wants ready (batch target). For a
      // single-day plan this is how many times to repeat that day; for a
      // multi-day plan it's how far into the plan to prep.
      const targetDays = mealPrepSetup.days || (distinctDays > 1 ? Math.min(distinctDays, 7) : 5);
      const daysToList = distinctDays > 1 ? allDays.slice(0, Math.min(targetDays, distinctDays)) : allDays;

      const mealLines = [];
      daysToList.forEach((day, i) => {
        (day.plan || []).forEach(meal => {
          const ings = (meal.ingredients || [])
            .map(x => (typeof x === 'string' ? x : (x?.name || x?.food || '')))
            .filter(Boolean);
          const dayLabel = distinctDays > 1 ? `Day ${i + 1} ` : '';
          mealLines.push(
            `${dayLabel}${meal.type || meal.meal_type || 'Meal'}: ${meal.name}${ings.length ? ` — ${ings.join(', ')}` : ''}`
          );
        });
      });

      const timeLabel = {
        quick: 'under 1 hour total — keep it fast and minimal',
        standard: '1 to 2 hours',
        allin: '2+ hours and happy to batch-cook everything at once'
      }[mealPrepSetup.time] || '1 to 2 hours';

      const expLabel = {
        beginner: 'a beginner cook — keep steps simple and explain the basics',
        intermediate: 'a comfortable home cook',
        advanced: 'an experienced cook — be efficient and skip the obvious'
      }[mealPrepSetup.experience] || 'a comfortable home cook';

      // Tell the model whether it's scaling one day up, or prepping several
      // distinct days — this is what makes it a real BATCH prep guide.
      const scaleInstruction = distinctDays > 1
        ? `The plan below has ${daysToList.length} distinct day(s) of meals. Help them prep all of them at once.`
        : `The plan below is ONE day of meals. The client wants ${targetDays} days of food from it, so BATCH it: multiply every ingredient by ${targetDays} and tell them the TOTAL amount to cook or buy (e.g. "cook ${targetDays} portions / ~X total"). Portion into ${targetDays} containers.`;

      const prompt = `You are an expert fitness coach writing a personal MEAL PREP GUIDE for one of your clients. Be warm, clear and practical — like a coach who actually cooks.

CLIENT'S PREP SET-UP:
- They want ${targetDays} day(s) of food prepped and ready.
- They want to cook in ${mealPrepSetup.sessions} prep session(s) across the week.
- They have ${timeLabel} per prep session.
- They are ${expLabel}.

BATCHING:
${scaleInstruction}

MEALS TO PREP:
${mealLines.join('\n')}

Build a guide that respects their time, number of sessions and experience. Give real batch quantities so they know how much to cook for ${targetDays} days. Group cooking tasks logically (proteins, carbs, vegetables, sauces). If they chose 2 sessions, split the work sensibly (e.g. a big Sunday cook + a quick mid-week top-up so nothing goes stale).

Keep it TIGHT and COMPLETE: at most 6 tasks per session, one short sentence each, tips one short line, at most 5 storage items and 5 tips. The whole JSON must be finished and valid — never cut off mid-object.

Respond with ONLY valid JSON — no markdown, no code fences, no text before or after. Use EXACTLY this shape:
{
  "overview": "2-3 warm, motivating sentences in a coach's voice about the game plan for the week",
  "sessions": [
    {
      "title": "short name, e.g. Sunday Big Cook",
      "time": "rough time, e.g. 75 min",
      "tasks": [
        { "text": "one clear cooking/prep action", "tip": "short pro tip or the reason — can be an empty string" }
      ]
    }
  ],
  "storage": [
    { "item": "food name", "howTo": "how to store it", "fridge": "e.g. 4 days", "freezer": "e.g. 3 months, or 'Not ideal'" }
  ],
  "assembly": [
    { "label": "Day 1", "text": "quick grab-and-go instructions to assemble that day's meals from what was prepped" }
  ],
  "tips": [ "3 to 5 short, punchy time-saving or flavor tips" ]
}`;

      const response = await apiPost('/.netlify/functions/generate-meal-plan', {
        prompt,
        isJson: false,
        structured: true, // use the clean JSON system prompt, not the markdown one
        language
      }, { timeoutMs: 45000 }); // AI generation is slow — don't abort at the 15s default

      const raw = response?.data;
      const parsed = parseMealPrepResponse(raw);
      if (parsed) {
        setMealPrepGuide(parsed);
      } else if (raw) {
        // Not the expected JSON — render whatever we got as cleaned text so the
        // client still gets a usable guide instead of an error.
        setMealPrepGuide(String(raw));
      } else {
        setMealPrepError(true);
      }
    } catch (err) {
      console.error('Meal prep error:', err);
      setMealPrepError(true);
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

    // Resolve translated strings up-front (t() is available here in the React closure)
    const pdfTitle = t('plansPage.defaultPlanTitle', { numDays });
    const pdfDurationLabel = t('plansPage.pdfDuration');
    const pdfDurationDays = t('plansPage.planCardDurationDays');
    const pdfTargetLabel = t('plansPage.pdfTarget');
    const pdfCalPerDay = t('plansPage.pdfCalPerDay');
    const pdfGoalLabel = t('plansPage.pdfGoal');
    const pdfDailyTargetsLabel = t('plansPage.pdfDailyTargets');
    const pdfProteinUnit = t('plansPage.pdfProteinUnit');
    const pdfCarbsUnit = t('plansPage.pdfCarbsUnit');
    const pdfFatUnit = t('plansPage.pdfFatUnit');
    const pdfMealFallback = t('plansPage.mealFallbackName');
    const pdfCalLabel = t('plansPage.pdfCalLabel');
    const pdfProteinLabel = t('plansPage.pdfProteinLabel');
    const pdfCarbsLabel = t('plansPage.pdfCarbsLabel');
    const pdfFatLabel = t('plansPage.pdfFatLabel');
    const pdfFiberLabel = t('plansPage.pdfFiberLabel');
    const pdfIngredientsLabel = t('plansPage.legacyIngredients');
    const pdfInstructionsLabel = t('plansPage.legacyInstructions');
    const pdfGroceryHeading = t('plansPage.pdfGroceryHeading');
    const pdfGrocerySubheading = t('plansPage.pdfGrocerySubheading');
    const pdfMealPrepHeading = t('plansPage.pdfMealPrepHeading');
    const pdfFooter = t('plansPage.pdfFooter', { brand: branding?.brand_name || 'Ziquecoach' });

    // Create printable content
    let content = `
      <html>
      <head>
        <title>${pdfTitle}</title>
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
        <h1>🍽️ ${pdfTitle}</h1>
        <div class="summary">
          <div class="summary-item"><strong>${pdfDurationLabel}:</strong> ${numDays} ${pdfDurationDays}</div>
          <div class="summary-item"><strong>${pdfTargetLabel}:</strong> ${calories} ${pdfCalPerDay}</div>
          <div class="summary-item"><strong>${pdfGoalLabel}:</strong> ${goal}</div>
        </div>
    `;

    // Add meal days
    days.forEach((day, idx) => {
      content += `<h2>${t('plansPage.dayLabel', { n: idx + 1 })}</h2>`;

      if (day.targets) {
        content += `<p><em>${pdfDailyTargetsLabel}: ${day.targets.calories} ${pdfCalLabel} | ${day.targets.protein}g ${pdfProteinUnit} | ${day.targets.carbs}g ${pdfCarbsUnit} | ${day.targets.fat}g ${pdfFatUnit}</em></p>`;
      }

      (day.plan || []).forEach(meal => {
        content += `
          <div class="meal">
            <div class="meal-name">${meal.type || meal.meal_type || pdfMealFallback}: ${getMealDisplayName(meal)}</div>
            <div class="meal-macros">${meal.calories || 0} ${pdfCalLabel} | ${pdfProteinLabel}: ${meal.protein || 0}g | ${pdfCarbsLabel}: ${meal.carbs || 0}g | ${pdfFatLabel}: ${meal.fat || 0}g${meal.fiber > 0 ? ` | ${pdfFiberLabel}: ${meal.fiber}g` : ''}</div>
            ${meal.ingredients?.length ? `
              <div class="ingredients">
                <strong>${pdfIngredientsLabel}:</strong>
                <ul>
                  ${meal.ingredients.map(ing => `<li>${typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${meal.instructions ? `<p><strong>${pdfInstructionsLabel}:</strong> ${meal.instructions}</p>` : ''}
          </div>
        `;
      });
    });

    // Add grocery list section
    if (Object.keys(groceryList).length > 0) {
      content += `
        <div class="grocery-section">
          <h2>🛒 ${pdfGroceryHeading}</h2>
          <p><em>${pdfGrocerySubheading}</em></p>
      `;

      Object.entries(groceryList).forEach(([category, items]) => {
        content += `
          <div class="grocery-category">
            <h3>${category}</h3>
            <ul>
              ${items.map(item => `<li>${item.label}</li>`).join('')}
            </ul>
          </div>
        `;
      });

      content += `</div>`;
    }

    // Add meal prep guide section if available
    if (mealPrepGuide) {
      const cleanedGuide = mealPrepGuideToText(mealPrepGuide);
      content += `
        <div class="meal-prep-section">
          <h2>👨‍🍳 ${pdfMealPrepHeading}</h2>
          <div class="meal-prep-content">
            ${cleanedGuide.split('\n').filter(line => line.trim()).map(line => `<p>${line}</p>`).join('')}
          </div>
        </div>
      `;
    }

    content += `
        <p style="margin-top: 40px; color: #999; text-align: center;">${pdfFooter}</p>
      </body>
      </html>
    `;

    // Open print dialog
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // window.open returns null when pop-ups are blocked (common in iOS
      // standalone / PWA mode) — bail out instead of crashing.
      showError(t('plansPage.errorPopupBlocked'));
      return;
    }
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
        <h1 className="page-title">{t('plansPage.pageTitle')}</h1>
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
    const { numDays, calories, goal, planName } = getPlanDetails(selectedPlan);

    return (
      <div className="plans-page" ref={bindToContainer}>
        {/* Pull-to-refresh indicator */}
        <PullToRefreshIndicator
          indicatorRef={indicatorRef}
          threshold={threshold}
        />

        {/* Header */}
        <div className="plan-detail-header">
          <button className="back-btn" onClick={handleBackToPlans} aria-label={t('plansPage.backAriaLabel')}>
            <ChevronLeft size={22} />
          </button>
          <div className="plan-detail-title">
            <h1 title={planName || t('plansPage.defaultPlanTitle', { numDays })}>
              {planName || t('plansPage.defaultPlanTitle', { numDays })}
            </h1>
            <div className="plan-detail-meta">
              <span>{formatDate(selectedPlan.created_at)}</span>
              {numDays > 1 && (
                <>
                  <span className="plan-meta-dot">·</span>
                  <span>{t('plansPage.dayCountLabel', { n: numDays })}</span>
                </>
              )}
              <span className="plan-meta-dot">·</span>
              <span>{calories === '-' ? t('plansPage.calDash') : `${Number(calories).toLocaleString()} ${t('plansPage.calSuffix')}`}</span>
              {goal && goal !== '-' && (
                <>
                  <span className="plan-meta-dot">·</span>
                  <span>{goal}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Coach Notes */}
        {selectedPlan.coach_notes && (
          <div className="coach-notes-section">
            <div className="coach-notes-header">
              <MessageSquare size={20} />
              <h3>{t('plansPage.coachMessageHeading')}</h3>
            </div>
            <p className="coach-notes-content">{selectedPlan.coach_notes}</p>
          </div>
        )}

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
                  {t('plansPage.dayLabel', { n: idx + 1 })}
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
          <h2 className="day-title">{t('plansPage.dayLabel', { n: selectedDay + 1 })}</h2>

          {/* Daily Totals - calculated from actual meals, with progress vs target if available */}
          {currentDay.plan && Array.isArray(currentDay.plan) && (() => {
            const totals = currentDay.plan.reduce((acc, meal) => ({
              calories: acc.calories + (meal.calories || 0),
              protein: acc.protein + (meal.protein || 0),
              carbs: acc.carbs + (meal.carbs || 0),
              fat: acc.fat + (meal.fat || 0),
            }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

            const targets = currentDay.targets || {};
            const pct = (actual, target) => {
              if (!target || target <= 0) return null;
              return Math.min(100, Math.round((actual / target) * 100));
            };
            const calPct = pct(totals.calories, targets.calories);

            const renderBox = (cls, actual, target, label) => {
              const p = pct(actual, target);
              return (
                <div className={`target-box ${cls}`}>
                  <div className="target-box-header">
                    <span className="target-dot" aria-hidden="true" />
                    <span className="target-label">{label}</span>
                  </div>
                  <div className="target-box-value">
                    <span className="target-value">{actual}<span className="target-unit">g</span></span>
                    {target > 0 && <span className="target-suffix">/ {target}g</span>}
                  </div>
                  {p !== null && (
                    <div className="target-bar" aria-hidden="true">
                      <div className="target-bar-fill" style={{ width: `${p}%` }} />
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="daily-targets-card">
                <div className="daily-targets-header">
                  <h3 className="daily-targets-title">{t('plansPage.dailyTotalsHeading')}</h3>
                  <span className="daily-targets-cal">
                    <Flame size={14} />
                    {Number(totals.calories).toLocaleString()}
                    {targets.calories > 0 && (
                      <span className="daily-targets-cal-target"> / {Number(targets.calories).toLocaleString()}</span>
                    )}
                    {' '}{t('plansPage.calSuffix')}
                  </span>
                </div>
                {calPct !== null && (
                  <div className="daily-cal-bar" aria-hidden="true">
                    <div className="daily-cal-bar-fill" style={{ width: `${calPct}%` }} />
                  </div>
                )}
                <div className="daily-targets-grid">
                  {renderBox('protein', totals.protein, targets.protein || 0, t('plansPage.macroProtein'))}
                  {renderBox('carbs', totals.carbs, targets.carbs || 0, t('plansPage.macroCarbs'))}
                  {renderBox('fat', totals.fat, targets.fat || 0, t('plansPage.macroFat'))}
                </div>
              </div>
            );
          })()}

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
                        <span>{processingMeal.action === 'change' ? t('plansPage.processingChange') : t('plansPage.processingRevise')}</span>
                      </div>
                    )}

                    {meal.image_url && !deadImageUrls.has(meal.image_url) && (
                      <div className="meal-card-image">
                        <img
                          src={meal.image_url}
                          alt={meal.name}
                          onError={() => handleMealImageError(meal)}
                        />
                      </div>
                    )}
                    <div className="meal-card-content">
                      <div className="meal-card-header">
                        {getMealIcon(meal.meal_type || meal.type)}
                        <span className="meal-card-type">{meal.meal_type || meal.type || t('plansPage.mealFallbackType', { n: idx + 1 })}</span>
                      </div>
                      <h3 className="meal-card-name">{getMealDisplayName(meal, t('plansPage.mealFallbackName'))}</h3>

                      {/* Macros inline */}
                      <div className="meal-macros-inline">
                        {meal.calories && <span className="macro-item">{meal.calories} {t('plansPage.calSuffix')}</span>}
                        {meal.protein && <span className="macro-item">P: {meal.protein}g</span>}
                        {meal.carbs && <span className="macro-item">C: {meal.carbs}g</span>}
                        {meal.fat && <span className="macro-item">F: {meal.fat}g</span>}
                        {meal.fiber > 0 && <span className="macro-item">{t('plansPage.fiberInline')} {meal.fiber}g</span>}
                      </div>

                      {/* Coach Note */}
                      {meal.coach_note && (
                        <div className="meal-coach-note">
                          <span className="meal-coach-note-label">
                            <Pencil size={12} />
                            {t('plansPage.coachNoteLabel')}
                          </span>
                          <span className="meal-coach-note-text">{meal.coach_note}</span>
                        </div>
                      )}

                      {/* Voice Note - uses proxy URL that never expires */}
                      {(meal.voice_note_url || meal.voice_note_path) && (
                        <div
                          className="meal-voice-note"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="meal-voice-note-label">
                            <Mic size={12} />
                            {t('plansPage.voiceNoteLabel')}
                          </span>
                          <VoiceNotePlayer
                            src={getVoiceNoteProxyUrl(meal)}
                            onMissing={(e) => {
                              const container = e.target.closest('.meal-voice-note');
                              if (container) container.style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      <button
                        className="meal-card-details-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isProcessing) openMealModal(meal, selectedDay, idx);
                        }}
                        tabIndex={-1}
                        aria-label={t('plansPage.mealCardDetailsAriaLabel')}
                      >
                        <span>{t('plansPage.mealCardDetails')}</span>
                        <ChevronRight size={16} />
                      </button>
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
                    <h3 className="meal-card-name">{getMealDisplayName(meal, t('plansPage.mealFallbackName'))}</h3>
                    {meal.description && (
                      <p className="meal-card-description">{meal.description}</p>
                    )}
                    {meal.ingredients && meal.ingredients.length > 0 && (
                      <div className="meal-ingredients">
                        <h4>{t('plansPage.legacyIngredients')}</h4>
                        <ul>
                          {meal.ingredients.map((ing, idx) => (
                            <li key={idx}>{typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.name || ing}`}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {meal.instructions && (
                      <div className="meal-instructions">
                        <h4>{t('plansPage.legacyInstructions')}</h4>
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
                      <span className="meal-card-type">{t('plansPage.legacyBreakfast')}</span>
                    </div>
                    <h3 className="meal-card-name">{typeof currentDay.breakfast === 'object' ? getMealDisplayName(currentDay.breakfast, t('plansPage.mealFallbackName')) : currentDay.breakfast}</h3>
                    {currentDay.breakfast.description && <p className="meal-card-description">{currentDay.breakfast.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.lunch && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Sun size={18} className="meal-type-icon lunch" />
                      <span className="meal-card-type">{t('plansPage.legacyLunch')}</span>
                    </div>
                    <h3 className="meal-card-name">{typeof currentDay.lunch === 'object' ? getMealDisplayName(currentDay.lunch, t('plansPage.mealFallbackName')) : currentDay.lunch}</h3>
                    {currentDay.lunch.description && <p className="meal-card-description">{currentDay.lunch.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.dinner && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Moon size={18} className="meal-type-icon dinner" />
                      <span className="meal-card-type">{t('plansPage.legacyDinner')}</span>
                    </div>
                    <h3 className="meal-card-name">{typeof currentDay.dinner === 'object' ? getMealDisplayName(currentDay.dinner, t('plansPage.mealFallbackName')) : currentDay.dinner}</h3>
                    {currentDay.dinner.description && <p className="meal-card-description">{currentDay.dinner.description}</p>}
                  </div>
                </div>
              )}
              {currentDay.snacks && (
                <div className="meal-card">
                  <div className="meal-card-content">
                    <div className="meal-card-header">
                      <Apple size={18} className="meal-type-icon snack" />
                      <span className="meal-card-type">{t('plansPage.legacySnacks')}</span>
                    </div>
                    <h3 className="meal-card-name">
                      {Array.isArray(currentDay.snacks)
                        ? currentDay.snacks.map(s => typeof s === 'object' ? getMealDisplayName(s, t('plansPage.mealFallbackName')) : s).join(', ')
                        : typeof currentDay.snacks === 'object' ? getMealDisplayName(currentDay.snacks, t('plansPage.mealFallbackName')) : currentDay.snacks
                      }
                    </h3>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-day">
              <p>{t('plansPage.noMealsForDay')}</p>
            </div>
          )}
        </div>

        {/* Plan Action Buttons */}
        <div className="plan-action-bar">
          <div className="plan-action-primary">
            <button className="plan-action-btn primary" onClick={() => setShowGroceryModal(true)}>
              <ShoppingCart size={18} />
              <span>{t('plansPage.groceryListBtn')}</span>
            </button>
            <button className="plan-action-btn primary" onClick={handleMealPrep}>
              <ChefHat size={18} />
              <span>{t('plansPage.mealPrepBtn')}</span>
            </button>
          </div>
          <div className="plan-action-secondary">
            <button className="plan-action-btn secondary" onClick={handleDownloadPDF}>
              <FileDown size={16} />
              <span>{t('plansPage.downloadPdfBtn')}</span>
            </button>
            <button className="plan-action-btn secondary revert" onClick={handleRevertToOriginal}>
              <RotateCcw size={16} />
              <span>{t('plansPage.revertBtn')}</span>
            </button>
          </div>
        </div>

        {/* Floating Undo Button */}
        {undoData && (
          <button className="floating-undo-btn" onClick={handleUndoMeal}>
            <Undo2 size={20} />
            <span>{undoData.action === 'change' ? t('plansPage.undoChange') : t('plansPage.undoRevision')}</span>
          </button>
        )}

        {/* Log Confirmation Modal */}
        {showLogConfirm && mealToLog && (
          <div className="log-confirm-overlay" onClick={cancelLogMeal}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <h3>{t('plansPage.logToDiaryHeading')}</h3>
              <p>{t('plansPage.logToDiaryBody', { name: mealToLog.name })}</p>
              <div className="confirm-macros">
                <span>{mealToLog.calories || 0} cal</span>
                <span>P: {mealToLog.protein || 0}g</span>
                <span>C: {mealToLog.carbs || 0}g</span>
                <span>F: {mealToLog.fat || 0}g</span>
              </div>
              <div className="confirm-buttons">
                <button className="confirm-btn cancel" onClick={cancelLogMeal}>{t('plansPage.logCancel')}</button>
                <button
                  className="confirm-btn confirm"
                  onClick={confirmLogMeal}
                  disabled={actionLoading === 'log'}
                >
                  {actionLoading === 'log' ? t('plansPage.logConfirmLoading') : t('plansPage.logConfirm')}
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
                <h2><ShoppingCart size={24} /> {t('plansPage.groceryModalHeading')}</h2>
                <button className="meal-modal-close" onClick={() => setShowGroceryModal(false)}>
                  <X size={24} />
                </button>
              </div>
              {(() => {
                const planDayCount = Math.max(getPlanDays(selectedPlan).length, 1);
                const multiplierOptions = planDayCount === 1 ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4];
                const groceryList = generateGroceryList(groceryDays);
                return (
                  <>
                    <div className="grocery-days-row">
                      <span className="grocery-days-label">{t('plansPage.groceryDaysLabel')}</span>
                      <div className="grocery-days-chips">
                        {multiplierOptions.map(m => {
                          const n = m * planDayCount;
                          return (
                            <button
                              key={m}
                              className={`grocery-day-chip ${groceryDays === m ? 'active' : ''}`}
                              onClick={() => setGroceryDays(m)}
                            >
                              {n === 1 ? t('plansPage.groceryDayOne') : t('plansPage.groceryDaysN', { n })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grocery-content">
                      {Object.entries(groceryList).length === 0 ? (
                        <p className="empty-grocery">{t('plansPage.groceryEmpty')}</p>
                      ) : (
                        Object.entries(groceryList).map(([category, items]) => (
                          <div key={category} className="grocery-category">
                            <h3>{category}</h3>
                            <ul>
                              {items.map((item) => {
                                const key = `${category}|${item.key}`;
                                const isChecked = groceryChecks[key];
                                return (
                                  <li
                                    key={item.key}
                                    className={`grocery-item ${isChecked ? 'checked' : ''}`}
                                    onClick={() => toggleGroceryCheck(key)}
                                  >
                                    <span className="grocery-checkbox">
                                      {isChecked && <Check size={14} />}
                                    </span>
                                    <span className="grocery-text">{item.label}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Meal Prep Modal */}
        {showMealPrepModal && (
          <div className="meal-modal-overlay" onClick={() => setShowMealPrepModal(false)}>
            <div className="meal-prep-modal" onClick={e => e.stopPropagation()}>
              <div className="meal-prep-header">
                <h2><ChefHat size={24} /> {t('plansPage.mealPrepModalHeading')}</h2>
                <button className="meal-modal-close" onClick={() => setShowMealPrepModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="meal-prep-content">
                {mealPrepStep === 'setup' ? (
                  <div className="meal-prep-setup">
                    <p className="meal-prep-setup-intro">{t('plansPage.mealPrepSetupIntro')}</p>

                    {/* How many days of food to batch-prep */}
                    <div className="meal-prep-q">
                      <label>{t('plansPage.mealPrepQDays')}</label>
                      <div className="meal-prep-chips">
                        {[1, 2, 3, 4, 5, 6, 7].map(n => {
                          const selected = mealPrepSetup.days === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              className={`meal-prep-chip ${selected ? 'selected' : ''}`}
                              onClick={() => setMealPrepSetup(prev => ({ ...prev, days: n }))}
                            >
                              {n === 1
                                ? t('plansPage.mealPrepDayCountOne')
                                : t('plansPage.mealPrepDayCount', { count: n })}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cook sessions per week */}
                    <div className="meal-prep-q">
                      <label>{t('plansPage.mealPrepQSessions')}</label>
                      <div className="meal-prep-chips">
                        {[1, 2].map(n => (
                          <button
                            key={n}
                            type="button"
                            className={`meal-prep-chip ${mealPrepSetup.sessions === n ? 'selected' : ''}`}
                            onClick={() => setMealPrepSetup(prev => ({ ...prev, sessions: n }))}
                          >
                            {n === 1 ? t('plansPage.mealPrepSessionsOne') : t('plansPage.mealPrepSessionsTwo')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time available */}
                    <div className="meal-prep-q">
                      <label>{t('plansPage.mealPrepQTime')}</label>
                      <div className="meal-prep-chips">
                        {[
                          { key: 'quick', label: t('plansPage.mealPrepTimeQuick') },
                          { key: 'standard', label: t('plansPage.mealPrepTimeStandard') },
                          { key: 'allin', label: t('plansPage.mealPrepTimeAllIn') }
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            className={`meal-prep-chip ${mealPrepSetup.time === opt.key ? 'selected' : ''}`}
                            onClick={() => setMealPrepSetup(prev => ({ ...prev, time: opt.key }))}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Experience */}
                    <div className="meal-prep-q">
                      <label>{t('plansPage.mealPrepQExperience')}</label>
                      <div className="meal-prep-chips">
                        {[
                          { key: 'beginner', label: t('plansPage.mealPrepExpBeginner') },
                          { key: 'intermediate', label: t('plansPage.mealPrepExpIntermediate') },
                          { key: 'advanced', label: t('plansPage.mealPrepExpAdvanced') }
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            className={`meal-prep-chip ${mealPrepSetup.experience === opt.key ? 'selected' : ''}`}
                            onClick={() => setMealPrepSetup(prev => ({ ...prev, experience: opt.key }))}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button type="button" className="meal-prep-generate-btn" onClick={generateMealPrepGuide}>
                      <ChefHat size={18} /> {t('plansPage.mealPrepGenerateBtn')}
                    </button>
                  </div>
                ) : mealPrepLoading ? (
                  <div className="meal-prep-loading">
                    <div className="meal-image-spinner"></div>
                    <p>{t('plansPage.mealPrepLoading')}</p>
                  </div>
                ) : mealPrepError ? (
                  <div className="meal-prep-error">
                    <p>{t('plansPage.mealPrepErrorBody')}</p>
                    <button type="button" className="meal-prep-generate-btn" onClick={generateMealPrepGuide}>
                      {t('plansPage.mealPrepRetry')}
                    </button>
                  </div>
                ) : mealPrepGuide && typeof mealPrepGuide === 'object' ? (
                  <div className="meal-prep-guide-v2">
                    {mealPrepGuide.overview && (
                      <div className="mp-overview">
                        <ChefHat size={18} />
                        <p>{mealPrepGuide.overview}</p>
                      </div>
                    )}

                    {(mealPrepGuide.sessions || []).map((session, si) => (
                      <div key={si} className="mp-card">
                        <div className="mp-card-head">
                          <h3>{session.title}</h3>
                          {session.time && <span className="mp-time"><Clock size={13} /> {session.time}</span>}
                        </div>
                        <ul className="mp-tasks">
                          {(session.tasks || []).map((task, ti) => (
                            <li key={ti}>
                              <Check size={15} className="mp-check" />
                              <span>
                                {task.text}
                                {task.tip ? <em className="mp-tip">{task.tip}</em> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {(mealPrepGuide.storage || []).length > 0 && (
                      <div className="mp-card">
                        <div className="mp-card-head"><h3>{t('plansPage.mealPrepStorageHeading')}</h3></div>
                        <div className="mp-storage">
                          {mealPrepGuide.storage.map((it, ii) => (
                            <div key={ii} className="mp-storage-row">
                              <div className="mp-storage-item">{it.item}</div>
                              {it.howTo && <div className="mp-storage-how">{it.howTo}</div>}
                              <div className="mp-storage-badges">
                                {it.fridge && <span className="mp-badge fridge">{t('plansPage.mealPrepFridge')} {it.fridge}</span>}
                                {it.freezer && <span className="mp-badge freezer">{t('plansPage.mealPrepFreezer')} {it.freezer}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(mealPrepGuide.assembly || []).length > 0 && (
                      <div className="mp-card">
                        <div className="mp-card-head"><h3>{t('plansPage.mealPrepAssemblyHeading')}</h3></div>
                        <div className="mp-assembly">
                          {mealPrepGuide.assembly.map((a, ai) => (
                            <div key={ai} className="mp-assembly-row">
                              <span className="mp-day-pill">{a.label}</span>
                              <span>{a.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(mealPrepGuide.tips || []).length > 0 && (
                      <div className="mp-card mp-tips-card">
                        <div className="mp-card-head"><h3>{t('plansPage.mealPrepTipsHeading')}</h3></div>
                        <ul className="mp-tips">
                          {mealPrepGuide.tips.map((tip, tii) => (
                            <li key={tii}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button type="button" className="meal-prep-redo-btn" onClick={() => { setMealPrepGuide(null); setMealPrepStep('setup'); }}>
                      <RotateCcw size={15} /> {t('plansPage.mealPrepRedo')}
                    </button>
                  </div>
                ) : mealPrepGuide ? (
                  // Plain-text fallback (model didn't return the expected JSON).
                  // humanizeGuideText strips any JSON syntax so brackets never show.
                  <div className="meal-prep-guide">
                    {humanizeGuideText(mealPrepGuide).split('\n').map((line, idx) => (
                      line.trim() ? <p key={idx}>{line}</p> : null
                    ))}
                    <button type="button" className="meal-prep-redo-btn" onClick={() => { setMealPrepGuide(null); setMealPrepStep('setup'); }}>
                      <RotateCcw size={15} /> {t('plansPage.mealPrepRedo')}
                    </button>
                  </div>
                ) : (
                  <p>{t('plansPage.mealPrepEmpty')}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Meal Action Modal */}
        {showMealModal && selectedMeal && (
          <div className="meal-modal-overlay" onClick={closeMealModal}>
            <div className="meal-modal" onClick={e => e.stopPropagation()}>
              {/* Meal Image - only show if we have one */}
              {mealImageLoading ? (
                <div className="meal-modal-image">
                  <div className="meal-image-loading">
                    <div className="meal-image-spinner"></div>
                    <span>{t('plansPage.imageLoading')}</span>
                  </div>
                </div>
              ) : mealImageUrl ? (
                <div className="meal-modal-image">
                  <img
                    src={mealImageUrl}
                    alt={selectedMeal.name}
                    onError={() => {
                      setMealImageUrl(null);
                      if (selectedMeal) handleMealImageError(selectedMeal);
                    }}
                  />
                </div>
              ) : null}

              {/* Meal Name */}
              <h2 className="meal-modal-name">{selectedMeal.name}</h2>

              {/* Macro Stats - MOVED ABOVE action buttons */}
              <div className="meal-modal-macros">
                <div className="meal-modal-macro">
                  <span className="macro-value">{selectedMeal.calories || 0}</span>
                  <span className="macro-label">{t('plansPage.macroLabelCal')}</span>
                </div>
                <div className="meal-modal-macro protein">
                  <span className="macro-value">{selectedMeal.protein || 0}g</span>
                  <span className="macro-label">{t('plansPage.macroLabelProtein')}</span>
                </div>
                <div className="meal-modal-macro carbs">
                  <span className="macro-value">{selectedMeal.carbs || 0}g</span>
                  <span className="macro-label">{t('plansPage.macroLabelCarbs')}</span>
                </div>
                <div className="meal-modal-macro fat">
                  <span className="macro-value">{selectedMeal.fat || 0}g</span>
                  <span className="macro-label">{t('plansPage.macroLabelFat')}</span>
                </div>
                {selectedMeal.fiber > 0 && (
                  <div className="meal-modal-macro fiber">
                    <span className="macro-value">{selectedMeal.fiber}g</span>
                    <span className="macro-label">{t('plansPage.macroLabelFiber')}</span>
                  </div>
                )}
              </div>

              {/* Micronutrients */}
              {(selectedMeal.sodium > 0 || selectedMeal.potassium > 0 || selectedMeal.calcium > 0 || selectedMeal.iron > 0 || selectedMeal.vitaminC > 0) && (
                <div className="meal-modal-micros">
                  {selectedMeal.sodium > 0 && <span className="micro-item">{t('plansPage.microSodium')} {selectedMeal.sodium}mg</span>}
                  {selectedMeal.potassium > 0 && <span className="micro-item">{t('plansPage.microPotassium')} {selectedMeal.potassium}mg</span>}
                  {selectedMeal.calcium > 0 && <span className="micro-item">{t('plansPage.microCalcium')} {selectedMeal.calcium}mg</span>}
                  {selectedMeal.iron > 0 && <span className="micro-item">{t('plansPage.microIron')} {selectedMeal.iron}mg</span>}
                  {selectedMeal.vitaminC > 0 && <span className="micro-item">{t('plansPage.microVitC')} {selectedMeal.vitaminC}mg</span>}
                  {selectedMeal.cholesterol > 0 && <span className="micro-item">{t('plansPage.microCholesterol')} {selectedMeal.cholesterol}mg</span>}
                </div>
              )}

              {/* Action Buttons Grid */}
              <div className="meal-action-buttons">
                <button
                  className={`meal-action-btn favorite ${favorites.has(`${selectedMeal.name}-${selectedMeal.type || selectedMeal.meal_type}`) ? 'active' : ''}`}
                  onClick={() => handleToggleFavorite(selectedMeal)}
                  disabled={actionLoading === 'favorite'}
                >
                  <Heart size={20} fill={favorites.has(`${selectedMeal.name}-${selectedMeal.type || selectedMeal.meal_type}`) ? 'currentColor' : 'none'} />
                </button>

                {/* Diary logging + AI swap/revise/custom are hidden for gym
                    members: the gym product ships view-only meal plans with no
                    nutrition tracking. Coaching clients keep every action. */}
                {!isGymMember && (
                  <>
                <button
                  className="meal-action-btn log"
                  onClick={() => handleLogMeal(selectedMeal)}
                  disabled={actionLoading === 'log'}
                >
                  <ClipboardList size={18} />
                  <span>{t('plansPage.actionLog')}</span>
                </button>

                <button
                  className="meal-action-btn change"
                  onClick={() => handleChangeMeal(selectedMeal)}
                >
                  <RefreshCw size={18} />
                  <span>{t('plansPage.actionChange')}</span>
                </button>

                <button
                  className="meal-action-btn revise"
                  onClick={() => handleReviseMeal(selectedMeal)}
                >
                  <Pencil size={18} />
                  <span>{t('plansPage.actionRevise')}</span>
                </button>

                <button
                  className="meal-action-btn custom"
                  onClick={() => handleCustomMeal(selectedMeal)}
                >
                  <Crosshair size={18} />
                  <span>{t('plansPage.actionCustom')}</span>
                </button>
                  </>
                )}

                <button
                  className="meal-action-btn recipe"
                  onClick={() => handleViewRecipe(selectedMeal)}
                >
                  <BookOpen size={18} />
                  <span>{t('plansPage.actionRecipe')}</span>
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
                <h2>🎯 {t('plansPage.customMealHeading')}</h2>
                <p>{t('plansPage.customMealSubheading')}</p>
              </div>

              {/* Tabs */}
              <div className="custom-meal-tabs">
                <button
                  className={`custom-meal-tab ${customMealTab === 'calculate' ? 'active' : ''}`}
                  onClick={() => setCustomMealTab('calculate')}
                >
                  <span className="tab-icon">🧮</span>
                  <span className="tab-label">{t('plansPage.tabCalculate')}</span>
                </button>
                <button
                  className={`custom-meal-tab ${customMealTab === 'manual' ? 'active' : ''}`}
                  onClick={() => setCustomMealTab('manual')}
                >
                  <span className="tab-icon">✏️</span>
                  <span className="tab-label">{t('plansPage.tabManual')}</span>
                </button>
                <button
                  className={`custom-meal-tab ${customMealTab === 'saved' ? 'active' : ''}`}
                  onClick={() => { setCustomMealTab('saved'); loadSavedMeals(); }}
                >
                  <span className="tab-icon">📚</span>
                  <span className="tab-label">{t('plansPage.tabSaved')}</span>
                </button>
              </div>

              {/* Calculate Tab */}
              {customMealTab === 'calculate' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">💡 {t('plansPage.calculateHint')}</p>

                  {/* Food Search */}
                  <div className="food-search-container">
                    <div className="food-search-input-wrapper">
                      <Search size={18} className="search-icon" />
                      <input
                        type="text"
                        className="food-search-input"
                        placeholder={t('plansPage.foodSearchPlaceholder')}
                        value={foodSearchQuery}
                        onChange={e => handleFoodSearch(e.target.value)}
                      />
                    </div>

                    {/* Search Results */}
                    {(foodSearchResults.length > 0 || foodSearchLoading) && (
                      <div className="food-search-results">
                        {foodSearchLoading ? (
                          <div className="search-loading">{t('plansPage.searchingFoods')}</div>
                        ) : (
                          foodSearchResults.map((food, idx) => (
                            <div key={idx} className="food-search-item" onClick={() => addIngredient(food)}>
                              <div className="food-name">{food.name}</div>
                              <div className="food-macros">
                                {t('plansPage.foodPer100g', { cal: food.caloriesPer100g, protein: food.proteinPer100g, carbs: food.carbsPer100g, fat: food.fatPer100g })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected Ingredients */}
                  <div className="ingredients-section">
                    <h4>{t('plansPage.selectedIngredientsHeading', { count: selectedIngredients.length })}</h4>
                    {selectedIngredients.length === 0 ? (
                      <p className="no-ingredients">{t('plansPage.noIngredientsYet')}</p>
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
                                inputMode="decimal"
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
                    <h4>📊 {t('plansPage.calculatedTotalsHeading')}</h4>
                    <div className="totals-grid">
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().calories}</span>
                        <span className="total-label">{t('plansPage.totalLabelCalories')}</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().protein}g</span>
                        <span className="total-label">{t('plansPage.totalLabelProtein')}</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().carbs}g</span>
                        <span className="total-label">{t('plansPage.totalLabelCarbs')}</span>
                      </div>
                      <div className="total-item">
                        <span className="total-value">{getCalculatedTotals().fat}g</span>
                        <span className="total-label">{t('plansPage.totalLabelFat')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Meal Name & Instructions */}
                  <div className="form-group">
                    <input
                      type="text"
                      className="custom-meal-input"
                      placeholder={getAutoMealName() || t('plansPage.mealNamePlaceholder')}
                      value={calculatedMealName}
                      onChange={e => setCalculatedMealName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <textarea
                      className="custom-meal-input"
                      placeholder={t('plansPage.cookingInstructionsPlaceholder')}
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
                    <span>💾 {t('plansPage.saveForLaterLabel')}</span>
                  </label>

                  {/* Submit Button */}
                  <button
                    className={`create-meal-btn ${selectedIngredients.length === 0 ? 'disabled' : ''}`}
                    onClick={handleSubmitCalculatedMeal}
                    disabled={selectedIngredients.length === 0}
                  >
                    ✅ {t('plansPage.createMealBtn')}
                  </button>
                </div>
              )}

              {/* Manual Tab */}
              {customMealTab === 'manual' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">💡 {t('plansPage.manualHint')}</p>

                  <div className="form-group">
                    <input
                      type="text"
                      className="custom-meal-input"
                      placeholder={t('plansPage.manualMealNamePlaceholder')}
                      value={customMealData.name}
                      onChange={e => setCustomMealData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="macros-grid">
                    <div className="macro-input-group">
                      <label>{t('plansPage.manualLabelCalories')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={customMealData.calories}
                        onChange={e => setCustomMealData(prev => ({ ...prev, calories: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
                      <label>{t('plansPage.manualLabelProtein')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={customMealData.protein}
                        onChange={e => setCustomMealData(prev => ({ ...prev, protein: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
                      <label>{t('plansPage.manualLabelCarbs')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={customMealData.carbs}
                        onChange={e => setCustomMealData(prev => ({ ...prev, carbs: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="macro-input-group">
                      <label>{t('plansPage.manualLabelFat')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={customMealData.fat}
                        onChange={e => setCustomMealData(prev => ({ ...prev, fat: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <textarea
                      className="custom-meal-input"
                      placeholder={t('plansPage.cookingInstructionsPlaceholder')}
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
                    <span>💾 {t('plansPage.saveForLaterLabel')}</span>
                  </label>

                  {/* Submit Button */}
                  <button
                    className={`create-meal-btn ${!customMealData.name ? 'disabled' : ''}`}
                    onClick={handleSubmitManualMeal}
                    disabled={!customMealData.name}
                  >
                    ✅ {t('plansPage.createMealBtn')}
                  </button>
                </div>
              )}

              {/* Saved Tab */}
              {customMealTab === 'saved' && (
                <div className="custom-meal-panel">
                  <p className="panel-hint">📚 {t('plansPage.savedHint')}</p>

                  {savedMealsLoading ? (
                    <div className="loading-state">{t('plansPage.loadingSavedMeals')}</div>
                  ) : savedMeals.length === 0 ? (
                    <div className="empty-saved">
                      {t('plansPage.noSavedMeals')}
                    </div>
                  ) : (
                    <div className="saved-meals-list">
                      {savedMeals.map(meal => (
                        <div key={meal.id} className="saved-meal-item">
                          <div className="saved-meal-info">
                            <div className="saved-meal-name">{getMealDisplayName(meal, t('plansPage.mealFallbackName'))}</div>
                            <div className="saved-meal-macros">
                              {meal.calories} cal | {meal.protein}g P | {meal.carbs}g C | {meal.fat}g F{meal.fiber > 0 ? ` | ${meal.fiber}g Fiber` : ''}
                            </div>
                          </div>
                          <div className="saved-meal-actions">
                            <button className="use-btn" onClick={() => useSavedMeal(meal.id)}>{t('plansPage.useSavedMealBtn')}</button>
                            <button className="delete-btn" onClick={() => deleteSavedMeal(meal.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button className="cancel-btn-full" onClick={closeCustomModal}>
                    {t('plansPage.cancelBtn')}
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

  // Filter + sort the plans list for display
  const visiblePlans = (() => {
    const q = searchQuery.trim().toLowerCase();
    let list = plans;
    if (q) {
      list = list.filter(p => {
        const d = getPlanDetails(p);
        const haystack = `${d.planName || ''} ${d.summary || ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...list];
    if (sortBy === 'recent') {
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'calories') {
      sorted.sort((a, b) => {
        const ca = getPlanDetails(a).calories;
        const cb = getPlanDetails(b).calories;
        const na = typeof ca === 'number' ? ca : -1;
        const nb = typeof cb === 'number' ? cb : -1;
        return nb - na;
      });
    }
    return sorted;
  })();

  // Plans list view
  return (
    <div className="plans-page" ref={bindToContainer}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      <div className="plans-page-header">
        <h1 className="page-title">{t('plansPage.pageTitle')}</h1>
        {plans.length > 0 && (
          <span className="plans-count-badge">{plans.length}</span>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">📋</div>
          <h3 className="empty-state-title">{t('plansPage.emptyTitle')}</h3>
          <p className="empty-state-text">
            {t('plansPage.emptyText')}
          </p>
        </div>
      ) : (
        <>
          <div className="plans-toolbar">
            <div className="plans-search">
              <Search size={16} className="plans-search-icon" />
              <input
                type="text"
                placeholder={t('plansPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="plans-search-input"
              />
              {searchQuery && (
                <button
                  className="plans-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('plansPage.searchClearAriaLabel')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              className="plans-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label={t('plansPage.sortAriaLabel')}
            >
              <option value="recent">{t('plansPage.sortNewest')}</option>
              <option value="oldest">{t('plansPage.sortOldest')}</option>
              <option value="calories">{t('plansPage.sortCalories')}</option>
            </select>
          </div>

          {visiblePlans.length === 0 ? (
            <div className="plans-no-results">
              <p>{t('plansPage.noResultsText', { query: searchQuery })}</p>
              <button
                className="plans-clear-link"
                onClick={() => setSearchQuery('')}
              >
                {t('plansPage.clearSearchBtn')}
              </button>
            </div>
          ) : (
            <div className="plans-grid">
              {visiblePlans.map((plan, idx) => {
                const details = getPlanDetails(plan);
                const { numDays, calories, goal, summary, planName } = details;
                const tags = getPlanTags(plan, details);
                const isLatest = sortBy === 'recent' && idx === 0 && !searchQuery;
                const showCalories = typeof calories === 'number' && calories > 0;
                const showGoal = goal && goal !== '-';
                const coverImage = getPlanCoverImage(plan);

                return (
                  <div
                    key={plan.id}
                    className="plan-card"
                    onClick={() => handleViewPlan(plan)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleViewPlan(plan);
                      }
                    }}
                  >
                    <div className="plan-card-cover">
                      {coverImage ? (
                        <img
                          src={coverImage}
                          alt=""
                          className="plan-card-cover-img"
                          loading="lazy"
                          onError={() => handleCoverImageError(coverImage)}
                        />
                      ) : (
                        <div className="plan-card-cover-placeholder">
                          <Utensils size={30} strokeWidth={1.5} />
                        </div>
                      )}
                      {isLatest && (
                        <span className="plan-card-badge plan-card-badge-latest plan-card-badge-onCover">{t('plansPage.planCardBadgeLatest')}</span>
                      )}
                    </div>

                    <div className="plan-card-header">
                      <div className="plan-card-title-row">
                        <div className="plan-card-title">
                          {planName || t('plansPage.defaultPlanTitle', { numDays })}
                        </div>
                      </div>
                      <div className="plan-card-date">
                        {getRelativeTime(plan.created_at)}
                      </div>
                    </div>

                    {(tags.length > 0) && (
                      <div className="plan-card-tags">
                        {tags.map(tag => (
                          <span key={tag} className="plan-card-tag">{tag}</span>
                        ))}
                      </div>
                    )}

                    {summary && (
                      <p className="plan-card-summary">{summary}</p>
                    )}

                    <div className="plan-card-details">
                      <div className="plan-detail-item">
                        <span className="plan-detail-label">{t('plansPage.planCardDuration')}</span>
                        <span className="plan-detail-value">
                          {numDays} {numDays === 1 ? t('plansPage.planCardDurationDay') : t('plansPage.planCardDurationDays')}
                        </span>
                      </div>
                      {showCalories && (
                        <div className="plan-detail-item">
                          <span className="plan-detail-label">{t('plansPage.planCardCalories')}</span>
                          <span className="plan-detail-value">{calories} {t('plansPage.planCardCalSuffix')}</span>
                        </div>
                      )}
                      {showGoal && (
                        <div className="plan-detail-item">
                          <span className="plan-detail-label">{t('plansPage.planCardGoal')}</span>
                          <span className="plan-detail-value">{goal}</span>
                        </div>
                      )}
                    </div>

                    <div className="plan-card-footer">
                      <span className="plan-card-cta">
                        {t('plansPage.planCardViewPlan')}
                        <ChevronRight size={16} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Plans;
