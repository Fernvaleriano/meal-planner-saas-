// Netlify Function for importing diet plans from uploaded files (PDF text, TXT, CSV)
// Parses the content using Claude AI and returns a structured meal plan
// compatible with the coach planner's currentPlan format.
const Anthropic = require('@anthropic-ai/sdk');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Attempt to parse meals directly from text using regex patterns
// Returns array of meal objects or null if format isn't recognized
function tryRegexParseMeals(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  // Find lines that look like calorie/macro lines: "540 cal, 28g protein, 35g carbs, 32g fat"
  // Also handles: "540cal | P:28g C:35g F:32g", "540 calories, protein 28g, carbs 35g, fat 32g"
  const macroLinePattern = /(\d{2,4})\s*(?:cal|kcal|calories)\b/i;
  const proteinPattern = /(?:P(?:rotein)?[:\s]*)?(\d+)\s*g?\s*(?:protein|P\b)/i;
  const carbPattern = /(?:C(?:arbs?)?[:\s]*)?(\d+)\s*g?\s*(?:carbs?|C\b)/i;
  const fatPattern = /(?:F(?:at)?[:\s]*)?(\d+)\s*g?\s*(?:fat|F\b)/i;
  // Also try reversed order: "28g protein" style
  const proteinPattern2 = /(\d+)\s*g?\s*protein/i;
  const carbPattern2 = /(\d+)\s*g?\s*carb/i;
  const fatPattern2 = /(\d+)\s*g?\s*fat/i;

  // Summary line pattern (has pipe separators with multiple macro values) — skip these
  const summaryPattern = /\d[\d,]+\s*(?:cal|kcal|calories)\s*\|.*\d+\s*g?\s*(?:protein|carb|fat)/i;

  const meals = [];
  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip summary/header lines with pipe separators
    if (summaryPattern.test(line)) continue;

    // Check if this line has calorie info
    const calMatch = macroLinePattern.exec(line);
    if (!calMatch) continue;

    const calories = parseInt(calMatch[1]);
    if (calories < 50 || calories > 5000) continue; // sanity check

    // Extract macros from this line
    const protein = parseInt((proteinPattern.exec(line) || proteinPattern2.exec(line) || [])[1]) || 0;
    const carbs = parseInt((carbPattern.exec(line) || carbPattern2.exec(line) || [])[1]) || 0;
    const fat = parseInt((fatPattern.exec(line) || fatPattern2.exec(line) || [])[1]) || 0;

    // The line before the calorie line is likely the ingredients
    let ingredientLine = '';
    if (i > 0) {
      // Walk backwards to find the ingredient line (skip empty lines or lines that are also macro lines)
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].length > 0 && !macroLinePattern.test(lines[j]) && !summaryPattern.test(lines[j])) {
          ingredientLine = lines[j];
          break;
        }
      }
    }

    // The line(s) after the calorie line are instructions (until next ingredient/calorie line or end)
    let instructions = '';
    for (let j = i + 1; j < lines.length; j++) {
      // Stop if we hit another calorie line or what looks like an ingredient list (lots of commas, food items)
      if (macroLinePattern.test(lines[j])) break;
      // If the NEXT line after this one is a calorie line, this line is ingredients for the next meal
      if (j + 1 < lines.length && macroLinePattern.test(lines[j + 1]) && !summaryPattern.test(lines[j + 1])) break;
      // Skip tips/notes that start with common prefixes
      if (/^(?:easy tip|pro tip|note|tip):/i.test(lines[j])) continue;
      if (instructions) instructions += ' ';
      instructions += lines[j];
    }

    // Generate a meal name from ingredients
    let name = 'Meal';
    if (ingredientLine) {
      // Take the first few key ingredients for the name
      const parts = ingredientLine.split(',').map(p => p.trim());
      // Try to extract main food items (skip measurements)
      const foods = parts.slice(0, 3).map(p => {
        // Remove "Meal N:" prefix if present
        p = p.replace(/^Meal\s*\d+\s*:\s*/i, '');
        // Remove leading quantities like "4 whole", "1 cup", "50g", "150ml"
        return p.replace(/^[\d\/.]+\s*(?:whole|cup|cups|tbsp|tsp|oz|ounces?|slice|slices|scoop|scoops|can|cans|lbs?|g|grams?|ml|kg)?\s*/i, '').trim();
      }).filter(f => f.length > 1);
      if (foods.length > 0) {
        name = foods.join(', ');
        // Capitalize first letter
        name = name.charAt(0).toUpperCase() + name.slice(1);
      }
    }

    // Parse ingredients as array (strip "Meal N:" prefix if present)
    const cleanedIngredientLine = ingredientLine.replace(/^Meal\s*\d+\s*:\s*/i, '');
    const ingredients = cleanedIngredientLine
      ? cleanedIngredientLine.split(',').map(s => s.trim()).filter(s => s.length > 1)
      : [];

    // Assign meal type based on order
    const type = meals.length < mealTypes.length ? mealTypes[meals.length] : 'Snack';

    meals.push({
      name,
      type,
      calories,
      protein,
      carbs,
      fat,
      ingredients,
      instructions: instructions.trim()
    });
  }

  return meals.length >= 2 ? meals : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'API key not configured.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileContent } = body;

    if (!fileContent || fileContent.trim().length < 20) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Please provide the diet plan text content.' })
      };
    }

    // Truncate very long inputs to avoid token limits
    const trimmedContent = fileContent.length > 25000 ? fileContent.substring(0, 25000) : fileContent;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // --- Try regex-based direct parsing first ---
    const regexMeals = tryRegexParseMeals(trimmedContent);

    if (regexMeals && regexMeals.length >= 2) {
      // Regex parsing succeeded — build plan directly without AI
      console.log(`Regex parser found ${regexMeals.length} meals, skipping AI`);

      // Extract plan metadata from text
      let planName = 'Imported Diet Plan';
      let goal = '';
      const firstLine = trimmedContent.split(/\r?\n/)[0].trim();
      if (firstLine.length > 2 && firstLine.length < 100 && !/\d{2,4}\s*cal/i.test(firstLine)) {
        planName = firstLine;
      }
      if (/(?:cut|lean|shred|fat\s*loss|weight\s*loss|deficit)/i.test(trimmedContent)) goal = 'lose weight';
      else if (/(?:bulk|mass|gain|surplus|muscle\s*gain)/i.test(trimmedContent)) goal = 'gain muscle';
      else if (/(?:maintain|maintenance|recomp)/i.test(trimmedContent)) goal = 'maintain';

      let dayCalories = 0, dayProtein = 0, dayCarbs = 0, dayFat = 0;
      const planMeals = regexMeals.map(meal => {
        dayCalories += meal.calories;
        dayProtein += meal.protein;
        dayCarbs += meal.carbs;
        dayFat += meal.fat;
        return {
          name: meal.name,
          type: meal.type,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          ingredients: meal.ingredients,
          instructions: meal.instructions,
          isPlaceholder: false,
          isCustom: false,
          image_url: null,
          coach_note: null,
          voice_note_url: null,
          voice_note_path: null
        };
      });

      const currentPlan = [{
        day: 1,
        name: 'Day 1',
        targets: { calories: dayCalories, protein: dayProtein, carbs: dayCarbs, fat: dayFat },
        plan: planMeals
      }];

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          plan: {
            planName,
            goal,
            summary: '',
            calories: dayCalories,
            protein: dayProtein,
            carbs: dayCarbs,
            fat: dayFat,
            currentPlan
          },
          stats: {
            totalMeals: planMeals.length,
            daysCount: 1,
            avgCaloriesPerDay: dayCalories,
            avgProteinPerDay: dayProtein,
            avgCarbsPerDay: dayCarbs,
            avgFatPerDay: dayFat
          }
        })
      };
    }

    // --- Fallback: AI-based parsing ---

    // Split text into day chunks for parallel parsing
    const dayChunks = [];
    const dayPattern = /(?=(?:DAY\s+\d+|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)[:\s\-])/i;
    const parts = trimmedContent.split(dayPattern).filter(p => p.trim().length > 30);

    // Extract plan header (everything before the first day)
    let planHeader = '';
    if (parts.length > 0 && !/^(?:DAY\s+\d+|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/i.test(parts[0].trim())) {
      planHeader = parts.shift();
    }

    if (parts.length === 0) {
      // No day markers found - treat entire text as a single day
      dayChunks.push(trimmedContent);
    } else {
      dayChunks.push(...parts);
    }

    const daySystemPrompt = `You are a nutrition plan parser. Extract meal data from ONE day of a diet plan. Return ONLY valid JSON, no markdown.

Rules:
- Extract EVERY single meal. Do NOT skip any meals. Count all meals carefully before responding.
- Assign a meal type to each: "Breakfast", "Lunch", "Dinner", or "Snack"
- Preserve exact meal/food names from the source
- Extract or estimate calories, protein (g), carbs (g), and fat (g) for each meal
- If macros are provided in the source, use those exact values
- If only calories are given, estimate macros with a balanced split
- If no nutrition info is given, estimate based on common food knowledge
- Extract ingredients if listed (as array of strings)
- Extract cooking instructions or prep notes if available
- Combine items that are clearly part of the same meal into one meal entry

Format detection tips:
- Meals may NOT have explicit labels like "Breakfast:" or "Meal 1:". Look for patterns like:
  * A line listing ingredients/foods (e.g. "4 whole eggs, 2 slices bread, 1/2 avocado")
  * Followed by a calorie/macro line (e.g. "540 cal, 28g protein, 35g carbs, 32g fat")
  * Optionally followed by cooking instructions
- Each such block is a SEPARATE meal. Count how many calorie lines or macro lines exist to verify meal count.
- If a header says "3 meals + snack" or "4 meals", ensure you return exactly that many meals.
- Tips, notes, or advice paragraphs between meals are NOT separate meals - skip those.
- Give each meal a descriptive name based on its main ingredients (e.g. "Eggs with Ezekiel Bread and Avocado").

Return JSON:
{"dayName":"Monday","meals":[{"name":"Grilled Chicken with Brown Rice and Broccoli","type":"Lunch","calories":450,"protein":35,"carbs":45,"fat":10,"ingredients":["6oz chicken breast","1 cup brown rice","1 cup broccoli"],"instructions":"Grill chicken, steam broccoli, serve over rice."}]}`;

    // Parse each day chunk in parallel with Haiku
    const parseErrors = [];
    const dayParsePromises = dayChunks.map((chunk, i) =>
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: daySystemPrompt,
        messages: [{
          role: 'user',
          content: `Parse ALL meals from this diet plan text. Look carefully for EVERY meal - each group of ingredients + calories/macros is a separate meal. Do NOT skip any. Return only valid JSON.\n\n${chunk}`
        }]
      }).then(msg => {
        const text = msg.content[0]?.text || '';
        try {
          return JSON.parse(text.trim());
        } catch (e) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
          console.error(`Failed to parse day ${i + 1}:`, text.substring(0, 200));
          parseErrors.push(`Day ${i + 1}: Could not parse AI response`);
          return null;
        }
      }).catch(err => {
        console.error(`Error parsing day ${i + 1}:`, err.message);
        parseErrors.push(`Day ${i + 1}: ${err.message}`);
        return null;
      })
    );

    // Extract plan metadata from header
    let planMeta = { planName: 'Imported Diet Plan', goal: '', summary: '' };
    if (planHeader.length > 20) {
      const nameMatch = planHeader.match(/(?:MEAL\s*PLAN|DIET\s*PLAN|NUTRITION\s*PLAN|EATING\s*PLAN)[:\s-]*(.*?)(?:\n|$)/i);
      if (nameMatch && nameMatch[1].trim()) {
        planMeta.planName = nameMatch[1].trim().substring(0, 100);
      }
      if (/(?:cut|lean|shred|fat\s*loss|weight\s*loss|deficit)/i.test(planHeader)) planMeta.goal = 'lose weight';
      else if (/(?:bulk|mass|gain|surplus|muscle\s*gain)/i.test(planHeader)) planMeta.goal = 'gain muscle';
      else if (/(?:maintain|maintenance|recomp)/i.test(planHeader)) planMeta.goal = 'maintain';
    }

    // Wait for all day parses
    const dayResults = await Promise.all(dayParsePromises);
    const parsedDays = dayResults.filter(Boolean);

    if (parsedDays.length === 0) {
      const detail = parseErrors.length > 0 ? ` Errors: ${parseErrors.join('; ')}` : '';
      throw new Error(`Could not parse any days from the diet plan. Please check the format and try again.${detail}`);
    }

    // Build the plan in the format expected by the planner
    const planStats = {
      totalMeals: 0,
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      daysCount: parsedDays.length
    };

    const currentPlan = [];

    for (let i = 0; i < parsedDays.length; i++) {
      const day = parsedDays[i];
      const meals = day.meals || [];
      const dayName = day.dayName || `Day ${i + 1}`;

      let dayCalories = 0;
      let dayProtein = 0;
      let dayCarbs = 0;
      let dayFat = 0;

      const planMeals = meals.map(meal => {
        const cal = Math.round(meal.calories || 0);
        const pro = Math.round(meal.protein || 0);
        const carb = Math.round(meal.carbs || 0);
        const fat = Math.round(meal.fat || 0);

        dayCalories += cal;
        dayProtein += pro;
        dayCarbs += carb;
        dayFat += fat;

        return {
          name: meal.name || 'Unnamed Meal',
          type: meal.type || 'Snack',
          calories: cal,
          protein: pro,
          carbs: carb,
          fat: fat,
          ingredients: meal.ingredients || [],
          instructions: meal.instructions || '',
          isPlaceholder: false,
          isCustom: false,
          image_url: null,
          coach_note: null,
          voice_note_url: null,
          voice_note_path: null
        };
      });

      planStats.totalMeals += planMeals.length;
      planStats.totalCalories += dayCalories;
      planStats.totalProtein += dayProtein;
      planStats.totalCarbs += dayCarbs;
      planStats.totalFat += dayFat;

      currentPlan.push({
        day: i + 1,
        name: dayName,
        targets: {
          calories: dayCalories,
          protein: dayProtein,
          carbs: dayCarbs,
          fat: dayFat
        },
        plan: planMeals
      });
    }

    // Compute averages for the plan-level macros
    const avgCalories = Math.round(planStats.totalCalories / parsedDays.length);
    const avgProtein = Math.round(planStats.totalProtein / parsedDays.length);
    const avgCarbs = Math.round(planStats.totalCarbs / parsedDays.length);
    const avgFat = Math.round(planStats.totalFat / parsedDays.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        plan: {
          planName: planMeta.planName,
          goal: planMeta.goal,
          summary: planMeta.summary,
          calories: avgCalories,
          protein: avgProtein,
          carbs: avgCarbs,
          fat: avgFat,
          currentPlan: currentPlan
        },
        stats: {
          totalMeals: planStats.totalMeals,
          daysCount: planStats.daysCount,
          avgCaloriesPerDay: avgCalories,
          avgProteinPerDay: avgProtein,
          avgCarbsPerDay: avgCarbs,
          avgFatPerDay: avgFat
        }
      })
    };

  } catch (error) {
    console.error('Import diet plan error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to import diet plan'
      })
    };
  }
};
