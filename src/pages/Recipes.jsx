import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Clock, X, Search, Sparkles, Globe, BookOpen, Heart, Download, Plus, Trash2, Edit3, Eye, EyeOff, Upload, Link, Camera, Youtube, Loader, Zap, Package, Users, Check, Flame, ChefHat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

import { useToast } from '../components/Toast';
const CATEGORIES = [
  { id: 'all', icon: BookOpen, label: 'All' },
  { id: 'grab_go', icon: Zap, label: 'Grab & Go' },
  { id: 'quick', icon: Clock, label: 'Quick' },
  { id: 'meal_prep', icon: Package, label: 'Meal Prep' },
  { id: 'family', icon: Users, label: 'Family' }
];

const CATEGORY_LABELS = {
  'grab_go': 'Grab & Go',
  'quick': '15 min or less',
  'meal_prep': 'Meal Prep',
  'family': 'Family Dinner'
};

// Diet options for Spoonacular search
const DIET_OPTIONS = [
  { value: '', label: 'Any Diet' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten free', label: 'Gluten Free' },
  { value: 'ketogenic', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' }
];

const EMPTY_FORM = {
  name: '',
  description: '',
  time_category: 'quick',
  prep_time_minutes: '',
  cook_time_minutes: '',
  servings: '1',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  ingredients: '',
  instructions: '',
  image_url: '',
  source_url: '',
  is_public: true
};

function Recipes() {
  const navigate = useNavigate();
  const { user, clientData } = useAuth();
  const { showError, showSuccess } = useToast();
  const isCoach = clientData?.is_coach === true;
  const coachId = isCoach ? user?.id : clientData?.coach_id;

  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Discover tab state
  const [activeTab, setActiveTab] = useState('my-recipes');
  const [discoverRecipes, setDiscoverRecipes] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiet, setSelectedDiet] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Coach: Add/Edit recipe form state
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null); // null = creating, object = editing
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // YouTube import state
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');

  // Recipe modal: local UI state for tappable check-off (visual only)
  const [checkedIngredients, setCheckedIngredients] = useState(() => new Set());
  const [completedSteps, setCompletedSteps] = useState(() => new Set());

  useEffect(() => {
    if (selectedRecipe) {
      setCheckedIngredients(new Set());
      setCompletedSteps(new Set());
    }
  }, [selectedRecipe?.id, selectedRecipe?.spoonacular_id]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('Image must be under 5MB.');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageData = event.target.result;
      setImagePreview(imageData);
      setUploadingImage(true);

      try {
        const result = await apiPost('/.netlify/functions/upload-recipe-image', {
          coachId,
          imageData,
          fileName: file.name
        });

        if (result?.imageUrl) {
          handleFormChange('image_url', result.imageUrl);
        } else {
          showError('Failed to upload image. Please try again.');
          setImagePreview(null);
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        showError('Failed to upload image. Please try again.');
        setImagePreview(null);
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    handleFormChange('image_url', '');
  };

  const loadRecipes = useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/.netlify/functions/get-recipes?clientId=${clientData?.id}&coachId=${coachId}`);
      setRecipes(data?.recipes || []);
    } catch (err) {
      console.error('Error loading recipes:', err);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [clientData?.id, coachId]);

  const loadRandomRecipes = useCallback(async () => {
    setDiscoverLoading(true);
    try {
      const data = await apiGet('/.netlify/functions/spoonacular-recipes?action=random&number=12');
      setDiscoverRecipes(data.recipes || []);
    } catch (err) {
      console.error('Error loading discover recipes:', err);
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(loadRecipes);

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load random recipes when discover tab is first opened
  useEffect(() => {
    if (activeTab === 'discover' && discoverRecipes.length === 0 && !hasSearched) {
      loadRandomRecipes();
    }
  }, [activeTab]);

  const searchSpoonacular = async (e) => {
    e?.preventDefault();
    setDiscoverLoading(true);
    setHasSearched(true);
    try {
      let url = `/.netlify/functions/spoonacular-recipes?action=search&number=20`;
      if (searchQuery) url += `&query=${encodeURIComponent(searchQuery)}`;
      if (selectedDiet) url += `&diet=${encodeURIComponent(selectedDiet)}`;

      const data = await apiGet(url);
      setDiscoverRecipes(data.recipes || []);
    } catch (err) {
      console.error('Error searching recipes:', err);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const loadRecipeDetails = async (recipe) => {
    if (!recipe.spoonacular_id) {
      setSelectedRecipe(recipe);
      return;
    }

    try {
      const data = await apiGet(`/.netlify/functions/spoonacular-recipes?action=details&id=${recipe.spoonacular_id}`);
      setSelectedRecipe(data);
    } catch (err) {
      console.error('Error loading recipe details:', err);
      setSelectedRecipe(recipe);
    }
  };

  const filteredRecipes = activeCategory === 'all'
    ? recipes
    : recipes.filter(r => r.time_category === activeCategory);

  // ── Coach: Recipe CRUD ──

  const handleYoutubeImport = async () => {
    if (!youtubeUrl.trim()) return;

    setYoutubeLoading(true);
    setYoutubeError('');

    try {
      const result = await apiPost('/.netlify/functions/extract-youtube-recipe', {
        coachId,
        youtubeUrl: youtubeUrl.trim()
      });

      const recipe = result.recipe;

      // Pre-fill the recipe form with extracted data
      setFormData({
        name: recipe.name || '',
        description: recipe.description || '',
        time_category: recipe.time_category || 'quick',
        prep_time_minutes: recipe.prep_time_minutes || '',
        cook_time_minutes: recipe.cook_time_minutes || '',
        servings: recipe.servings || '1',
        calories: recipe.calories || '',
        protein: recipe.protein || '',
        carbs: recipe.carbs || '',
        fat: recipe.fat || '',
        ingredients: recipe.ingredients || '',
        instructions: recipe.instructions || '',
        image_url: recipe.image_url || '',
        source_url: recipe.source_url || youtubeUrl.trim(),
        is_public: true
      });

      if (recipe.image_url) {
        setImagePreview(recipe.image_url);
      }

      // Close YouTube modal and open recipe form
      setShowYoutubeImport(false);
      setYoutubeUrl('');
      setEditingRecipe(null);
      setShowRecipeForm(true);
    } catch (err) {
      console.error('YouTube import error:', err);
      const errorMsg = err?.message || err?.error || '';
      if (errorMsg.includes('NO_CAPTIONS') || errorMsg.includes('captions')) {
        setYoutubeError('This video doesn\'t have captions available. Try a different video or enter the recipe manually.');
      } else if (errorMsg.includes('Invalid YouTube')) {
        setYoutubeError('Invalid YouTube URL. Please paste a valid YouTube or Shorts link.');
      } else {
        setYoutubeError('Could not extract recipe from this video. Try a different video or enter manually.');
      }
    } finally {
      setYoutubeLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingRecipe(null);
    setFormData(EMPTY_FORM);
    setImagePreview(null);
    setShowRecipeForm(true);
  };

  const openEditForm = (recipe) => {
    setEditingRecipe(recipe);
    setImagePreview(null);
    setFormData({
      name: recipe.name || '',
      description: recipe.description || '',
      time_category: recipe.time_category || 'quick',
      prep_time_minutes: recipe.prep_time_minutes || '',
      cook_time_minutes: recipe.cook_time_minutes || '',
      servings: recipe.servings || '1',
      calories: recipe.calories || '',
      protein: recipe.protein || '',
      carbs: recipe.carbs || '',
      fat: recipe.fat || '',
      ingredients: recipe.ingredients || '',
      instructions: recipe.instructions || '',
      image_url: recipe.image_url || '',
      source_url: recipe.source_url || '',
      is_public: recipe.is_public !== false
    });
    setShowRecipeForm(true);
    setSelectedRecipe(null);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveRecipe = async () => {
    if (!formData.name.trim()) {
      showError('Recipe name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        coachId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        time_category: formData.time_category,
        prep_time_minutes: formData.prep_time_minutes ? parseInt(formData.prep_time_minutes) : null,
        cook_time_minutes: formData.cook_time_minutes ? parseInt(formData.cook_time_minutes) : null,
        servings: formData.servings ? parseInt(formData.servings) : 1,
        calories: formData.calories ? parseInt(formData.calories) : null,
        protein: formData.protein ? parseFloat(formData.protein) : null,
        carbs: formData.carbs ? parseFloat(formData.carbs) : null,
        fat: formData.fat ? parseFloat(formData.fat) : null,
        ingredients: formData.ingredients.trim() || null,
        instructions: formData.instructions.trim() || null,
        image_url: formData.image_url.trim() || null,
        source_url: formData.source_url.trim() || null,
        is_public: formData.is_public
      };

      if (editingRecipe) {
        payload.recipeId = editingRecipe.id;
        await apiPut('/.netlify/functions/manage-recipes', payload);
      } else {
        await apiPost('/.netlify/functions/manage-recipes', payload);
      }

      setShowRecipeForm(false);
      setEditingRecipe(null);
      setFormData(EMPTY_FORM);
      setImagePreview(null);
      await loadRecipes();
    } catch (err) {
      console.error('Error saving recipe:', err);
      showError('Failed to save recipe. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipe = async (recipe) => {
    if (!confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return;

    try {
      await apiDelete(`/.netlify/functions/manage-recipes?coachId=${coachId}&recipeId=${recipe.id}`);
      setSelectedRecipe(null);
      await loadRecipes();
    } catch (err) {
      console.error('Error deleting recipe:', err);
      showError('Failed to delete recipe. Please try again.');
    }
  };

  // ── Client: Favorites & Diary ──

  const handleFavorite = async () => {
    if (!selectedRecipe || !clientData?.id) {
      showError('Unable to save. Please try again.');
      return;
    }

    try {
      await apiPost('/.netlify/functions/toggle-favorite', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        mealName: selectedRecipe.name,
        mealType: 'meal',
        calories: selectedRecipe.calories || 0,
        protein: selectedRecipe.protein || 0,
        carbs: selectedRecipe.carbs || 0,
        fat: selectedRecipe.fat || 0,
        notes: selectedRecipe.servings ? `${selectedRecipe.servings} serving(s)` : '1 serving',
        forceAdd: true
      });
      if (clientData?.id) {
        sessionStorage.removeItem(`favorites_${clientData.id}`);
      }
      showSuccess('Recipe saved to favorites!');
    } catch (err) {
      console.error('Error saving favorite:', err);
      showError('Could not save to favorites. Please try again.');
    }
  };

  const handleLogToDiary = () => {
    if (!selectedRecipe) return;

    const recipeData = {
      food_name: selectedRecipe.name,
      calories: selectedRecipe.calories || 0,
      protein: selectedRecipe.protein || 0,
      carbs: selectedRecipe.carbs || 0,
      fat: selectedRecipe.fat || 0,
      food_source: 'recipe',
      confirmation: `Log "${selectedRecipe.name}" to your diary?`
    };

    sessionStorage.setItem('pendingFoodLog', JSON.stringify(recipeData));
    navigate('/diary?action=log');
  };

  const handleDownloadPDF = () => {
    if (!selectedRecipe) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${selectedRecipe.name} - Recipe</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #2cb5a5; margin-bottom: 8px; }
          .subtitle { color: #64748b; margin-bottom: 24px; }
          .nutrition { display: flex; gap: 24px; background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
          .nutrition-item { text-align: center; }
          .nutrition-value { font-size: 24px; font-weight: bold; color: #0f172a; }
          .nutrition-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
          h2 { color: #334155; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 24px; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; line-height: 1.5; }
          .instructions { line-height: 1.8; }
          .instructions p { margin-bottom: 12px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
          .back-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
          .back-bar a { display: inline-flex; align-items: center; gap: 6px; color: #2cb5a5; text-decoration: none; font-weight: 600; font-size: 15px; padding: 10px 16px; border-radius: 10px; background: #f0fdfa; border: 1px solid #ccfbf1; }
          .back-bar a:active { background: #ccfbf1; }
          @media print { body { padding: 20px; } .back-bar { display: none; } }
        </style>
      </head>
      <body>
        <div class="back-bar">
          <a href="#" onclick="window.close(); if(!window.closed) history.back(); return false;">← Back to App</a>
        </div>
        <h1>${selectedRecipe.name}</h1>
        ${selectedRecipe.prep_time_minutes ? `<p class="subtitle">Prep time: ${selectedRecipe.prep_time_minutes} minutes</p>` : ''}
        ${selectedRecipe.cook_time_minutes ? `<p class="subtitle">Cook time: ${selectedRecipe.cook_time_minutes} minutes</p>` : ''}

        <div class="nutrition">
          <div class="nutrition-item">
            <div class="nutrition-value">${selectedRecipe.calories || '-'}</div>
            <div class="nutrition-label">Calories</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-value">${selectedRecipe.protein || '-'}g</div>
            <div class="nutrition-label">Protein</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-value">${selectedRecipe.carbs || '-'}g</div>
            <div class="nutrition-label">Carbs</div>
          </div>
          <div class="nutrition-item">
            <div class="nutrition-value">${selectedRecipe.fat || '-'}g</div>
            <div class="nutrition-label">Fat</div>
          </div>
        </div>

        ${selectedRecipe.ingredients ? `
          <h2>Ingredients</h2>
          <ul>
            ${(selectedRecipe.ingredients.includes('\n')
              ? selectedRecipe.ingredients.split('\n')
              : selectedRecipe.ingredients.split(',')
            ).filter(i => i.trim()).map(item => `<li>${item.trim()}</li>`).join('')}
          </ul>
        ` : ''}

        ${selectedRecipe.instructions ? `
          <h2>Instructions</h2>
          <div class="instructions">
            ${(selectedRecipe.instructions.includes('\n')
              ? selectedRecipe.instructions.split('\n').filter(i => i.trim()).map(step => `<p>${step}</p>`).join('')
              : `<p>${selectedRecipe.instructions}</p>`
            )}
          </div>
        ` : ''}

        <div class="footer">
          ${selectedRecipe.source_url ? `Source: ${selectedRecipe.source_url}<br>` : ''}
          Downloaded from Ziquecoach
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // ── Recipe modal display helpers (visual only — no scaling/persistence) ──
  const splitIngredient = (line) => {
    const sepMatch = line.match(/\s+[–—-]\s+/);
    if (sepMatch) {
      const idx = line.indexOf(sepMatch[0]);
      return { name: line.slice(0, idx).trim(), qty: line.slice(idx + sepMatch[0].length).trim() };
    }
    const parenMatch = line.match(/^([^,(]+?)[,(]\s*(.+)$/);
    if (parenMatch) {
      const qty = parenMatch[2].replace(/\)$/, '').trim();
      if (/\d/.test(qty)) return { name: parenMatch[1].trim(), qty };
    }
    return { name: line.trim(), qty: '' };
  };

  const parseIngredients = (raw) => {
    if (!raw) return [];
    const lines = raw.includes('\n') ? raw.split('\n') : raw.split(',');
    return lines.map(l => l.trim()).filter(Boolean);
  };

  const parseSteps = (raw) => {
    if (!raw) return [];
    const lines = raw.includes('\n')
      ? raw.split('\n').map(l => l.trim()).filter(Boolean)
      : [raw.trim()];
    return lines.map(l => l.replace(/^\s*\d+[\.\)]\s*/, ''));
  };

  const recipeServings = parseInt(selectedRecipe?.servings) || 1;

  const macroBreakdown = useMemo(() => {
    if (!selectedRecipe) return null;
    const pCal = (selectedRecipe.protein || 0) * 4;
    const cCal = (selectedRecipe.carbs || 0) * 4;
    const fCal = (selectedRecipe.fat || 0) * 9;
    const total = pCal + cCal + fCal;
    if (total <= 0) return null;
    return {
      proteinPct: (pCal / total) * 100,
      carbsPct: (cCal / total) * 100,
      fatPct: (fCal / total) * 100,
    };
  }, [selectedRecipe?.protein, selectedRecipe?.carbs, selectedRecipe?.fat]);

  const dailyGoals = !isCoach ? {
    calories: clientData?.calorie_goal || 2000,
    protein: clientData?.protein_goal || 150,
    carbs: clientData?.carbs_goal || 200,
    fat: clientData?.fat_goal || 65,
  } : null;

  const totalTime = (parseInt(selectedRecipe?.prep_time_minutes) || 0) + (parseInt(selectedRecipe?.cook_time_minutes) || 0);

  const dietTags = useMemo(() => {
    if (!selectedRecipe) return [];
    const tags = [];
    if (selectedRecipe.time_category && CATEGORY_LABELS[selectedRecipe.time_category]) {
      tags.push({ label: CATEGORY_LABELS[selectedRecipe.time_category], variant: 'category' });
    }
    const perServingProtein = selectedRecipe.protein || 0;
    const perServingCal = selectedRecipe.calories || 0;
    const perServingCarbs = selectedRecipe.carbs || 0;
    if (perServingProtein >= 25) tags.push({ label: 'High protein', variant: 'protein' });
    if (perServingCal > 0 && perServingCal < 350) tags.push({ label: 'Low calorie', variant: 'calorie' });
    if (perServingCarbs > 0 && perServingCarbs < 15) tags.push({ label: 'Low carb', variant: 'carb' });
    if (totalTime > 0 && totalTime <= 15) tags.push({ label: `${totalTime} min`, variant: 'time' });
    return tags;
  }, [selectedRecipe?.id, selectedRecipe?.protein, selectedRecipe?.calories, selectedRecipe?.carbs, selectedRecipe?.time_category, totalTime]);

  const difficulty = useMemo(() => {
    if (!selectedRecipe) return 'Easy';
    if (totalTime >= 45) return 'Advanced';
    if (totalTime >= 25) return 'Medium';
    return 'Easy';
  }, [totalTime, selectedRecipe?.id]);

  const toggleIngredient = (idx) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleStep = (idx) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div className="recipes-page">
      {/* Header */}
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <div className="header-text">
          <h1>Recipes</h1>
          <p>{isCoach ? 'Manage recipes for your clients' : 'Find healthy meal ideas for any time'}</p>
        </div>
      </div>

      {/* Main Tabs: My Recipes vs Discover */}
      <div className="recipes-main-tabs">
        <button
          className={`recipes-main-tab ${activeTab === 'my-recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-recipes')}
        >
          <BookOpen size={18} />
          <span>{isCoach ? 'My Recipes' : 'Recipes'}</span>
        </button>
        <button
          className={`recipes-main-tab ${activeTab === 'discover' ? 'active' : ''}`}
          onClick={() => setActiveTab('discover')}
        >
          <Globe size={18} />
          <span>Discover</span>
        </button>
      </div>

      {activeTab === 'my-recipes' ? (
        <>
          {/* Coach: Add Recipe button */}
          {isCoach && (
            <div style={{ padding: '12px 16px 0', display: 'flex', gap: '8px' }}>
              <button
                className="recipe-add-btn"
                onClick={openCreateForm}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: '#2cb5a5', color: 'white', border: 'none',
                  borderRadius: '10px', padding: '12px 20px', fontSize: '15px',
                  fontWeight: '600', cursor: 'pointer', flex: '1',
                  justifyContent: 'center'
                }}
              >
                <Plus size={18} />
                Add New Recipe
              </button>
              <button
                onClick={() => { setShowYoutubeImport(true); setYoutubeUrl(''); setYoutubeError(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: '#dc2626', color: 'white', border: 'none',
                  borderRadius: '10px', padding: '12px 16px', fontSize: '15px',
                  fontWeight: '600', cursor: 'pointer',
                  justifyContent: 'center'
                }}
              >
                <Youtube size={18} />
              </button>
            </div>
          )}

          {/* Category Tabs */}
          <div className="category-tabs-scroll">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  className={`category-tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <Icon size={20} className="category-icon" strokeWidth={2} />
                  <span className="category-label">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* My Recipes Content */}
          <div className="recipes-content">
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading recipes...</p>
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📖</div>
                <h3 className="empty-state-title">No recipes yet</h3>
                <p className="empty-state-text">
                  {isCoach
                    ? 'Tap "Add New Recipe" to create recipes your clients can see!'
                    : 'Your coach will add recipes here soon!'}
                </p>
              </div>
            ) : (
              <div className="recipes-grid">
                {filteredRecipes.map(recipe => (
                  <div
                    key={recipe.id}
                    className="recipe-card"
                    onClick={() => setSelectedRecipe(recipe)}
                  >
                    {recipe.image_url ? (
                      <img src={recipe.image_url} alt={recipe.name} className="recipe-image" loading="lazy" decoding="async" />
                    ) : (
                      <div className="recipe-image-placeholder">🍳</div>
                    )}
                    <div className="recipe-card-content">
                      <div className="recipe-time-badges">
                        {recipe.prep_time_minutes ? (
                          <div className="recipe-time-badge">
                            <Clock size={12} />
                            Prep {recipe.prep_time_minutes} min
                          </div>
                        ) : null}
                        {recipe.cook_time_minutes ? (
                          <div className="recipe-time-badge">
                            <Clock size={12} />
                            Cook {recipe.cook_time_minutes} min
                          </div>
                        ) : null}
                        {!recipe.prep_time_minutes && !recipe.cook_time_minutes && (
                          <div className="recipe-time-badge">
                            <Clock size={12} />
                            {CATEGORY_LABELS[recipe.time_category] || recipe.time_category}
                          </div>
                        )}
                      </div>
                      <h3 className="recipe-name">{recipe.name}</h3>
                      {(recipe.calories || recipe.protein || recipe.carbs) ? (
                        <div className="recipe-macros">
                          {recipe.calories ? <span><strong>{recipe.calories}</strong> cal</span> : null}
                          {recipe.protein ? <span><strong>{recipe.protein}g</strong> protein</span> : null}
                          {recipe.carbs ? <span><strong>{recipe.carbs}g</strong> carbs</span> : null}
                        </div>
                      ) : null}
                      {isCoach && !recipe.is_public && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <EyeOff size={11} /> Hidden from clients
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Discover Search */}
          <div className="discover-search-container">
            <form onSubmit={searchSpoonacular} className="discover-search-form">
              <div className="discover-search-input-wrapper">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search recipes... (e.g., chicken, pasta, salad)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="discover-search-input"
                />
              </div>
              <select
                value={selectedDiet}
                onChange={(e) => setSelectedDiet(e.target.value)}
                className="discover-diet-select"
              >
                {DIET_OPTIONS.map(diet => (
                  <option key={diet.value} value={diet.value}>{diet.label}</option>
                ))}
              </select>
              <button type="submit" className="discover-search-btn">
                <Search size={18} />
              </button>
            </form>
          </div>

          {/* Discover Content */}
          <div className="recipes-content">
            {discoverLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Finding delicious recipes...</p>
              </div>
            ) : discoverRecipes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Sparkles size={48} /></div>
                <h3 className="empty-state-title">Discover New Recipes</h3>
                <p className="empty-state-text">Search thousands of recipes from around the world!</p>
              </div>
            ) : (
              <>
                <div className="discover-results-header">
                  <span>{discoverRecipes.length} recipes found</span>
                  {hasSearched && (
                    <button className="discover-refresh-btn" onClick={loadRandomRecipes}>
                      <Sparkles size={14} /> Surprise me
                    </button>
                  )}
                </div>
                <div className="recipes-grid">
                  {discoverRecipes.map(recipe => (
                    <div
                      key={recipe.id}
                      className="recipe-card"
                      onClick={() => loadRecipeDetails(recipe)}
                    >
                      {recipe.image_url ? (
                        <img src={recipe.image_url} alt={recipe.name} className="recipe-image" loading="lazy" decoding="async" />
                      ) : (
                        <div className="recipe-image-placeholder">🍳</div>
                      )}
                      <div className="recipe-card-content">
                        <div className="recipe-time-badges">
                          {recipe.prep_time_minutes ? (
                            <div className="recipe-time-badge spoonacular">
                              <Globe size={12} />
                              Prep {recipe.prep_time_minutes} min
                            </div>
                          ) : null}
                          {recipe.cook_time_minutes ? (
                            <div className="recipe-time-badge spoonacular">
                              <Globe size={12} />
                              Cook {recipe.cook_time_minutes} min
                            </div>
                          ) : null}
                          {!recipe.prep_time_minutes && !recipe.cook_time_minutes && (
                            <div className="recipe-time-badge spoonacular">
                              <Globe size={12} />
                              Recipe
                            </div>
                          )}
                        </div>
                        <h3 className="recipe-name">{recipe.name}</h3>
                        {(recipe.calories || recipe.protein || recipe.carbs) ? (
                          <div className="recipe-macros">
                            {recipe.calories ? <span><strong>{recipe.calories}</strong> cal</span> : null}
                            {recipe.protein ? <span><strong>{recipe.protein}g</strong> P</span> : null}
                            {recipe.carbs ? <span><strong>{recipe.carbs}g</strong> C</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div className="modal-content modal-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedRecipe.name}</h2>
              <button className="modal-close" onClick={() => setSelectedRecipe(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body recipe-modal-body">
              {/* Hero image with tag overlay */}
              {selectedRecipe.image_url && (
                <div className="recipe-hero">
                  <img src={selectedRecipe.image_url} alt={selectedRecipe.name} className="recipe-hero-image" />
                  {dietTags.length > 0 && (
                    <div className="recipe-hero-tags">
                      {dietTags.slice(0, 3).map((t, i) => (
                        <span key={i} className={`recipe-tag-chip variant-${t.variant}`}>{t.label}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Meta strip */}
              <div className="recipe-meta-strip">
                {totalTime > 0 && (
                  <span className="recipe-meta-item"><Clock size={14} />{totalTime} min</span>
                )}
                <span className="recipe-meta-item"><ChefHat size={14} />{difficulty}</span>
                <span className="recipe-meta-item"><Users size={14} />{recipeServings} {recipeServings === 1 ? 'serving' : 'servings'}</span>
              </div>

              {/* Source link */}
              {selectedRecipe.source_url && (
                <a
                  href={selectedRecipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recipe-source-link"
                >
                  <Link size={16} /> {
                    selectedRecipe.source_url.includes('youtube.com') || selectedRecipe.source_url.includes('youtu.be')
                      ? 'Watch on YouTube'
                      : selectedRecipe.source_url.includes('instagram.com')
                      ? 'View on Instagram'
                      : selectedRecipe.source_url.includes('tiktok.com')
                      ? 'View on TikTok'
                      : 'View Recipe Link'
                  }
                </a>
              )}

              {/* Nutrition card: macro bar + % of daily goal (display only) */}
              {(selectedRecipe.calories || selectedRecipe.protein || selectedRecipe.carbs || selectedRecipe.fat) ? (
                <div className="recipe-section recipe-nutrition-section">
                  <h4 className="recipe-section-title">Nutrition Per Serving</h4>

                  <div className="recipe-macro-card">
                    <div className="recipe-macro-headline">
                      <div className="macro-headline-main">
                        <Flame size={18} className="macro-headline-icon" />
                        <span className="macro-headline-value">{selectedRecipe.calories ?? '—'}</span>
                        <span className="macro-headline-unit">kcal</span>
                      </div>
                      {!isCoach && dailyGoals && selectedRecipe.calories ? (
                        <span className="macro-headline-goal">
                          {Math.round((selectedRecipe.calories / dailyGoals.calories) * 100)}% of daily goal
                        </span>
                      ) : null}
                    </div>

                    {macroBreakdown && (
                      <div className="macro-stacked-bar" role="img" aria-label="Macro distribution">
                        <div className="macro-bar-segment seg-protein" style={{ width: `${macroBreakdown.proteinPct}%` }} />
                        <div className="macro-bar-segment seg-carbs" style={{ width: `${macroBreakdown.carbsPct}%` }} />
                        <div className="macro-bar-segment seg-fat" style={{ width: `${macroBreakdown.fatPct}%` }} />
                      </div>
                    )}

                    <div className="macro-rows">
                      {[
                        { key: 'protein', label: 'Protein', val: selectedRecipe.protein, color: 'protein', goal: dailyGoals?.protein },
                        { key: 'carbs', label: 'Carbs', val: selectedRecipe.carbs, color: 'carbs', goal: dailyGoals?.carbs },
                        { key: 'fat', label: 'Fat', val: selectedRecipe.fat, color: 'fat', goal: dailyGoals?.fat },
                      ].map(m => (
                        <div key={m.key} className={`macro-row macro-${m.color}`}>
                          <span className="macro-row-dot" />
                          <span className="macro-row-label">{m.label}</span>
                          <span className="macro-row-value">{m.val ?? 0}g</span>
                          {!isCoach && m.goal && m.val ? (
                            <span className="macro-row-pct">{Math.round((m.val / m.goal) * 100)}%</span>
                          ) : <span className="macro-row-pct" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Description */}
              {selectedRecipe.description && (
                <p className="recipe-description">{selectedRecipe.description}</p>
              )}

              {/* Ingredients - tappable rows */}
              {selectedRecipe.ingredients && (() => {
                const items = parseIngredients(selectedRecipe.ingredients);
                return (
                  <div className="recipe-section">
                    <div className="recipe-section-header">
                      <h4 className="recipe-section-title">
                        Ingredients <span className="recipe-section-count">· {items.length}</span>
                      </h4>
                      {checkedIngredients.size > 0 && (
                        <button
                          type="button"
                          className="recipe-section-action"
                          onClick={() => setCheckedIngredients(new Set())}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <ul className="recipe-ingredient-rows">
                      {items.map((line, idx) => {
                        const { name, qty } = splitIngredient(line);
                        const checked = checkedIngredients.has(idx);
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              className={`ingredient-row ${checked ? 'is-checked' : ''}`}
                              onClick={() => toggleIngredient(idx)}
                            >
                              <span className="ingredient-check">
                                {checked && <Check size={14} strokeWidth={3} />}
                              </span>
                              <span className="ingredient-name">{name}</span>
                              {qty && <span className="ingredient-qty">{qty}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              {/* Instructions - step cards */}
              {selectedRecipe.instructions && (() => {
                const steps = parseSteps(selectedRecipe.instructions);
                return (
                  <div className="recipe-section">
                    <div className="recipe-section-header">
                      <h4 className="recipe-section-title">
                        Instructions <span className="recipe-section-count">· {steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
                      </h4>
                      {completedSteps.size > 0 && (
                        <button
                          type="button"
                          className="recipe-section-action"
                          onClick={() => setCompletedSteps(new Set())}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <ol className="recipe-step-list">
                      {steps.map((step, idx) => {
                        const done = completedSteps.has(idx);
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              className={`recipe-step-card ${done ? 'is-done' : ''}`}
                              onClick={() => toggleStep(idx)}
                            >
                              <span className="step-number">
                                {done ? <Check size={14} strokeWidth={3} /> : idx + 1}
                              </span>
                              <span className="step-text">{step}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })()}
            </div>

            {/* Sticky action bar */}
            <div className="recipe-modal-cta">
              {isCoach ? (
                <>
                  {selectedRecipe.source !== 'spoonacular' && (
                    <button
                      className="cta-secondary cta-danger"
                      onClick={() => handleDeleteRecipe(selectedRecipe)}
                      aria-label="Delete recipe"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button
                    className="cta-secondary"
                    onClick={handleDownloadPDF}
                    aria-label="Download PDF"
                  >
                    <Download size={18} />
                  </button>
                  {selectedRecipe.source !== 'spoonacular' ? (
                    <button className="cta-primary" onClick={() => openEditForm(selectedRecipe)}>
                      <Edit3 size={18} />
                      <span>Edit Recipe</span>
                    </button>
                  ) : (
                    <button className="cta-primary" onClick={handleDownloadPDF}>
                      <Download size={18} />
                      <span>Download</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="cta-secondary"
                    onClick={handleFavorite}
                    aria-label="Save to favorites"
                  >
                    <Heart size={18} />
                  </button>
                  <button
                    className="cta-secondary"
                    onClick={handleDownloadPDF}
                    aria-label="Download PDF"
                  >
                    <Download size={18} />
                  </button>
                  <button className="cta-primary" onClick={handleLogToDiary}>
                    <Plus size={18} />
                    <span>Log to Diary</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coach: Add/Edit Recipe Modal */}
      {showRecipeForm && (
        <div className="modal-overlay" onClick={() => setShowRecipeForm(false)}>
          <div className="modal-content modal-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRecipe ? 'Edit Recipe' : 'New Recipe'}</h2>
              <button className="modal-close" onClick={() => setShowRecipeForm(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="recipe-form">
                {/* Name */}
                <div className="form-group">
                  <label className="form-label">Recipe Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    placeholder="e.g., Protein Smoothie Bowl"
                    className="form-input"
                  />
                </div>

                {/* Description */}
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    placeholder="Short description..."
                    className="form-input"
                  />
                </div>

                {/* Category */}
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    value={formData.time_category}
                    onChange={(e) => handleFormChange('time_category', e.target.value)}
                    className="form-input"
                  >
                    <option value="grab_go">Grab & Go (5 min)</option>
                    <option value="quick">Quick (15 min or less)</option>
                    <option value="meal_prep">Meal Prep</option>
                    <option value="family">Family Dinner (30+ min)</option>
                  </select>
                </div>

                {/* Time & Servings Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Prep (min)</label>
                    <input
                      type="number"
                      value={formData.prep_time_minutes}
                      onChange={(e) => handleFormChange('prep_time_minutes', e.target.value)}
                      placeholder="10"
                      className="form-input"
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cook (min)</label>
                    <input
                      type="number"
                      value={formData.cook_time_minutes}
                      onChange={(e) => handleFormChange('cook_time_minutes', e.target.value)}
                      placeholder="20"
                      className="form-input"
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Servings</label>
                    <input
                      type="number"
                      value={formData.servings}
                      onChange={(e) => handleFormChange('servings', e.target.value)}
                      placeholder="1"
                      className="form-input"
                      min="1"
                    />
                  </div>
                </div>

                {/* Macros Row */}
                <label className="form-label" style={{ marginBottom: '4px' }}>Nutrition (per serving)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <input
                      type="number"
                      value={formData.calories}
                      onChange={(e) => handleFormChange('calories', e.target.value)}
                      placeholder="Cal"
                      className="form-input"
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="number"
                      value={formData.protein}
                      onChange={(e) => handleFormChange('protein', e.target.value)}
                      placeholder="P (g)"
                      className="form-input"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="number"
                      value={formData.carbs}
                      onChange={(e) => handleFormChange('carbs', e.target.value)}
                      placeholder="C (g)"
                      className="form-input"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="number"
                      value={formData.fat}
                      onChange={(e) => handleFormChange('fat', e.target.value)}
                      placeholder="F (g)"
                      className="form-input"
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>

                {/* Ingredients */}
                <div className="form-group">
                  <label className="form-label">Ingredients</label>
                  <textarea
                    value={formData.ingredients}
                    onChange={(e) => handleFormChange('ingredients', e.target.value)}
                    placeholder={"One ingredient per line:\nChicken breast, 6oz\nBroccoli, 1 cup\nOlive oil, 1 tbsp"}
                    className="form-input form-textarea"
                    rows={4}
                  />
                </div>

                {/* Instructions */}
                <div className="form-group">
                  <label className="form-label">Instructions</label>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => handleFormChange('instructions', e.target.value)}
                    placeholder={"One step per line:\n1. Preheat oven to 400F\n2. Season chicken\n3. Bake for 25 minutes"}
                    className="form-input form-textarea"
                    rows={4}
                  />
                </div>

                {/* Image Upload */}
                <div className="form-group">
                  <label className="form-label">Recipe Photo (optional)</label>
                  {(imagePreview || formData.image_url) ? (
                    <div style={{
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '2px solid #e2e8f0'
                    }}>
                      <img
                        src={imagePreview || formData.image_url}
                        alt="Recipe preview"
                        style={{
                          width: '100%',
                          height: '180px',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                      />
                      {uploadingImage && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: '14px', fontWeight: '600'
                        }}>
                          Uploading...
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={removeImage}
                        style={{
                          position: 'absolute', top: '8px', right: '8px',
                          background: 'rgba(0,0,0,0.6)', color: 'white',
                          border: 'none', borderRadius: '50%',
                          width: '28px', height: '28px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: '8px', padding: '24px',
                      border: '2px dashed #cbd5e1',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, background 0.2s',
                      background: 'var(--gray-50)'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#2cb5a5'; e.currentTarget.style.background = 'var(--gray-100)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--gray-300)'; e.currentTarget.style.background = 'var(--gray-50)'; }}
                    >
                      <Camera size={32} color="#94a3b8" />
                      <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>
                        Tap to upload a photo
                      </span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        JPG, PNG up to 5MB
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>

                {/* Source URL for links */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Link size={14} /> Recipe Link (optional)
                  </label>
                  <input
                    type="url"
                    value={formData.source_url}
                    onChange={(e) => handleFormChange('source_url', e.target.value)}
                    placeholder="YouTube, Instagram, website URL..."
                    className="form-input"
                  />
                  {formData.source_url && (
                    <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                      This link will be shown on the recipe for clients to view
                    </span>
                  )}
                </div>

                {/* Visibility toggle */}
                <div
                  className="form-group"
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                  onClick={() => handleFormChange('is_public', !formData.is_public)}
                >
                  {formData.is_public ? <Eye size={18} color="#2cb5a5" /> : <EyeOff size={18} color="#6b7280" />}
                  <span style={{ fontSize: '14px', color: formData.is_public ? '#2cb5a5' : '#6b7280' }}>
                    {formData.is_public ? 'Visible to clients' : 'Hidden from clients'}
                  </span>
                </div>

                {/* Save button */}
                <button
                  className="recipe-save-btn"
                  onClick={handleSaveRecipe}
                  disabled={saving || !formData.name.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    background: saving ? '#6b7280' : '#2cb5a5', color: 'white', border: 'none',
                    borderRadius: '10px', padding: '14px 24px', fontSize: '16px',
                    fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
                    width: '100%', marginTop: '8px',
                    opacity: !formData.name.trim() ? 0.5 : 1
                  }}
                >
                  {saving ? 'Saving...' : (editingRecipe ? 'Update Recipe' : 'Create Recipe')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* YouTube Import Modal */}
      {showYoutubeImport && (
        <div className="modal-overlay" onClick={() => !youtubeLoading && setShowYoutubeImport(false)}>
          <div className="modal-content modal-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Youtube size={22} color="#dc2626" />
                Import from YouTube
              </h2>
              <button className="modal-close" onClick={() => !youtubeLoading && setShowYoutubeImport(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                Paste a YouTube or YouTube Shorts URL. We'll extract the recipe from the video's captions using AI and pre-fill the recipe form for you.
              </p>

              <div className="form-group">
                <label className="form-label">YouTube URL</label>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeError(''); }}
                  placeholder="https://www.youtube.com/shorts/..."
                  className="form-input"
                  disabled={youtubeLoading}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleYoutubeImport(); }}
                />
              </div>

              {youtubeError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  color: '#ef4444',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}>
                  {youtubeError}
                </div>
              )}

              {youtubeLoading && (
                <div style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px',
                  textAlign: 'center'
                }}>
                  <Loader size={24} color="#2cb5a5" style={{ animation: 'spin 1s linear infinite' }} />
                  <p style={{ color: '#2cb5a5', fontSize: '14px', fontWeight: '500', marginTop: '8px' }}>
                    Extracting recipe from video...
                  </p>
                  <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                    Reading captions and organizing ingredients with AI
                  </p>
                </div>
              )}

              <button
                onClick={handleYoutubeImport}
                disabled={youtubeLoading || !youtubeUrl.trim()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: youtubeLoading ? '#6b7280' : '#dc2626', color: 'white', border: 'none',
                  borderRadius: '10px', padding: '14px 24px', fontSize: '16px',
                  fontWeight: '600', cursor: youtubeLoading ? 'not-allowed' : 'pointer',
                  width: '100%', marginTop: '8px',
                  opacity: !youtubeUrl.trim() ? 0.5 : 1
                }}
              >
                {youtubeLoading ? (
                  <>Extracting Recipe...</>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Extract Recipe with AI
                  </>
                )}
              </button>

              <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
                Works with YouTube Shorts, regular videos, and youtu.be links
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Recipes;
