import { useState, useRef, useEffect } from 'react';
import { X, Camera, Upload, Search, Heart, Loader, Plus, Minus, Check, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '../utils/api';

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
  const [preview, setPreview] = useState(null);
  const [details, setDetails] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  // Update selected meal type when prop changes
  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResults(null);
    const compressed = await compressImage(file);
    setPreview(compressed);
  };

  const analyzePhoto = async () => {
    if (!preview) return;

    setAnalyzing(true);
    setError(null);

    try {
      const data = await apiPost('/.netlify/functions/analyze-food-photo', {
        image: preview,
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

  const addAllTooDiary = async () => {
    if (!results || !clientData?.id) return;

    const today = new Date().toISOString().split('T')[0];
    let addedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    try {
      for (const food of results) {
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
      handleClose();
    } catch (err) {
      setError('Failed to add foods. Please try again.');
      console.error(err);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setDetails('');
    setResults(null);
    setError(null);
    setAnalyzing(false);
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
          {!preview ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">Take a photo or upload an image of your food</p>
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
              <img src={preview} alt="Food preview" className="photo-preview-img" />
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
                <button className="btn-secondary" onClick={() => setPreview(null)}>
                  Retake
                </button>
                <button className="btn-primary" onClick={analyzePhoto} disabled={analyzing}>
                  {analyzing ? <><Loader size={18} className="spin" /> Analyzing...</> : 'Analyze Photo'}
                </button>
              </div>
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
              <button className="btn-primary full-width" onClick={addAllTooDiary}>
                <Check size={18} /> Add All to {selectedMealType}
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
  const searchTimeout = useRef(null);

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

  const addTooDiary = async () => {
    if (!selectedFood || !clientData?.id) return;

    const nutrition = getScaledNutrition();
    const today = new Date().toISOString().split('T')[0];

    try {
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: mealType,
        foodName: selectedFood.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        servingSize: selectedFood.measures?.[selectedMeasure]?.weight || 100,
        servingUnit: selectedFood.measures?.[selectedMeasure]?.label || 'g',
        numberOfServings: servings,
        foodSource: 'search'
      });

      onFoodLogged?.(nutrition);
      handleClose();
    } catch (err) {
      console.error('Failed to add food:', err);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setServings(1);
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

              <button className="btn-primary full-width" onClick={addTooDiary}>
                Add to {mealType}
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

  const addFavorite = async (favorite) => {
    const today = new Date().toISOString().split('T')[0];

    try {
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
      onClose();
    } catch (err) {
      console.error('Failed to add favorite:', err);
    }
  };

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
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [servings, setServings] = useState(1);
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState(mealType);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  useEffect(() => {
    setSelectedMealType(mealType);
  }, [mealType]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    const compressed = await compressImage(file);
    setPreview(compressed);

    // Auto-analyze after capture
    analyzeLabel(compressed);
  };

  const analyzeLabel = async (imageData) => {
    setAnalyzing(true);
    setError(null);

    try {
      const data = await apiPost('/.netlify/functions/analyze-nutrition-label', {
        image: imageData
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

  const addTooDiary = async () => {
    if (!result || !clientData?.id) return;

    const nutrition = getScaledNutrition();
    const today = new Date().toISOString().split('T')[0];

    try {
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        entryDate: today,
        mealType: selectedMealType,
        foodName: result.name || 'Scanned Food',
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        servingSize: 1,
        servingUnit: result.servingSize || 'serving',
        numberOfServings: servings,
        foodSource: 'nutrition_label'
      });

      onFoodLogged?.(nutrition);
      handleClose();
    } catch (err) {
      // Show more detailed error for debugging
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to add food. Please try again.';
      setError(errorMessage);
      console.error('Food diary error:', err);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setResult(null);
    setServings(1);
    setError(null);
    setAnalyzing(false);
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
          {!preview ? (
            <div className="photo-capture-options">
              <p className="photo-instructions">Take a photo of the nutrition facts label</p>
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
              <img src={preview} alt="Label preview" className="photo-preview-img small" />
              <div className="analyzing-indicator">
                <Loader size={24} className="spin" />
                <span>Reading nutrition label...</span>
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
                <button className="btn-secondary" onClick={() => { setPreview(null); setResult(null); }}>
                  Scan Again
                </button>
                <button className="btn-primary" onClick={addTooDiary}>
                  Add to {selectedMealType}
                </button>
              </div>
            </div>
          ) : (
            <div className="scan-error-section">
              <img src={preview} alt="Label preview" className="photo-preview-img small" />
              {error && <div className="modal-error">{error}</div>}
              <div className="scan-actions">
                <button className="btn-secondary" onClick={() => setPreview(null)}>
                  Try Again
                </button>
                <button className="btn-primary" onClick={() => analyzeLabel(preview)}>
                  Retry Analysis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
