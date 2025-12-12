import { useState, useEffect } from 'react';
import { ChevronLeft, Clock, X } from 'lucide-react';
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

function Recipes() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  useEffect(() => {
    loadRecipes();
  }, [clientData?.id]);

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

  const filteredRecipes = activeCategory === 'all'
    ? recipes
    : recipes.filter(r => r.time_category === activeCategory);

  const handleRequestRecipe = async () => {
    if (!selectedRecipe || !clientData?.id || !clientData?.coach_id) {
      alert('Unable to send request. Please try again.');
      return;
    }

    try {
      await apiPost('/.netlify/functions/request-recipe', {
        recipeId: selectedRecipe.id,
        clientId: clientData.id,
        coachId: clientData.coach_id
      });
      alert('Request sent! Your coach will review it.');
      setSelectedRecipe(null);
    } catch (err) {
      console.error('Error requesting recipe:', err);
      alert('Could not send request. Please try again.');
    }
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

      {/* Recipes Content */}
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
                    {selectedRecipe.ingredients.split(',').map((item, idx) => (
                      <li key={idx}>{item.trim()}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {selectedRecipe.instructions && (
                <div className="recipe-section">
                  <h4 className="recipe-section-title">Instructions</h4>
                  <p className="recipe-instructions">{selectedRecipe.instructions}</p>
                </div>
              )}

              <button className="btn-primary full-width" onClick={handleRequestRecipe}>
                Add to My Meal Plan Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Recipes;
