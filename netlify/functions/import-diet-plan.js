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

    // Preprocess: insert meal markers before sending to AI
    // Detect meal boundaries by finding calorie/macro lines (e.g. "540 cal, 28g protein, 35g carbs, 32g fat")
    function preprocessMealMarkers(text) {
      const lines = text.split('\n');
      // Match lines like "540 cal, 28g protein" but NOT summary lines like "2,500 calories | 200g protein | 250g carbs"
      const calorieLine = /\d{2,4}\s*(?:cal|kcal|calories)/i;
      const summaryLine = /\d[\d,]+\s*(?:cal|kcal|calories)\s*\|/i;
      let mealNum = 0;
      const markedLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // If this line has calorie info, the line before it is likely the ingredients line
        // and together they form a meal. Insert a marker before the ingredients line.
        if (calorieLine.test(line) && !summaryLine.test(line) && i > 0) {
          mealNum++;
          // Find the ingredient line - it's the non-empty line just before the calorie line
          // Look back to find where to insert the marker
          let insertIdx = markedLines.length - 1;
          // Skip back over empty lines
          while (insertIdx >= 0 && markedLines[insertIdx].trim() === '') insertIdx--;
          if (insertIdx >= 0 && !/^===\s*MEAL\s+\d+/i.test(markedLines[insertIdx])) {
            markedLines.splice(insertIdx, 0, `\n=== MEAL ${mealNum} ===`);
          }
        }
        markedLines.push(lines[i]);
      }
      return mealNum >= 2 ? markedLines.join('\n') : text;
    }

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
      // No day markers found - preprocess to add meal markers then treat as single day
      dayChunks.push(preprocessMealMarkers(trimmedContent));
    } else {
      // Preprocess each day chunk to add meal markers
      dayChunks.push(...parts.map(p => preprocessMealMarkers(p)));
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
