import { useState, useEffect } from 'react';
import { ChevronLeft, Clock, X, Search, Sparkles, Globe, BookOpen, Heart, Download, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';

// Sample recipes fallback
const SAMPLE_RECIPES = [
  {
    id: 1,
    name: 'Protein Smoothie Bowl',
    description: 'Quick and delicious post-workout fuel',
    time_category: 'grab_go',
    prep_time_minutes: 5,
    calories: 350,
    protein: 30,
    carbs: 40,
    fat: 8,
    ingredients: 'Protein powder, Frozen berries, Banana, Almond milk, Granola topping',
    instructions: 'Blend protein powder with frozen berries, half a banana, and almond milk until thick. Pour into bowl, top with sliced banana and granola.'
  },
  {
    id: 2,
    name: 'Greek Yogurt Parfait',
    description: 'High protein grab-and-go breakfast',
    time_category: 'grab_go',
    prep_time_minutes: 3,
    calories: 280,
    protein: 25,
    carbs: 30,
    fat: 6,
    ingredients: 'Greek yogurt, Mixed berries, Honey, Granola',
    instructions: 'Layer Greek yogurt with berries and granola. Drizzle with honey.'
  },
  {
    id: 3,
    name: 'Chicken Stir Fry',
    description: 'Quick and healthy weeknight dinner',
    time_category: 'quick',
    prep_time_minutes: 15,
    calories: 420,
    protein: 35,
    carbs: 35,
    fat: 12,
    ingredients: 'Chicken breast, Mixed vegetables, Soy sauce, Garlic, Ginger, Rice',
    instructions: 'Slice chicken thin. Stir fry with vegetables, garlic, and ginger. Add soy sauce. Serve over rice.'
  },
  {
    id: 4,
    name: 'Sheet Pan Salmon & Veggies',
    description: 'One pan meal with minimal cleanup',
    time_category: 'quick',
    prep_time_minutes: 10,
    calories: 450,
    protein: 38,
    carbs: 25,
    fat: 22,
    ingredients: 'Salmon fillet, Broccoli, Sweet potato, Olive oil, Lemon, Garlic',
    instructions: 'Place salmon and cubed vegetables on sheet pan. Season with olive oil, garlic, salt. Bake at 400°F for 15 minutes.'
  },
  {
    id: 5,
    name: 'Meal Prep Chicken Bowls',
    description: 'Make 5 lunches in under an hour',
    time_category: 'meal_prep',
    prep_time_minutes: 20,
    calories: 480,
    protein: 40,
    carbs: 45,
    fat: 14,
    ingredients: 'Chicken thighs, Brown rice, Roasted vegetables, Hummus, Mixed greens',
    instructions: 'Bake seasoned chicken thighs. Cook rice. Roast vegetables. Divide into 5 containers with greens and hummus.'
  },
  {
    id: 6,
    name: 'Turkey Taco Meat',
    description: 'Versatile protein for the whole week',
    time_category: 'meal_prep',
    prep_time_minutes: 10,
    calories: 200,
    protein: 28,
    carbs: 4,
    fat: 8,
    ingredients: 'Ground turkey, Taco seasoning, Onion, Garlic, Tomato paste',
    instructions: 'Brown turkey with onion and garlic. Add taco seasoning and tomato paste. Use for tacos, bowls, or salads all week.'
  },
  {
    id: 7,
    name: 'Slow Cooker Pulled Chicken',
    description: 'Set it and forget it family meal',
    time_category: 'family',
    prep_time_minutes: 10,
    calories: 280,
    protein: 35,
    carbs: 12,
    fat: 10,
    ingredients: 'Chicken breasts, BBQ sauce, Chicken broth, Onion, Garlic powder',
    instructions: 'Place chicken in slow cooker with broth and seasonings. Cook on low 6-8 hours. Shred and mix with BBQ sauce.'
  },
  {
    id: 8,
    name: 'Healthy Beef Tacos',
    description: 'Family favorite made nutritious',
    time_category: 'family',
    prep_time_minutes: 15,
    calories: 380,
    protein: 28,
    carbs: 30,
    fat: 16,
    ingredients: 'Lean ground beef, Corn tortillas, Lettuce, Tomato, Cheese, Greek yogurt (sour cream sub)',
    instructions: 'Brown beef with taco seasoning. Warm tortillas. Let family build their own tacos with toppings.'
  }
];

const CATEGORIES = [
  { id: 'all', icon: '📖', label: 'All' },
  { id: 'grab_go', icon: '⚡', label: 'Grab & Go' },
  { id: 'quick', icon: '⏱️', label: 'Quick' },
  { id: 'meal_prep', icon: '📦', label: 'Meal Prep' },
  { id: 'family', icon: '👨‍👩‍👧‍👦', label: 'Family' }
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

function Recipes() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  // Discover tab state
  const [activeTab, setActiveTab] = useState('my-recipes'); // 'my-recipes' or 'discover'
  const [discoverRecipes, setDiscoverRecipes] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiet, setSelectedDiet] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, [clientData?.id]);

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

  const loadRecipes = async () => {
    setLoading(true);
    try {
      // Try to fetch from API - this would be a recipes endpoint
      const data = await apiGet(`/.netlify/functions/get-recipes?clientId=${clientData?.id}&coachId=${clientData?.coach_id}`);
      if (data?.recipes && data.recipes.length > 0) {
        setRecipes(data.recipes);
      } else {
        // Fallback to sample recipes
        setRecipes(SAMPLE_RECIPES);
      }
    } catch (err) {
      console.error('Error loading recipes:', err);
      // Use sample recipes as fallback
      setRecipes(SAMPLE_RECIPES);
    } finally {
      setLoading(false);
    }
  };

  const loadRandomRecipes = async () => {
    setDiscoverLoading(true);
    try {
      const data = await apiGet('/.netlify/functions/spoonacular-recipes?action=random&number=12');
      setDiscoverRecipes(data.recipes || []);
    } catch (err) {
      console.error('Error loading discover recipes:', err);
    } finally {
      setDiscoverLoading(false);
    }
  };

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
      // Fall back to basic info
      setSelectedRecipe(recipe);
    }
  };

  const filteredRecipes = activeCategory === 'all'
    ? recipes
    : recipes.filter(r => r.time_category === activeCategory);

  // Save recipe to favorites
  const handleFavorite = async () => {
    if (!selectedRecipe || !clientData?.id) {
      alert('Unable to save. Please try again.');
      return;
    }

    try {
      await apiPost('/.netlify/functions/favorites', {
        clientId: clientData.id,
        action: 'add',
        food: {
          food_name: selectedRecipe.name,
          calories: selectedRecipe.calories || 0,
          protein: selectedRecipe.protein || 0,
          carbs: selectedRecipe.carbs || 0,
          fat: selectedRecipe.fat || 0,
          serving_size: selectedRecipe.servings ? `${selectedRecipe.servings} serving(s)` : '1 serving',
          source: selectedRecipe.source || 'recipe'
        }
      });
      alert('Recipe saved to favorites!');
    } catch (err) {
      console.error('Error saving favorite:', err);
      alert('Could not save to favorites. Please try again.');
    }
  };

  // Log recipe to food diary
  const handleLogToDiary = () => {
    if (!selectedRecipe) return;

    // Navigate to diary with recipe data to log
    const recipeData = {
      food_name: selectedRecipe.name,
      calories: selectedRecipe.calories || 0,
      protein: selectedRecipe.protein || 0,
      carbs: selectedRecipe.carbs || 0,
      fat: selectedRecipe.fat || 0
    };

    // Store in sessionStorage so Diary can pick it up
    sessionStorage.setItem('pendingFoodLog', JSON.stringify(recipeData));
    navigate('/diary?action=log');
  };

  // Download recipe as PDF
  const handleDownloadPDF = () => {
    if (!selectedRecipe) return;

    // Create a printable HTML document
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${selectedRecipe.name} - Recipe</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #0d9488; margin-bottom: 8px; }
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
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>${selectedRecipe.name}</h1>
        ${selectedRecipe.prep_time_minutes ? `<p class="subtitle">Prep time: ${selectedRecipe.prep_time_minutes} minutes</p>` : ''}

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
          Downloaded from Zique Fitness
        </div>
      </body>
      </html>
    `;

    // Open in new window for printing/saving as PDF
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
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
          <p>Find healthy meal ideas for any time</p>
        </div>
      </div>

      {/* Main Tabs: My Recipes vs Discover */}
      <div className="recipes-main-tabs">
        <button
          className={`recipes-main-tab ${activeTab === 'my-recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-recipes')}
        >
          <BookOpen size={18} />
          <span>My Recipes</span>
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
          {/* Category Tabs */}
          <div className="category-tabs-scroll">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`category-tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="category-icon">{cat.icon}</span>
                <span className="category-label">{cat.label}</span>
              </button>
            ))}
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
                <p className="empty-state-text">Your coach will add recipes here soon!</p>
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
                      <img src={recipe.image_url} alt={recipe.name} className="recipe-image" />
                    ) : (
                      <div className="recipe-image-placeholder">🍳</div>
                    )}
                    <div className="recipe-card-content">
                      <div className="recipe-time-badge">
                        <Clock size={12} />
                        {recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : CATEGORY_LABELS[recipe.time_category] || recipe.time_category}
                      </div>
                      <h3 className="recipe-name">{recipe.name}</h3>
                      <div className="recipe-macros">
                        <span><strong>{recipe.calories || '-'}</strong> cal</span>
                        <span><strong>{recipe.protein || '-'}g</strong> protein</span>
                        <span><strong>{recipe.carbs || '-'}g</strong> carbs</span>
                      </div>
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
                        <img src={recipe.image_url} alt={recipe.name} className="recipe-image" />
                      ) : (
                        <div className="recipe-image-placeholder">🍳</div>
                      )}
                      <div className="recipe-card-content">
                        <div className="recipe-time-badge spoonacular">
                          <Globe size={12} />
                          {recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : 'Recipe'}
                        </div>
                        <h3 className="recipe-name">{recipe.name}</h3>
                        <div className="recipe-macros">
                          <span><strong>{recipe.calories || '-'}</strong> cal</span>
                          <span><strong>{recipe.protein || '-'}g</strong> P</span>
                          <span><strong>{recipe.carbs || '-'}g</strong> C</span>
                        </div>
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
            <div className="modal-body">
              {selectedRecipe.image_url && (
                <img src={selectedRecipe.image_url} alt={selectedRecipe.name} className="recipe-modal-image" />
              )}

              {/* Nutrition */}
              <div className="recipe-section">
                <h4 className="recipe-section-title">Nutrition Per Serving</h4>
                <div className="recipe-nutrition-grid">
                  <div className="nutrition-box">
                    <span className="nutrition-value calories">{selectedRecipe.calories || '-'}</span>
                    <span className="nutrition-label">Calories</span>
                  </div>
                  <div className="nutrition-box">
                    <span className="nutrition-value protein">{selectedRecipe.protein || '-'}g</span>
                    <span className="nutrition-label">Protein</span>
                  </div>
                  <div className="nutrition-box">
                    <span className="nutrition-value carbs">{selectedRecipe.carbs || '-'}g</span>
                    <span className="nutrition-label">Carbs</span>
                  </div>
                  <div className="nutrition-box">
                    <span className="nutrition-value fat">{selectedRecipe.fat || '-'}g</span>
                    <span className="nutrition-label">Fat</span>
                  </div>
                </div>
              </div>

              {/* Ingredients */}
              {selectedRecipe.ingredients && (
                <div className="recipe-section">
                  <h4 className="recipe-section-title">Ingredients</h4>
                  <ul className="recipe-ingredients-list">
                    {selectedRecipe.ingredients.includes('\n')
                      ? selectedRecipe.ingredients.split('\n').filter(i => i.trim()).map((item, idx) => (
                          <li key={idx}>{item.trim()}</li>
                        ))
                      : selectedRecipe.ingredients.split(',').map((item, idx) => (
                          <li key={idx}>{item.trim()}</li>
                        ))
                    }
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {selectedRecipe.instructions && (
                <div className="recipe-section">
                  <h4 className="recipe-section-title">Instructions</h4>
                  <div className="recipe-instructions">
                    {selectedRecipe.instructions.includes('\n')
                      ? selectedRecipe.instructions.split('\n').filter(i => i.trim()).map((step, idx) => (
                          <p key={idx} className="recipe-step">{step}</p>
                        ))
                      : <p>{selectedRecipe.instructions}</p>
                    }
                  </div>
                </div>
              )}

              {/* Source link for Spoonacular recipes */}
              {selectedRecipe.source_url && (
                <a
                  href={selectedRecipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recipe-source-link"
                >
                  <Globe size={14} /> View Original Recipe
                </a>
              )}

              {/* Action buttons */}
              <div className="recipe-action-buttons">
                <button className="recipe-action-btn favorite" onClick={handleFavorite}>
                  <Heart size={18} />
                  <span>Favorite</span>
                </button>
                <button className="recipe-action-btn log" onClick={handleLogToDiary}>
                  <Plus size={18} />
                  <span>Log to Diary</span>
                </button>
                <button className="recipe-action-btn download" onClick={handleDownloadPDF}>
                  <Download size={18} />
                  <span>Download</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Recipes;
