import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, Upload, Search, Heart, Loader, Plus, Minus, Check, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete, ensureFreshSession } from '../utils/api';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

// Get today's date in local timezone (NOT UTC)
// Using toISOString().split('T')[0] would give UTC date which is wrong for users in different timezones
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getEntryDate = (selectedDate) => selectedDate || getLocalDateString();

// Image compression utility
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Count-based foods (e.g. servingSize 1 "burger", 2 "tbsp") come back from
// food-search with the piece COUNT stored in the measure's `weight`, plus
// synthetic gram measures (100g/Gram/Ounce) appended by the server. The
// per-100g values for those foods are fabricated from that count as if it
// were grams, so selecting a gram measure explodes the macros (a 530 cal
// burger "weighing" 1 reads as 53,000 cal per 100g). Detect those foods and
// hide the gram-based measures; the food's own serving measure stays correct
// because the same fabricated baseline cancels out in the scaling math.
// Only local sources fabricate weights — Edamam measures are real grams.
const GRAM_BASED_UNITS = ['g', 'gram', 'grams', '100g', 'ml', 'oz', 'ounce', 'ounces'];
const SYNTHETIC_GRAM_LABELS = ['100g', 'gram', 'ounce'];
const isCountBasedFood = (food) => {
  if (!food || !['common', 'recent', 'favorite'].includes(food.source)) return false;
  const baseWeight = food.measures?.[0]?.weight ?? food.servingSize;
  const baseUnit = (food.measures?.[0]?.label || food.servingUnit || '').toLowerCase();
  return baseWeight != null && baseWeight <= 10 && !GRAM_BASED_UNITS.includes(baseUnit);
};
const getSafeMeasures = (food) => {
  const measures = food?.measures;
  if (!Array.isArray(measures) || !isCountBasedFood(food)) return measures;
  const safe = measures.filter(m => !SYNTHETIC_GRAM_LABELS.includes((m.label || '').toLowerCase()));
  return safe.length > 0 ? safe : measures;
};

// Trim a serving amount to a clean display string: 1, 1.5, 3.8, 0.25
// (round to 2 decimals so float math like 0.1+0.2 doesn't show "0.30000004").
const formatServings = (n) => String(Math.round(n * 100) / 100);

// Editable servings control. Lets the client TYPE any amount (e.g. 3.8) instead
// of only tapping the +/- buttons by half a serving. Keeps a local text buffer so
// partial entries ("3." or an empty field) are allowed while typing; the parent
// only ever receives a valid number. Falls back to `min` if the field is left
// blank/invalid on blur. The +/- buttons still nudge by `step` for convenience.
const ServingsStepper = ({ value, onChange, min = 0.1, step = 0.5, iconSize = 18, decrementLabel, incrementLabel }) => {
  const [text, setText] = useState(formatServings(value));

  // Re-sync the field when the value changes from the buttons or a reset,
  // but never overwrite what the user is actively typing.
  useEffect(() => {
    setText(prev => (parseFloat(prev) === value ? prev : formatServings(value)));
  }, [value]);

  const handleType = (raw) => {
    // Allow only digits and a single decimal point while typing.
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
    setText(raw);
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) onChange(Math.round(n * 100) / 100);
  };

  const handleBlur = () => {
    const n = parseFloat(text);
    const clean = (isNaN(n) || n < min) ? min : Math.round(n * 100) / 100;
    onChange(clean);
    setText(formatServings(clean));
  };

  const nudge = (delta) => {
    const base = parseFloat(text);
    const next = Math.max(min, Math.round(((isNaN(base) ? value : base) + delta) * 100) / 100);
    onChange(next);
    setText(formatServings(next));
  };

  return (
    <div className="servings-controls">
      <button type="button" onClick={() => nudge(-step)} aria-label={decrementLabel}><Minus size={iconSize} /></button>
      <input
        type="text"
        inputMode="decimal"
        className="servings-value servings-input"
        value={text}
        onChange={(e) => handleType(e.target.value)}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        aria-label={incrementLabel ? undefined : 'Number of servings'}
      />
      <button type="button" onClick={() => nudge(step)} aria-label={incrementLabel}><Plus size={iconSize} /></button>
    </div>
  );
};

// Meal type selector component
const MealTypeSelector = ({ selected, onChange }) => {
  const { t } = useLanguage();
  const MEAL_LABELS = {
    breakfast: t('foodModals.mealBreakfast'),
    lunch: t('foodModals.mealLunch'),
    dinner: t('foodModals.mealDinner'),
    snack: t('foodModals.mealSnack'),
  };
  return (
    <div className="modal-meal-selector">
      <label>{t('foodModals.addTo')}</label>
      <div className="meal-type-chips">
        {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
          <button
            key={type}
            className={`meal-chip ${selected === type ? 'active' : ''}`}
            onClick={() => onChange(type)}
          >
            {MEAL_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== SNAP PHOTO MODAL ====================
export function SnapPhotoModal({ isOpen, onClose, mealType, clientData, onFoodLogged, selectedDate }) {
  const [previews, setPreviews] = useState([]); // Array of images
  const [details, setDetails] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [servings, setServings] = useState({}); // Track servings per food item { 0: 1, 1: 1.5, ... }
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false); // Ref to prevent duplicate submissions
  const succeededFoodsRef = useRef(new Set()); // Foods already saved to the diary — skipped on retry so they aren't duplicated
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const MAX_PHOTOS = 4;
  const { showError, showSuccess } = useToast();
  const { t, language } = useLanguage();

  // Update selected meal type when prop changes
  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const compressed = await compressImage(file);
    setPreviews(prev => [...prev, compressed].slice(0, MAX_PHOTOS));

    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setResults(null);
  };

  const analyzePhoto = async () => {
    if (previews.length === 0) return;

    setAnalyzing(true);
    setError(null);

    try {
      const data = await apiPost('/.netlify/functions/analyze-food-photo', {
        images: previews, // Send array of images
        details: details || undefined,
        language
      });

      if (data?.foods && data.foods.length > 0) {
        setResults(data.foods);
        succeededFoodsRef.current = new Set(); // Fresh batch — nothing saved yet
        // Initialize servings to 1 for each food item
        const initialServings = {};
        data.foods.forEach((_, idx) => {
          initialServings[idx] = 1;
        });
        setServings(initialServings);
      } else {
        setError(t('foodModals.snapErrNoFood'));
      }
    } catch (err) {
      console.error('Photo analysis error:', err);
      if (err.isTimeout) {
        setError(t('foodModals.snapErrTimeout'));
      } else if (err.isAuthError) {
        setError(t('foodModals.snapErrSession'));
      } else if (err.status === 429) {
        setError(t('foodModals.snapErrTooManyReqs'));
      } else if (err.status === 503 || (err.message && err.message.includes('busy'))) {
        setError(t('foodModals.snapErrBusy'));
      } else {
        setError(t('foodModals.snapErrFailed', { message: err.message || 'Unknown error' }));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteFood = (index) => {
    setResults(prev => prev.filter((_, i) => i !== index));
    setServings(prev => {
      const newServings = {};
      Object.keys(prev).forEach(key => {
        const oldIndex = parseInt(key);
        if (oldIndex < index) {
          newServings[oldIndex] = prev[oldIndex];
        } else if (oldIndex > index) {
          newServings[oldIndex - 1] = prev[oldIndex];
        }
      });
      return newServings;
    });
  };

  const calculateTotal = () => {
    if (!results) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return results.reduce((acc, food, idx) => {
      const foodServings = servings[idx] || 1;
      return {
        calories: acc.calories + (food.calories || 0) * foodServings,
        protein: acc.protein + (food.protein || 0) * foodServings,
        carbs: acc.carbs + (food.carbs || 0) * foodServings,
        fat: acc.fat + (food.fat || 0) * foodServings
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const addAllTooDiary = useCallback(async () => {
    // Use ref to prevent duplicate submissions (more reliable than state)
    if (!results || !clientData?.id || isAddingRef.current) return;

    isAddingRef.current = true;
    setIsAdding(true);
    setError(null);
    const entryDate = getEntryDate(selectedDate);
    let addedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    // Only POST foods that haven't already been saved — after a partial
    // failure, the succeeded ones stay in succeededFoodsRef so tapping
    // "Add all" again retries just the failed ones (no duplicates).
    const pendingFoods = results
      .map((food, idx) => ({ food, idx }))
      .filter(({ food }) => !succeededFoodsRef.current.has(food));

    try {
      // Create all food logging requests in parallel for faster logging
      const logPromises = pendingFoods.map(({ food, idx }) => {
        const foodServings = servings[idx] || 1;
        return apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate,
          mealType: selectedMealType,
          foodName: food.name,
          calories: Math.round(food.calories * foodServings),
          protein: Math.round((food.protein * foodServings) * 10) / 10,
          carbs: Math.round((food.carbs * foodServings) * 10) / 10,
          fat: Math.round((food.fat * foodServings) * 10) / 10,
          fiber: food.fiber != null ? Math.round((food.fiber * foodServings) * 10) / 10 : null,
          sugar: food.sugar != null ? Math.round((food.sugar * foodServings) * 10) / 10 : null,
          sodium: food.sodium != null ? Math.round(food.sodium * foodServings) : null,
          potassium: food.potassium != null ? Math.round(food.potassium * foodServings) : null,
          calcium: food.calcium != null ? Math.round(food.calcium * foodServings) : null,
          iron: food.iron != null ? Math.round((food.iron * foodServings) * 10) / 10 : null,
          vitaminC: food.vitaminC != null ? Math.round(food.vitaminC * foodServings) : null,
          cholesterol: food.cholesterol != null ? Math.round(food.cholesterol * foodServings) : null,
          servingSize: 1,
          servingUnit: 'serving',
          numberOfServings: foodServings,
          foodSource: 'ai_photo'
        });
      });

      // Execute all requests in parallel, tracking which ones succeeded
      const outcomes = await Promise.allSettled(logPromises);
      outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') succeededFoodsRef.current.add(pendingFoods[i].food);
      });

      const failures = outcomes.filter(o => o.status === 'rejected');
      if (failures.length > 0) {
        console.error('Failed to add foods:', failures[0].reason);
        const partialMsg = t('foodModals.toastPartialAddFailed', { failed: failures.length, total: pendingFoods.length });
        setError(partialMsg);
        isAddingRef.current = false; // Reset ref on error to allow retrying the failed ones
        showError(partialMsg);
        return;
      }

      // Calculate totals using the calculateTotal function
      addedTotals = calculateTotal();

      onFoodLogged?.(addedTotals);
      showSuccess(t('foodModals.toastFoodAdded'));
      handleClose();
    } catch (err) {
      console.error('Failed to add foods:', err);
      setError(t('foodModals.snapErrAddFoods'));
      isAddingRef.current = false; // Reset ref on error to allow retry
      showError(t('foodModals.toastAddFailed'));
    } finally {
      setIsAdding(false);
    }
  }, [results, clientData, selectedMealType, servings, onFoodLogged, showError, showSuccess, selectedDate, t]);

  const handleClose = () => {
    setPreviews([]);
    setDetails('');
    setResults(null);
    setServings({});
    setError(null);
    setAnalyzing(false);
    setIsAdding(false);
    isAddingRef.current = false;
    succeededFoodsRef.current = new Set();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('foodModals.snapTitle')}</h2>
          <button className="modal-close" onClick={handleClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {previews.length === 0 ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">{t('foodModals.snapInstructions')}</p>
              <p className="photo-hint">{t('foodModals.snapHint')}</p>
              <div className="photo-buttons">
                <button className="photo-option-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={24} />
                  <span>{t('foodModals.takePhoto')}</span>
                </button>
                <button className="photo-option-btn" onClick={() => uploadRef.current?.click()}>
                  <Upload size={24} />
                  <span>{t('foodModals.upload')}</span>
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : !results ? (
            <div className="photo-preview-section">
              <div className="multi-photo-grid">
                {previews.map((img, idx) => (
                  <div key={idx} className="photo-preview-item">
                    <img src={img} alt={`Preview ${idx + 1}`} className="photo-preview-thumb" />
                    <button className="photo-remove-btn" onClick={() => removePhoto(idx)}>
                      <X size={14} />
                    </button>
                    <span className="photo-number">{idx + 1}</span>
                  </div>
                ))}
                {previews.length < MAX_PHOTOS && (
                  <button className="add-photo-btn" onClick={() => cameraRef.current?.click()}>
                    <Plus size={24} />
                    <span>{t('foodModals.addAngle')}</span>
                  </button>
                )}
              </div>

              <p className="photo-tip">
                {previews.length === 1
                  ? t('foodModals.snapTipOnePhoto')
                  : t('foodModals.snapTipMultiPhoto', { count: previews.length })}
              </p>

              <div className="photo-details-input">
                <label>{t('foodModals.addDetailsLabel')}</label>
                <input
                  type="text"
                  placeholder={t('foodModals.addDetailsPlaceholder')}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </div>
              {error && <div className="modal-error">{error}</div>}
              <div className="photo-actions">
                <button className="btn-secondary" onClick={() => setPreviews([])}>
                  {t('foodModals.startOver')}
                </button>
                <button className="btn-primary" onClick={analyzePhoto} disabled={analyzing}>
                  {analyzing
                    ? <><Loader size={18} className="spin" /> {t('foodModals.analyzing')}</>
                    : previews.length > 1 ? t('foodModals.analyzePhotos') : t('foodModals.analyzePhoto')}
                </button>
              </div>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="photo-results-section">
              <div className="photo-results-header">
                <h3>{t('foodModals.detectedFoods')}</h3>
                <button className="btn-text-danger" onClick={() => { setResults(null); setServings({}); setError(null); succeededFoodsRef.current = new Set(); }}>
                  {t('foodModals.clearAll')}
                </button>
              </div>
              <div className="detected-foods-list">
                {results.map((food, idx) => {
                  const foodServings = servings[idx] || 1;
                  const scaledCalories = Math.round(food.calories * foodServings);
                  const scaledProtein = Math.round((food.protein * foodServings) * 10) / 10;
                  const scaledCarbs = Math.round((food.carbs * foodServings) * 10) / 10;
                  const scaledFat = Math.round((food.fat * foodServings) * 10) / 10;

                  return (
                    <div key={idx} className="detected-food-item-editable">
                      <div className="detected-food-header">
                        <div className="detected-food-name">{food.name}</div>
                        <button className="delete-food-btn" onClick={() => deleteFood(idx)} title={t('foodModals.ariaDeleteFood')}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="detected-food-servings">
                        <label>{t('foodModals.servingsLabel')}</label>
                        <ServingsStepper
                          value={foodServings}
                          onChange={(n) => setServings(prev => ({ ...prev, [idx]: n }))}
                          iconSize={16}
                          decrementLabel={t('foodModals.ariaDecreaseServings')}
                          incrementLabel={t('foodModals.ariaIncreaseServings')}
                        />
                      </div>
                      <div className="detected-food-macros">
                        <span>{scaledCalories} cal</span>
                        <span>{t('foodModals.proteinAbbr')} {scaledProtein}g</span>
                        <span>{t('foodModals.carbsAbbr')} {scaledCarbs}g</span>
                        <span>{t('foodModals.fatAbbr')} {scaledFat}g</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {results.length > 0 && (
                <>
                  <div className="photo-results-total">
                    <strong>{t('foodModals.total')}</strong>
                    <span>{Math.round(calculateTotal().calories)} cal</span>
                  </div>
                  {error && <div className="modal-error">{error}</div>}
                  <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />
                  <button className="btn-primary full-width" onClick={addAllTooDiary} disabled={isAdding}>
                    {isAdding
                      ? <><Loader size={18} className="spin" /> {t('foodModals.adding')}</>
                      : <><Check size={18} /> {t('foodModals.addAllTo', { mealType: selectedMealType })}</>}
                  </button>
                </>
              )}
              {results.length === 0 && (
                <div className="modal-info">
                  {t('foodModals.snapNoFoodsLeft')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== SEARCH FOODS MODAL ====================
export function SearchFoodsModal({ isOpen, onClose, mealType, clientData, onFoodLogged, selectedDate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState(1);
  const [selectedMeasure, setSelectedMeasure] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false); // Ref to prevent duplicate submissions
  const searchTimeout = useRef(null);
  const { showError, showSuccess } = useToast();
  const { t } = useLanguage();

  const searchFood = async (searchQuery) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const data = await apiGet(`/.netlify/functions/food-search?query=${encodeURIComponent(searchQuery)}&clientId=${clientData?.id}`);
      // API returns { results: [...], query: "..." }
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleQueryChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchFood(value), 300);
  };

  const selectFood = (food) => {
    setSelectedFood(food);
    setServings(1);
    setSelectedMeasure(0);
  };

  const getScaledNutrition = () => {
    if (!selectedFood) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

    const measure = getSafeMeasures(selectedFood)?.[selectedMeasure];
    const weight = measure?.weight || selectedFood.servingSize || 100;
    const multiplier = (weight / 100) * servings;

    return {
      calories: Math.round((selectedFood.caloriesPer100g || selectedFood.calories) * multiplier),
      protein: Math.round(((selectedFood.proteinPer100g || selectedFood.protein) * multiplier) * 10) / 10,
      carbs: Math.round(((selectedFood.carbsPer100g || selectedFood.carbs) * multiplier) * 10) / 10,
      fat: Math.round(((selectedFood.fatPer100g || selectedFood.fat) * multiplier) * 10) / 10
    };
  };

  const addTooDiary = useCallback(async () => {
    // Use ref to prevent duplicate submissions (more reliable than state)
    if (!selectedFood || !clientData?.id || isAddingRef.current) return;

    isAddingRef.current = true;
    setIsAdding(true);
    const nutrition = getScaledNutrition();
    const entryDate = getEntryDate(selectedDate);
    const foodToAdd = { ...selectedFood };

    try {
      // Scale micronutrients from per-100g values (same approach as macros) to avoid double-scaling
      const measure = getSafeMeasures(foodToAdd)?.[selectedMeasure];
      const weight = measure?.weight || foodToAdd.servingSize || 100;
      const microMultiplier = (weight / 100) * servings;

      // Use per-100g values if available (Edamam), otherwise fall back to stored values scaled by servings only
      const hasPer100g = foodToAdd.fiberPer100g != null;

      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate,
        mealType: mealType,
        foodName: foodToAdd.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: hasPer100g ? Math.round(foodToAdd.fiberPer100g * microMultiplier * 10) / 10 : (foodToAdd.fiber != null ? Math.round(foodToAdd.fiber * servings * 10) / 10 : null),
        sugar: hasPer100g ? Math.round(foodToAdd.sugarPer100g * microMultiplier * 10) / 10 : (foodToAdd.sugar != null ? Math.round(foodToAdd.sugar * servings * 10) / 10 : null),
        sodium: hasPer100g ? Math.round(foodToAdd.sodiumPer100g * microMultiplier) : (foodToAdd.sodium != null ? Math.round(foodToAdd.sodium * servings) : null),
        potassium: hasPer100g ? Math.round(foodToAdd.potassiumPer100g * microMultiplier) : (foodToAdd.potassium != null ? Math.round(foodToAdd.potassium * servings) : null),
        calcium: hasPer100g ? Math.round(foodToAdd.calciumPer100g * microMultiplier) : (foodToAdd.calcium != null ? Math.round(foodToAdd.calcium * servings) : null),
        iron: hasPer100g ? Math.round(foodToAdd.ironPer100g * microMultiplier * 10) / 10 : (foodToAdd.iron != null ? Math.round(foodToAdd.iron * servings * 10) / 10 : null),
        vitaminC: hasPer100g ? Math.round(foodToAdd.vitaminCPer100g * microMultiplier) : (foodToAdd.vitaminC != null ? Math.round(foodToAdd.vitaminC * servings) : null),
        cholesterol: hasPer100g ? Math.round(foodToAdd.cholesterolPer100g * microMultiplier) : (foodToAdd.cholesterol != null ? Math.round(foodToAdd.cholesterol * servings) : null),
        servingSize: measure?.weight || 100,
        servingUnit: measure?.label || 'g',
        numberOfServings: servings,
        foodSource: 'search'
      });

      onFoodLogged?.(nutrition);
      showSuccess(t('foodModals.toastFoodAdded'));
      handleClose();
    } catch (err) {
      console.error('Failed to add food:', err);
      isAddingRef.current = false; // Reset ref on error to allow retry
      showError(t('foodModals.toastAddFailed'));
    } finally {
      setIsAdding(false);
    }
  }, [selectedFood, clientData, mealType, servings, selectedMeasure, onFoodLogged, showError, showSuccess, selectedDate, t]);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setServings(1);
    setIsAdding(false);
    isAddingRef.current = false;
    onClose();
  };

  if (!isOpen) return null;

  const nutrition = getScaledNutrition();
  const safeMeasures = getSafeMeasures(selectedFood);
  const countBased = isCountBasedFood(selectedFood);

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('foodModals.searchTitle')}</h2>
          <button className="modal-close" onClick={handleClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {!selectedFood ? (
            <>
              <div className="search-input-wrapper">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder={t('foodModals.searchPlaceholder')}
                  value={query}
                  onChange={handleQueryChange}
                  autoFocus
                />
              </div>

              {searching ? (
                <div className="search-loading">
                  <Loader size={24} className="spin" />
                  <span>{t('foodModals.searching')}</span>
                </div>
              ) : results.length > 0 ? (
                <div className="search-results">
                  {results.map((food, idx) => (
                    <div key={idx} className="search-result-item" onClick={() => selectFood(food)}>
                      <div className="search-result-name">{food.name}</div>
                      {food.brand && <div className="search-result-brand">{food.brand}</div>}
                      <div className="search-result-macros">
                        <span>{food.calories} cal</span>
                        <span>P: {food.protein}g</span>
                        <span>C: {food.carbs}g</span>
                        <span>F: {food.fat}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : query.length >= 2 ? (
                <div className="search-empty">{t('foodModals.noFoodsFound', { query })}</div>
              ) : (
                <div className="search-empty">{t('foodModals.typeToSearch')}</div>
              )}
            </>
          ) : (
            <div className="food-detail-section">
              <button className="back-link" onClick={() => setSelectedFood(null)}>
                {t('foodModals.backToSearch')}
              </button>

              <h3 className="food-detail-name">{selectedFood.name}</h3>
              {selectedFood.brand && <p className="food-detail-brand">{selectedFood.brand}</p>}

              <div className="serving-selector">
                <label>{t('foodModals.servingSize')}</label>
                {safeMeasures && safeMeasures.length > 0 ? (
                  <select
                    value={selectedMeasure}
                    onChange={(e) => setSelectedMeasure(Number(e.target.value))}
                  >
                    {safeMeasures.map((m, idx) => (
                      <option key={idx} value={idx}>
                        {countBased || m.weight == null ? m.label : `${m.label} (${m.weight}g)`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="serving-default">{selectedFood.servingSize || 100}g</span>
                )}
              </div>

              <div className="servings-adjuster">
                <label>{t('foodModals.numberOfServings')}</label>
                <ServingsStepper
                  value={servings}
                  onChange={setServings}
                  decrementLabel={t('foodModals.ariaDecreaseServings')}
                  incrementLabel={t('foodModals.ariaIncreaseServings')}
                />
              </div>

              <div className="nutrition-preview">
                <div className="nutrition-item calories">
                  <span className="nutrition-value">{nutrition.calories}</span>
                  <span className="nutrition-label">{t('foodModals.nutritionCalories')}</span>
                </div>
                <div className="nutrition-item protein">
                  <span className="nutrition-value">{nutrition.protein}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionProtein')}</span>
                </div>
                <div className="nutrition-item carbs">
                  <span className="nutrition-value">{nutrition.carbs}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionCarbs')}</span>
                </div>
                <div className="nutrition-item fat">
                  <span className="nutrition-value">{nutrition.fat}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionFat')}</span>
                </div>
              </div>

              <button className="btn-primary full-width" onClick={addTooDiary} disabled={isAdding}>
                {isAdding
                  ? <><Loader size={18} className="spin" /> {t('foodModals.adding')}</>
                  : t('foodModals.addToMealType', { mealType })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== FAVORITES MODAL ====================
export function FavoritesModal({ isOpen, onClose, mealType, clientData, onFoodLogged, selectedDate }) {
  // Load from cache for instant display
  const getCachedFavorites = () => {
    if (!clientData?.id) return [];
    try {
      const cached = sessionStorage.getItem(`favorites_${clientData.id}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  const [favorites, setFavorites] = useState(getCachedFavorites);
  const [loading, setLoading] = useState(!getCachedFavorites().length);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [addingId, setAddingId] = useState(null);
  const [confirmFavorite, setConfirmFavorite] = useState(null);
  const [search, setSearch] = useState('');
  const addingRef = useRef(false); // Ref to prevent duplicate submissions
  const { showError, showSuccess } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  useEffect(() => {
    if (isOpen && clientData?.id) {
      setSearch('');
      // Load from cache first for instant display
      const cached = getCachedFavorites();
      if (cached.length > 0) {
        setFavorites(cached);
        setLoading(false);
      }
      // Always fetch fresh data in background
      loadFavorites(!cached.length);
    }
  }, [isOpen, clientData?.id]);

  const loadFavorites = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await apiGet(`/.netlify/functions/toggle-favorite?clientId=${clientData.id}`);
      const newFavorites = data?.favorites || [];
      setFavorites(newFavorites);
      // Cache the results
      sessionStorage.setItem(`favorites_${clientData.id}`, JSON.stringify(newFavorites));
    } catch (err) {
      console.error('Failed to load favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const addFavorite = useCallback(async (favorite) => {
    // Use ref to prevent duplicate submissions (more reliable than state)
    if (addingRef.current) return;

    addingRef.current = true;
    setAddingId(favorite.id);
    const entryDate = getEntryDate(selectedDate);

    try {
      await ensureFreshSession();
      // Add each food item from the favorite meal
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate,
        mealType: selectedMealType,
        foodName: favorite.meal_name,
        calories: favorite.calories,
        protein: favorite.protein,
        carbs: favorite.carbs,
        fat: favorite.fat,
        fiber: favorite.fiber,
        sugar: favorite.sugar,
        sodium: favorite.sodium,
        potassium: favorite.potassium,
        calcium: favorite.calcium,
        iron: favorite.iron,
        vitaminC: favorite.vitaminC || favorite.vitamin_c,
        cholesterol: favorite.cholesterol,
        servingSize: 1,
        servingUnit: 'meal',
        numberOfServings: 1,
        foodSource: 'favorite'
      });

      // Bump this favorite to the top ("most recently used"). Non-critical:
      // the diary entry is already saved, so failure here just means the
      // order won't update — never surface an error for it.
      apiPut('/.netlify/functions/toggle-favorite', { favoriteId: favorite.id }).catch(() => {});
      const reordered = [
        { ...favorite, last_used_at: new Date().toISOString() },
        ...favorites.filter(f => f.id !== favorite.id)
      ];
      setFavorites(reordered);
      if (clientData?.id) {
        sessionStorage.setItem(`favorites_${clientData.id}`, JSON.stringify(reordered));
      }

      onFoodLogged?.({
        calories: favorite.calories,
        protein: favorite.protein,
        carbs: favorite.carbs,
        fat: favorite.fat
      });
      showSuccess(t('foodModals.toastFoodAdded'));
      addingRef.current = false;
      onClose();
    } catch (err) {
      console.error('Failed to add favorite:', err);
      addingRef.current = false; // Reset ref on error to allow retry
      showError(t('foodModals.toastAddFailed'));
    } finally {
      setAddingId(null);
    }
  }, [clientData, selectedMealType, onFoodLogged, onClose, showError, showSuccess, selectedDate, favorites, t]);

  const deleteFavorite = async (favoriteId, e) => {
    e.stopPropagation();
    if (!confirm(t('foodModals.confirmDeleteFavorite'))) return;

    // Optimistic update
    const previousFavorites = favorites;
    const newFavorites = favorites.filter(f => f.id !== favoriteId);
    setFavorites(newFavorites);

    // Update cache
    if (clientData?.id) {
      sessionStorage.setItem(`favorites_${clientData.id}`, JSON.stringify(newFavorites));
    }

    try {
      await apiDelete(`/.netlify/functions/toggle-favorite?favoriteId=${favoriteId}`);
    } catch (err) {
      console.error('Failed to delete favorite:', err);
      // Revert on error
      setFavorites(previousFavorites);
      if (clientData?.id) {
        sessionStorage.setItem(`favorites_${clientData.id}`, JSON.stringify(previousFavorites));
      }
    }
  };

  if (!isOpen) return null;

  const query = search.trim().toLowerCase();
  const filteredFavorites = query
    ? favorites.filter(f => (f.meal_name || '').toLowerCase().includes(query))
    : favorites;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content favorites-modal" onClick={e => e.stopPropagation()}>
        <div className="sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header">
          <h2>{t('foodModals.favoritesTitle')}</h2>
          <button className="modal-close" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />
          {loading ? (
            <div className="favorites-loading">
              <Loader size={24} className="spin" />
              <span>{t('foodModals.loadingFavorites')}</span>
            </div>
          ) : favorites.length === 0 ? (
            <div className="favorites-empty">
              <Heart size={48} className="empty-icon" />
              <h3>{t('foodModals.noFavoritesYet')}</h3>
              <p>{t('foodModals.noFavoritesHint')}</p>
            </div>
          ) : (
            <>
              <div className="search-input-wrapper">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder={t('foodModals.searchFavoritesPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filteredFavorites.length === 0 ? (
                <div className="favorites-empty">
                  <Heart size={48} className="empty-icon" />
                  <h3>{t('foodModals.noFavoritesMatch')}</h3>
                  <p>{t('foodModals.noFavoritesMatchHint', { search: search.trim() })}</p>
                </div>
              ) : (
                <div className="favorites-list">
                  {filteredFavorites.map((fav) => {
                const cal = Math.round(fav.calories || 0);
                const p = Math.round(fav.protein || 0);
                const c = Math.round(fav.carbs || 0);
                const f = Math.round(fav.fat || 0);
                return (
                  <div
                    key={fav.id}
                    className="favorite-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setConfirmFavorite(fav)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirmFavorite(fav); } }}
                  >
                    <div className="favorite-info">
                      <div className="favorite-name">{fav.meal_name}</div>
                      <div className="favorite-meta">
                        <span className="favorite-cal">{cal} cal</span>
                        {fav.meal_type && (
                          <span className="favorite-type-badge">{fav.meal_type}</span>
                        )}
                      </div>
                      <div className="favorite-macros">
                        <span className="macro macro-protein"><span className="macro-dot" />P {p}g</span>
                        <span className="macro macro-carbs"><span className="macro-dot" />C {c}g</span>
                        <span className="macro macro-fat"><span className="macro-dot" />F {f}g</span>
                      </div>
                    </div>
                    <div className="favorite-actions">
                      <button
                        className="favorite-delete-btn"
                        aria-label={t('foodModals.ariaDeleteFavorite')}
                        onClick={(e) => deleteFavorite(fav.id, e)}
                      >
                        <Trash2 size={16} />
                      </button>
                      <span className="favorite-add-cue" aria-hidden="true">
                        <Plus size={18} />
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

        {confirmFavorite && (
          <div className="add-confirm-overlay" onClick={() => setConfirmFavorite(null)}>
            <div className="add-confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="add-confirm-icon">
                <Plus size={32} />
              </div>
              <h3>{t('foodModals.confirmAddToMeal', { mealType: selectedMealType.charAt(0).toUpperCase() + selectedMealType.slice(1) })}</h3>
              <p>{t('foodModals.confirmAddBody', { name: confirmFavorite.meal_name, calories: confirmFavorite.calories })}</p>
              <div className="add-confirm-actions">
                <button className="add-cancel-btn" onClick={() => setConfirmFavorite(null)}>
                  {t('foodModals.cancelBtn')}
                </button>
                <button
                  className="add-confirm-btn"
                  disabled={addingId === confirmFavorite.id}
                  onClick={() => {
                    addFavorite(confirmFavorite);
                    setConfirmFavorite(null);
                  }}
                >
                  {addingId === confirmFavorite.id ? <Loader size={16} className="spin" /> : t('foodModals.confirmAddBtn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SCAN LABEL MODAL ====================
export function ScanLabelModal({ isOpen, onClose, mealType, clientData, onFoodLogged, selectedDate }) {
  const [previews, setPreviews] = useState([]); // Array of images
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [servings, setServings] = useState(1);
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false); // Ref to prevent duplicate submissions
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const MAX_PHOTOS = 4;
  const { showError, showSuccess } = useToast();
  const { t, language } = useLanguage();

  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const compressed = await compressImage(file);
    setPreviews(prev => [...prev, compressed].slice(0, MAX_PHOTOS));

    // Reset file input so same file can be selected again
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const analyzeLabel = async () => {
    if (previews.length === 0) return;

    setAnalyzing(true);
    setError(null);

    try {
      const data = await apiPost('/.netlify/functions/analyze-nutrition-label', {
        images: previews, // Send array of images
        language
      });

      if (data?.calories !== undefined) {
        setResult(data);
        setServings(1);
      } else {
        setError(t('foodModals.scanErrNoLabel'));
      }
    } catch (err) {
      console.error('Label analysis error:', err);
      if (err.isTimeout) {
        setError(t('foodModals.scanErrTimeout'));
      } else if (err.isAuthError) {
        setError(t('foodModals.scanErrSession'));
      } else if (err.status === 429) {
        setError(t('foodModals.scanErrTooManyReqs'));
      } else if (err.status === 503 || (err.message && err.message.includes('busy'))) {
        setError(t('foodModals.scanErrBusy'));
      } else {
        setError(t('foodModals.scanErrFailed', { message: err.message || 'Unknown error' }));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const getScaledNutrition = () => {
    if (!result) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return {
      calories: Math.round(result.calories * servings),
      protein: Math.round((result.protein * servings) * 10) / 10,
      carbs: Math.round((result.carbs * servings) * 10) / 10,
      fat: Math.round((result.fat * servings) * 10) / 10
    };
  };

  const addTooDiary = useCallback(async () => {
    // Use ref to prevent duplicate submissions (more reliable than state)
    if (!result || !clientData?.id || isAddingRef.current) return;

    isAddingRef.current = true;
    setIsAdding(true);
    const nutrition = getScaledNutrition();
    const entryDate = getEntryDate(selectedDate);
    const resultToAdd = { ...result };

    try {
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate,
        mealType: selectedMealType,
        foodName: resultToAdd.name || 'Scanned Food',
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: resultToAdd.fiber != null ? Math.round(resultToAdd.fiber * servings * 10) / 10 : null,
        sugar: resultToAdd.sugar != null ? Math.round(resultToAdd.sugar * servings * 10) / 10 : null,
        sodium: resultToAdd.sodium != null ? Math.round(resultToAdd.sodium * servings) : null,
        potassium: resultToAdd.potassium != null ? Math.round(resultToAdd.potassium * servings) : null,
        calcium: resultToAdd.calcium != null ? Math.round(resultToAdd.calcium * servings) : null,
        iron: resultToAdd.iron != null ? Math.round(resultToAdd.iron * servings * 10) / 10 : null,
        vitaminC: resultToAdd.vitaminC != null ? Math.round(resultToAdd.vitaminC * servings) : null,
        cholesterol: resultToAdd.cholesterol != null ? Math.round(resultToAdd.cholesterol * servings) : null,
        servingSize: resultToAdd.servingSize || 1,
        servingUnit: resultToAdd.servingUnit || 'serving',
        numberOfServings: servings,
        foodSource: 'nutrition_label'
      });

      onFoodLogged?.(nutrition);
      showSuccess(t('foodModals.toastFoodAdded'));
      handleClose();
    } catch (err) {
      console.error('Food diary error:', err);
      const errorMessage = err?.response?.data?.error || err?.message || t('foodModals.scanErrAddFood');
      setError(errorMessage);
      isAddingRef.current = false; // Reset ref on error to allow retry
      showError(t('foodModals.toastAddFailed'));
    } finally {
      setIsAdding(false);
    }
  }, [result, clientData, selectedMealType, servings, onFoodLogged, showError, showSuccess, selectedDate, t]);

  const handleClose = () => {
    setPreviews([]);
    setResult(null);
    setServings(1);
    setError(null);
    setAnalyzing(false);
    isAddingRef.current = false;
    setIsAdding(false);
    onClose();
  };

  if (!isOpen) return null;

  const nutrition = getScaledNutrition();

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('foodModals.scanTitle')}</h2>
          <button className="modal-close" onClick={handleClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {previews.length === 0 ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">{t('foodModals.scanInstructions')}</p>
              <p className="photo-hint">{t('foodModals.scanHint')}</p>
              <div className="photo-buttons">
                <button className="photo-option-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={24} />
                  <span>{t('foodModals.takePhoto')}</span>
                </button>
                <button className="photo-option-btn" onClick={() => uploadRef.current?.click()}>
                  <Upload size={24} />
                  <span>{t('foodModals.upload')}</span>
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : analyzing ? (
            <div className="scan-analyzing">
              <div className="multi-photo-preview">
                {previews.map((img, idx) => (
                  <img key={idx} src={img} alt={`Preview ${idx + 1}`} className="photo-preview-thumb" />
                ))}
              </div>
              <div className="analyzing-indicator">
                <Loader size={24} className="spin" />
                <span>{previews.length > 1 ? t('foodModals.readingLabels') : t('foodModals.readingLabel')}</span>
              </div>
            </div>
          ) : result ? (
            <div className="scan-results-section">
              <h3 className="food-detail-name">{result.name || t('foodModals.scannedFoodFallback')}</h3>
              {(result.servingSize || result.servingUnit) && (
                <p className="serving-info">{t('foodModals.servingInfo', { size: result.servingSize, unit: result.servingUnit })}</p>
              )}

              <div className="servings-adjuster">
                <label>{t('foodModals.numberOfServings')}</label>
                <ServingsStepper
                  value={servings}
                  onChange={setServings}
                  decrementLabel={t('foodModals.ariaDecreaseServings')}
                  incrementLabel={t('foodModals.ariaIncreaseServings')}
                />
              </div>

              <div className="nutrition-preview">
                <div className="nutrition-item calories">
                  <span className="nutrition-value">{nutrition.calories}</span>
                  <span className="nutrition-label">{t('foodModals.nutritionCalories')}</span>
                </div>
                <div className="nutrition-item protein">
                  <span className="nutrition-value">{nutrition.protein}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionProtein')}</span>
                </div>
                <div className="nutrition-item carbs">
                  <span className="nutrition-value">{nutrition.carbs}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionCarbs')}</span>
                </div>
                <div className="nutrition-item fat">
                  <span className="nutrition-value">{nutrition.fat}g</span>
                  <span className="nutrition-label">{t('foodModals.nutritionFat')}</span>
                </div>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />

              <div className="scan-actions">
                <button className="btn-secondary" onClick={() => { setPreviews([]); setResult(null); }}>
                  {t('foodModals.scanAgain')}
                </button>
                <button className="btn-primary" onClick={addTooDiary} disabled={isAdding}>
                  {isAdding
                    ? <><Loader size={18} className="spin" /> {t('foodModals.adding')}</>
                    : t('foodModals.addToMealTypeScan', { mealType: selectedMealType })}
                </button>
              </div>
            </div>
          ) : (
            <div className="multi-photo-section">
              <div className="multi-photo-grid">
                {previews.map((img, idx) => (
                  <div key={idx} className="photo-preview-item">
                    <img src={img} alt={`Preview ${idx + 1}`} className="photo-preview-thumb" />
                    <button className="photo-remove-btn" onClick={() => removePhoto(idx)}>
                      <X size={14} />
                    </button>
                    <span className="photo-number">{idx + 1}</span>
                  </div>
                ))}
                {previews.length < MAX_PHOTOS && (
                  <button className="add-photo-btn" onClick={() => cameraRef.current?.click()}>
                    <Plus size={24} />
                    <span>{t('foodModals.addPhoto')}</span>
                  </button>
                )}
              </div>

              <p className="photo-tip">
                {previews.length === 1
                  ? t('foodModals.scanTipOnePhoto')
                  : t('foodModals.scanTipMultiPhoto', { count: previews.length })}
              </p>

              {error && <div className="modal-error">{error}</div>}

              <div className="scan-actions">
                <button className="btn-secondary" onClick={() => setPreviews([])}>
                  {t('foodModals.startOver')}
                </button>
                <button className="btn-primary" onClick={analyzeLabel}>
                  {previews.length > 1 ? t('foodModals.analyzePhotosScan') : t('foodModals.analyzePhotoScan')}
                </button>
              </div>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
