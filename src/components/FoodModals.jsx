import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, Upload, Search, Heart, Loader, Plus, Minus, Check, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete, ensureFreshSession } from '../utils/api';
import { useToast } from './Toast';

// Image compression utility
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
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
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Meal type selector component
const MealTypeSelector = ({ selected, onChange }) => (
  <div className="modal-meal-selector">
    <label>Add to:</label>
    <div className="meal-type-chips">
      {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
        <button
          key={type}
          className={`meal-chip ${selected === type ? 'active' : ''}`}
          onClick={() => onChange(type)}
        >
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </button>
      ))}
    </div>
  </div>
);

// ==================== SNAP PHOTO MODAL ====================
export function SnapPhotoModal({ isOpen, onClose, mealType, clientData, onFoodLogged }) {
  const [previews, setPreviews] = useState([]); // Array of images
  const [details, setDetails] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [isAdding, setIsAdding] = useState(false);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const MAX_PHOTOS = 4;
  const { showError, showSuccess } = useToast();

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
        details: details || undefined
      });

      if (data?.foods && data.foods.length > 0) {
        setResults(data.foods);
      } else {
        setError('No food detected in the image. Try adding details or take a clearer photo.');
      }
    } catch (err) {
      setError('Failed to analyze photo. Please try again.');
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const addAllTooDiary = useCallback(async () => {
    if (!results || !clientData?.id || isAdding) return;

    setIsAdding(true);
    const today = new Date().toISOString().split('T')[0];
    let addedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    // Store results for retry
    const foodsToAdd = [...results];

    try {
      // Ensure fresh session before adding
      await ensureFreshSession();

      for (const food of foodsToAdd) {
        await apiPost('/.netlify/functions/food-diary', {
          clientId: clientData.id,
          coachId: clientData.coach_id,
          entryDate: today,
          mealType: selectedMealType,
          foodName: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: 1,
          servingUnit: 'serving',
          numberOfServings: 1,
          foodSource: 'ai_photo'
        });

        addedTotals.calories += food.calories || 0;
        addedTotals.protein += food.protein || 0;
        addedTotals.carbs += food.carbs || 0;
        addedTotals.fat += food.fat || 0;
      }

      onFoodLogged?.(addedTotals);
      showSuccess('Food added to diary!');
      handleClose();
    } catch (err) {
      console.error('Failed to add foods:', err);
      setError('Failed to add foods. Please try again.');
      showError('Failed to add food to diary', {
        onRetry: async () => {
          setError(null);
          await addAllTooDiary();
        }
      });
    } finally {
      setIsAdding(false);
    }
  }, [results, clientData, selectedMealType, isAdding, onFoodLogged, showError, showSuccess]);

  const handleClose = () => {
    setPreviews([]);
    setDetails('');
    setResults(null);
    setError(null);
    setAnalyzing(false);
    setIsAdding(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Snap Photo</h2>
          <button className="modal-close" onClick={handleClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {previews.length === 0 ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">Take photos of your food</p>
              <p className="photo-hint">Multiple angles help improve accuracy</p>
              <div className="photo-buttons">
                <button className="photo-option-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={24} />
                  <span>Take Photo</span>
                </button>
                <button className="photo-option-btn" onClick={() => uploadRef.current?.click()}>
                  <Upload size={24} />
                  <span>Upload</span>
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
                    <span>Add Angle</span>
                  </button>
                )}
              </div>

              <p className="photo-tip">
                {previews.length === 1
                  ? "Add another angle for better accuracy"
                  : `${previews.length} photos added`}
              </p>

              <div className="photo-details-input">
                <label>Add details (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., 'black tea unsweetened' or '6oz chicken'"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </div>
              {error && <div className="modal-error">{error}</div>}
              <div className="photo-actions">
                <button className="btn-secondary" onClick={() => setPreviews([])}>
                  Start Over
                </button>
                <button className="btn-primary" onClick={analyzePhoto} disabled={analyzing}>
                  {analyzing ? <><Loader size={18} className="spin" /> Analyzing...</> : `Analyze ${previews.length > 1 ? 'Photos' : 'Photo'}`}
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
              <h3>Detected Foods</h3>
              <div className="detected-foods-list">
                {results.map((food, idx) => (
                  <div key={idx} className="detected-food-item">
                    <div className="detected-food-name">{food.name}</div>
                    <div className="detected-food-macros">
                      <span>{food.calories} cal</span>
                      <span>P: {food.protein}g</span>
                      <span>C: {food.carbs}g</span>
                      <span>F: {food.fat}g</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="photo-results-total">
                <strong>Total:</strong>
                <span>{results.reduce((s, f) => s + (f.calories || 0), 0)} cal</span>
              </div>
              <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />
              <button className="btn-primary full-width" onClick={addAllTooDiary} disabled={isAdding}>
                {isAdding ? <><Loader size={18} className="spin" /> Adding...</> : <><Check size={18} /> Add All to {selectedMealType}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== SEARCH FOODS MODAL ====================
export function SearchFoodsModal({ isOpen, onClose, mealType, clientData, onFoodLogged }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState(1);
  const [selectedMeasure, setSelectedMeasure] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const searchTimeout = useRef(null);
  const { showError, showSuccess } = useToast();

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

    const measure = selectedFood.measures?.[selectedMeasure];
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
    if (!selectedFood || !clientData?.id || isAdding) return;

    setIsAdding(true);
    const nutrition = getScaledNutrition();
    const today = new Date().toISOString().split('T')[0];
    const foodToAdd = { ...selectedFood };

    try {
      await ensureFreshSession();
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: mealType,
        foodName: foodToAdd.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        servingSize: foodToAdd.measures?.[selectedMeasure]?.weight || 100,
        servingUnit: foodToAdd.measures?.[selectedMeasure]?.label || 'g',
        numberOfServings: servings,
        foodSource: 'search'
      });

      onFoodLogged?.(nutrition);
      showSuccess('Food added to diary!');
      handleClose();
    } catch (err) {
      console.error('Failed to add food:', err);
      showError('Failed to add food to diary', {
        onRetry: async () => {
          await addTooDiary();
        }
      });
    } finally {
      setIsAdding(false);
    }
  }, [selectedFood, clientData, mealType, servings, selectedMeasure, isAdding, onFoodLogged, showError, showSuccess]);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setServings(1);
    setIsAdding(false);
    onClose();
  };

  if (!isOpen) return null;

  const nutrition = getScaledNutrition();

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Search Foods</h2>
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
                  placeholder="Search for food..."
                  value={query}
                  onChange={handleQueryChange}
                  autoFocus
                />
              </div>

              {searching ? (
                <div className="search-loading">
                  <Loader size={24} className="spin" />
                  <span>Searching...</span>
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
                <div className="search-empty">No foods found for "{query}"</div>
              ) : (
                <div className="search-empty">Type to search for foods</div>
              )}
            </>
          ) : (
            <div className="food-detail-section">
              <button className="back-link" onClick={() => setSelectedFood(null)}>
                ← Back to search
              </button>

              <h3 className="food-detail-name">{selectedFood.name}</h3>
              {selectedFood.brand && <p className="food-detail-brand">{selectedFood.brand}</p>}

              <div className="serving-selector">
                <label>Serving Size</label>
                {selectedFood.measures && selectedFood.measures.length > 0 ? (
                  <select
                    value={selectedMeasure}
                    onChange={(e) => setSelectedMeasure(Number(e.target.value))}
                  >
                    {selectedFood.measures.map((m, idx) => (
                      <option key={idx} value={idx}>{m.label} ({m.weight}g)</option>
                    ))}
                  </select>
                ) : (
                  <span className="serving-default">{selectedFood.servingSize || 100}g</span>
                )}
              </div>

              <div className="servings-adjuster">
                <label>Number of Servings</label>
                <div className="servings-controls">
                  <button onClick={() => setServings(Math.max(0.5, servings - 0.5))}><Minus size={18} /></button>
                  <span className="servings-value">{servings}</span>
                  <button onClick={() => setServings(servings + 0.5)}><Plus size={18} /></button>
                </div>
              </div>

              <div className="nutrition-preview">
                <div className="nutrition-item calories">
                  <span className="nutrition-value">{nutrition.calories}</span>
                  <span className="nutrition-label">Calories</span>
                </div>
                <div className="nutrition-item protein">
                  <span className="nutrition-value">{nutrition.protein}g</span>
                  <span className="nutrition-label">Protein</span>
                </div>
                <div className="nutrition-item carbs">
                  <span className="nutrition-value">{nutrition.carbs}g</span>
                  <span className="nutrition-label">Carbs</span>
                </div>
                <div className="nutrition-item fat">
                  <span className="nutrition-value">{nutrition.fat}g</span>
                  <span className="nutrition-label">Fat</span>
                </div>
              </div>

              <button className="btn-primary full-width" onClick={addTooDiary} disabled={isAdding}>
                {isAdding ? <><Loader size={18} className="spin" /> Adding...</> : `Add to ${mealType}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== FAVORITES MODAL ====================
export function FavoritesModal({ isOpen, onClose, mealType, clientData, onFoodLogged }) {
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
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  useEffect(() => {
    if (isOpen && clientData?.id) {
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
    if (addingId) return;

    setAddingId(favorite.id);
    const today = new Date().toISOString().split('T')[0];

    try {
      await ensureFreshSession();
      // Add each food item from the favorite meal
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: selectedMealType,
        foodName: favorite.meal_name,
        calories: favorite.calories,
        protein: favorite.protein,
        carbs: favorite.carbs,
        fat: favorite.fat,
        servingSize: 1,
        servingUnit: 'meal',
        numberOfServings: 1,
        foodSource: 'favorite'
      });

      onFoodLogged?.({
        calories: favorite.calories,
        protein: favorite.protein,
        carbs: favorite.carbs,
        fat: favorite.fat
      });
      showSuccess('Food added to diary!');
      onClose();
    } catch (err) {
      console.error('Failed to add favorite:', err);
      showError('Failed to add food to diary', {
        onRetry: async () => {
          await addFavorite(favorite);
        }
      });
    } finally {
      setAddingId(null);
    }
  }, [addingId, clientData, selectedMealType, onFoodLogged, onClose, showError, showSuccess]);

  const deleteFavorite = async (favoriteId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this favorite?')) return;

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Favorites</h2>
          <button className="modal-close" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />
          {loading ? (
            <div className="favorites-loading">
              <Loader size={24} className="spin" />
              <span>Loading favorites...</span>
            </div>
          ) : favorites.length === 0 ? (
            <div className="favorites-empty">
              <Heart size={48} className="empty-icon" />
              <h3>No favorites yet</h3>
              <p>Save meals from your diary to quickly add them later</p>
            </div>
          ) : (
            <div className="favorites-list">
              {favorites.map((fav) => (
                <div key={fav.id} className="favorite-item" onClick={() => addFavorite(fav)}>
                  <div className="favorite-info">
                    <div className="favorite-name">{fav.meal_name}</div>
                    <div className="favorite-type">{fav.meal_type}</div>
                    <div className="favorite-macros">
                      <span>{fav.calories} cal</span>
                      <span>P: {fav.protein}g</span>
                      <span>C: {fav.carbs}g</span>
                      <span>F: {fav.fat}g</span>
                    </div>
                  </div>
                  <button
                    className="favorite-delete-btn"
                    onClick={(e) => deleteFavorite(fav.id, e)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== SCAN LABEL MODAL ====================
export function ScanLabelModal({ isOpen, onClose, mealType, clientData, onFoodLogged }) {
  const [previews, setPreviews] = useState([]); // Array of images
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [servings, setServings] = useState(1);
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const [isAdding, setIsAdding] = useState(false);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const MAX_PHOTOS = 4;
  const { showError, showSuccess } = useToast();

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
        images: previews // Send array of images
      });

      if (data?.calories !== undefined) {
        setResult(data);
        setServings(1);
      } else {
        setError('Could not read nutrition label. Please try a clearer photo.');
      }
    } catch (err) {
      setError('Failed to analyze label. Please try again.');
      console.error(err);
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
    if (!result || !clientData?.id || isAdding) return;

    setIsAdding(true);
    const nutrition = getScaledNutrition();
    const today = new Date().toISOString().split('T')[0];
    const resultToAdd = { ...result };

    try {
      await ensureFreshSession();
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: selectedMealType,
        foodName: resultToAdd.name || 'Scanned Food',
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        servingSize: 1,
        servingUnit: resultToAdd.servingSize || 'serving',
        numberOfServings: servings,
        foodSource: 'nutrition_label'
      });

      onFoodLogged?.(nutrition);
      showSuccess('Food added to diary!');
      handleClose();
    } catch (err) {
      console.error('Food diary error:', err);
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to add food. Please try again.';
      setError(errorMessage);
      showError('Failed to add food to diary', {
        onRetry: async () => {
          setError(null);
          await addTooDiary();
        }
      });
    } finally {
      setIsAdding(false);
    }
  }, [result, clientData, selectedMealType, servings, isAdding, onFoodLogged, showError, showSuccess]);

  const handleClose = () => {
    setPreviews([]);
    setResult(null);
    setServings(1);
    setError(null);
    setAnalyzing(false);
    setIsAdding(false);
    onClose();
  };

  if (!isOpen) return null;

  const nutrition = getScaledNutrition();

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Scan Nutrition Label</h2>
          <button className="modal-close" onClick={handleClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {previews.length === 0 ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">Take photos of the nutrition label and product</p>
              <p className="photo-hint">Multiple angles help improve accuracy</p>
              <div className="photo-buttons">
                <button className="photo-option-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={24} />
                  <span>Take Photo</span>
                </button>
                <button className="photo-option-btn" onClick={() => uploadRef.current?.click()}>
                  <Upload size={24} />
                  <span>Upload</span>
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
                <span>Reading nutrition label{previews.length > 1 ? 's' : ''}...</span>
              </div>
            </div>
          ) : result ? (
            <div className="scan-results-section">
              <h3 className="food-detail-name">{result.name || 'Scanned Food'}</h3>
              {result.servingSize && (
                <p className="serving-info">Serving size: {result.servingSize}</p>
              )}

              <div className="servings-adjuster">
                <label>Number of Servings</label>
                <div className="servings-controls">
                  <button onClick={() => setServings(Math.max(0.5, servings - 0.5))}><Minus size={18} /></button>
                  <span className="servings-value">{servings}</span>
                  <button onClick={() => setServings(servings + 0.5)}><Plus size={18} /></button>
                </div>
              </div>

              <div className="nutrition-preview">
                <div className="nutrition-item calories">
                  <span className="nutrition-value">{nutrition.calories}</span>
                  <span className="nutrition-label">Calories</span>
                </div>
                <div className="nutrition-item protein">
                  <span className="nutrition-value">{nutrition.protein}g</span>
                  <span className="nutrition-label">Protein</span>
                </div>
                <div className="nutrition-item carbs">
                  <span className="nutrition-value">{nutrition.carbs}g</span>
                  <span className="nutrition-label">Carbs</span>
                </div>
                <div className="nutrition-item fat">
                  <span className="nutrition-value">{nutrition.fat}g</span>
                  <span className="nutrition-label">Fat</span>
                </div>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <MealTypeSelector selected={selectedMealType} onChange={setSelectedMealType} />

              <div className="scan-actions">
                <button className="btn-secondary" onClick={() => { setPreviews([]); setResult(null); }}>
                  Scan Again
                </button>
                <button className="btn-primary" onClick={addTooDiary} disabled={isAdding}>
                  {isAdding ? <><Loader size={18} className="spin" /> Adding...</> : `Add to ${selectedMealType}`}
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
                    <span>Add Photo</span>
                  </button>
                )}
              </div>

              <p className="photo-tip">
                {previews.length === 1
                  ? "Add front of package for better accuracy"
                  : `${previews.length} photos added`}
              </p>

              {error && <div className="modal-error">{error}</div>}

              <div className="scan-actions">
                <button className="btn-secondary" onClick={() => setPreviews([])}>
                  Start Over
                </button>
                <button className="btn-primary" onClick={analyzeLabel}>
                  Analyze {previews.length > 1 ? 'Photos' : 'Photo'}
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
