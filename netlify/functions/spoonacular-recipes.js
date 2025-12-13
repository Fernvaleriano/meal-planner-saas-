const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;
const SPOONACULAR_API_URL = 'https://api.spoonacular.com';

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    // Handle CORS preflight
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    // Authenticate request
    const { user, error: authError } = await authenticateRequest(event);
    if (authError) return authError;

    if (!SPOONACULAR_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Spoonacular API not configured' })
        };
    }

    const params = event.queryStringParameters || {};
    const action = params.action || 'search';

    try {
        if (action === 'search') {
            // Search recipes
            const query = params.query || '';
            const diet = params.diet || ''; // vegetarian, vegan, paleo, etc.
            const maxCalories = params.maxCalories || '';
            const minProtein = params.minProtein || '';
            const type = params.type || ''; // main course, snack, breakfast, etc.
            const number = params.number || 12;

            let url = `${SPOONACULAR_API_URL}/recipes/complexSearch?apiKey=${SPOONACULAR_API_KEY}`;
            url += `&number=${number}`;
            url += '&addRecipeNutrition=true';
            url += '&fillIngredients=true';

            if (query) url += `&query=${encodeURIComponent(query)}`;
            if (diet) url += `&diet=${encodeURIComponent(diet)}`;
            if (maxCalories) url += `&maxCalories=${maxCalories}`;
            if (minProtein) url += `&minProtein=${minProtein}`;
            if (type) url += `&type=${encodeURIComponent(type)}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Spoonacular API error');
            }

            // Transform results to match our recipe format
            const recipes = (data.results || []).map(recipe => {
                const nutrition = recipe.nutrition?.nutrients || [];
                const calories = nutrition.find(n => n.name === 'Calories')?.amount || 0;
                const protein = nutrition.find(n => n.name === 'Protein')?.amount || 0;
                const carbs = nutrition.find(n => n.name === 'Carbohydrates')?.amount || 0;
                const fat = nutrition.find(n => n.name === 'Fat')?.amount || 0;

                return {
                    id: `spoonacular_${recipe.id}`,
                    spoonacular_id: recipe.id,
                    name: recipe.title,
                    image_url: recipe.image,
                    prep_time_minutes: recipe.readyInMinutes || 0,
                    servings: recipe.servings || 1,
                    calories: Math.round(calories),
                    protein: Math.round(protein),
                    carbs: Math.round(carbs),
                    fat: Math.round(fat),
                    source: 'spoonacular',
                    // Map time category based on prep time
                    time_category: recipe.readyInMinutes <= 10 ? 'grab_go'
                        : recipe.readyInMinutes <= 20 ? 'quick'
                        : recipe.readyInMinutes <= 45 ? 'meal_prep'
                        : 'family'
                };
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    recipes,
                    totalResults: data.totalResults || recipes.length
                })
            };

        } else if (action === 'details') {
            // Get full recipe details
            const recipeId = params.id;
            if (!recipeId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Recipe ID required' })
                };
            }

            const url = `${SPOONACULAR_API_URL}/recipes/${recipeId}/information?apiKey=${SPOONACULAR_API_KEY}&includeNutrition=true`;
            const response = await fetch(url);
            const recipe = await response.json();

            if (!response.ok) {
                throw new Error(recipe.message || 'Spoonacular API error');
            }

            const nutrition = recipe.nutrition?.nutrients || [];
            const calories = nutrition.find(n => n.name === 'Calories')?.amount || 0;
            const protein = nutrition.find(n => n.name === 'Protein')?.amount || 0;
            const carbs = nutrition.find(n => n.name === 'Carbohydrates')?.amount || 0;
            const fat = nutrition.find(n => n.name === 'Fat')?.amount || 0;

            // Format ingredients
            const ingredients = (recipe.extendedIngredients || [])
                .map(ing => ing.original)
                .join('\n');

            // Format instructions
            const instructions = recipe.instructions
                ? recipe.instructions.replace(/<[^>]*>/g, '') // Strip HTML
                : (recipe.analyzedInstructions?.[0]?.steps || [])
                    .map((step, i) => `${i + 1}. ${step.step}`)
                    .join('\n');

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id: `spoonacular_${recipe.id}`,
                    spoonacular_id: recipe.id,
                    name: recipe.title,
                    description: recipe.summary?.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
                    image_url: recipe.image,
                    prep_time_minutes: recipe.readyInMinutes || 0,
                    servings: recipe.servings || 1,
                    calories: Math.round(calories),
                    protein: Math.round(protein),
                    carbs: Math.round(carbs),
                    fat: Math.round(fat),
                    ingredients,
                    instructions,
                    source_url: recipe.sourceUrl,
                    source: 'spoonacular',
                    diets: recipe.diets || [],
                    time_category: recipe.readyInMinutes <= 10 ? 'grab_go'
                        : recipe.readyInMinutes <= 20 ? 'quick'
                        : recipe.readyInMinutes <= 45 ? 'meal_prep'
                        : 'family'
                })
            };

        } else if (action === 'random') {
            // Get random recipes (for discovery)
            const tags = params.tags || ''; // comma separated: vegetarian,dessert
            const number = params.number || 6;

            let url = `${SPOONACULAR_API_URL}/recipes/random?apiKey=${SPOONACULAR_API_KEY}`;
            url += `&number=${number}`;
            if (tags) url += `&tags=${encodeURIComponent(tags)}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Spoonacular API error');
            }

            const recipes = (data.recipes || []).map(recipe => {
                const nutrition = recipe.nutrition?.nutrients || [];
                const calories = nutrition.find(n => n.name === 'Calories')?.amount || 0;
                const protein = nutrition.find(n => n.name === 'Protein')?.amount || 0;
                const carbs = nutrition.find(n => n.name === 'Carbohydrates')?.amount || 0;
                const fat = nutrition.find(n => n.name === 'Fat')?.amount || 0;

                return {
                    id: `spoonacular_${recipe.id}`,
                    spoonacular_id: recipe.id,
                    name: recipe.title,
                    image_url: recipe.image,
                    prep_time_minutes: recipe.readyInMinutes || 0,
                    servings: recipe.servings || 1,
                    calories: Math.round(calories),
                    protein: Math.round(protein),
                    carbs: Math.round(carbs),
                    fat: Math.round(fat),
                    source: 'spoonacular',
                    time_category: recipe.readyInMinutes <= 10 ? 'grab_go'
                        : recipe.readyInMinutes <= 20 ? 'quick'
                        : recipe.readyInMinutes <= 45 ? 'meal_prep'
                        : 'family'
                };
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ recipes })
            };

        } else if (action === 'byNutrients') {
            // Find recipes by nutrient targets - great for hitting macros!
            const minCalories = params.minCalories || '';
            const maxCalories = params.maxCalories || '';
            const minProtein = params.minProtein || '';
            const maxProtein = params.maxProtein || '';
            const minCarbs = params.minCarbs || '';
            const maxCarbs = params.maxCarbs || '';
            const number = params.number || 10;

            let url = `${SPOONACULAR_API_URL}/recipes/findByNutrients?apiKey=${SPOONACULAR_API_KEY}`;
            url += `&number=${number}`;

            if (minCalories) url += `&minCalories=${minCalories}`;
            if (maxCalories) url += `&maxCalories=${maxCalories}`;
            if (minProtein) url += `&minProtein=${minProtein}`;
            if (maxProtein) url += `&maxProtein=${maxProtein}`;
            if (minCarbs) url += `&minCarbs=${minCarbs}`;
            if (maxCarbs) url += `&maxCarbs=${maxCarbs}`;

            const response = await fetch(url);
            const recipes = await response.json();

            if (!response.ok) {
                throw new Error(recipes.message || 'Spoonacular API error');
            }

            const formattedRecipes = recipes.map(recipe => ({
                id: `spoonacular_${recipe.id}`,
                spoonacular_id: recipe.id,
                name: recipe.title,
                image_url: recipe.image,
                calories: Math.round(recipe.calories || 0),
                protein: Math.round(parseInt(recipe.protein) || 0),
                carbs: Math.round(parseInt(recipe.carbs) || 0),
                fat: Math.round(parseInt(recipe.fat) || 0),
                source: 'spoonacular',
                time_category: 'quick' // Default since we don't get prep time from this endpoint
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ recipes: formattedRecipes })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid action. Use: search, details, random, or byNutrients' })
        };

    } catch (error) {
        console.error('Spoonacular API error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch recipes', details: error.message })
        };
    }
};
