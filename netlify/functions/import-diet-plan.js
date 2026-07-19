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

// Calorie amount on a line, allowing thousands separators ("2,305 cal")
const MACRO_CAL_PATTERN = /(\d{1,3}(?:,\d{3})+|\d{2,4})\s*(?:cal|kcal|calories)\b/i;

// Extract calories + macros from a single line. Handles:
//   "540 cal, 28g protein, 35g carbs, 32g fat"
//   "540cal | P:28g C:35g F:32g"
//   "~560 cal | 40P | 60C | 17F"
function extractMacros(line) {
  const calMatch = MACRO_CAL_PATTERN.exec(line);
  if (!calMatch) return null;
  const grab = (patterns) => {
    for (const p of patterns) {
      const m = p.exec(line);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    }
    return 0;
  };
  return {
    calories: parseInt(calMatch[1].replace(/,/g, ''), 10),
    protein: grab([/(\d+)\s*g?\s*protein/i, /P(?:rotein)?[:\s]+(\d+)\s*g/i, /(\d+)\s*g?\s*P\b/]),
    carbs: grab([/(\d+)\s*g?\s*carbs?/i, /C(?:arbs?)?[:\s]+(\d+)\s*g/i, /(\d+)\s*g?\s*C\b/]),
    fat: grab([/(\d+)\s*g?\s*fat/i, /F(?:at)?[:\s]+(\d+)\s*g/i, /(\d+)\s*g?\s*F\b/]),
    calIndex: calMatch.index
  };
}

function mealTypeFromLabel(label) {
  const l = (label || '').toLowerCase();
  if (/break|brunch/.test(l)) return 'Breakfast';
  if (/lunch/.test(l)) return 'Lunch';
  if (/dinner|supper/.test(l)) return 'Dinner';
  if (/snack|workout/.test(l)) return 'Snack';
  return null;
}

// Recognize meal header lines like "MEAL 1 — BREAKFAST", "Breakfast:",
// "Meal 2 - Lunch", "Snack 1", or "Breakfast: Scrambled Eggs & Toast".
// Returns { type, dishName } or null.
function parseMealHeader(line) {
  if (line.length > 80) return null;
  const m = line.match(/^(meal\s*\d*|breakfast|brunch|lunch|dinner|supper|snacks?(?:\s*\d+)?|pre[-\s]?workout|post[-\s]?workout)\b\s*[—–\-:.)]*\s*(.*)$/i);
  if (!m) return null;
  let type = mealTypeFromLabel(m[1]);
  let rest = (m[2] || '').trim();
  // "MEAL 1 — BREAKFAST" puts the type after the meal number
  const restType = rest.match(/^(breakfast|brunch|lunch|dinner|supper|snacks?|pre[-\s]?workout|post[-\s]?workout)\b\s*[—–\-:.)]*\s*(.*)$/i);
  if (restType) {
    type = mealTypeFromLabel(restType[1]) || type;
    rest = (restType[2] || '').trim();
  }
  return { type, dishName: rest };
}

// Leading quantity/unit/descriptor words to strip when turning an
// ingredient line into part of a meal name.
const QTY_UNIT_WORDS = /^(?:whole|large|small|medium|big|cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|slices?|scoops?|cans?|lbs?|pounds?|g|grams?|ml|kg|handfuls?|pieces?|servings?|dry|cooked|raw|plain|nonfat|lowfat|of|about)\b\s*/i;

// "1/2 cup dry oats (cooked with water)" -> "oats"
function foodPhrase(raw) {
  let t = String(raw || '').replace(/\([^)]*\)/g, ' ');
  t = t.split(/[,;]/)[0];
  t = t.replace(/(\s\+\s*)[\d¼½¾][\d\s\/.¼½¾]*/g, '$1');
  t = t.replace(/^[\s\d\/.¼½¾+~-]+/, '');
  for (let k = 0; k < 4; k++) {
    const next = t.replace(QTY_UNIT_WORDS, '');
    if (next === t) break;
    t = next.replace(/^[\s\d\/.¼½¾+~-]+/, '');
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

// Build a readable meal name from its first few ingredients,
// e.g. "Eggs + egg whites, Oats, Banana"
function nameFromIngredients(ingredients) {
  const phrases = [];
  for (const ing of ingredients || []) {
    const p = foodPhrase(ing);
    if (p.length > 1 && !phrases.some(x => x.toLowerCase() === p.toLowerCase())) {
      phrases.push(p.charAt(0).toUpperCase() + p.slice(1));
    }
    if (phrases.length >= 3) break;
  }
  if (phrases.length === 0) return '';
  let name = phrases.join(', ');
  if (name.length > 60 && phrases.length > 2) name = phrases.slice(0, 2).join(', ');
  return name;
}

// Names that are just labels ("Meal 1", "BREAKFAST", "Snack 2") — never
// show these to the coach; build a real name from the foods instead.
const GENERIC_NAME_PATTERN = /^(?:meals?|breakfast|brunch|lunch|dinner|supper|snacks?|pre[-\s]?workout|post[-\s]?workout|unnamed(?:\s+meal)?)\s*\d*\s*$/i;

function polishMealName(rawName, ingredients) {
  let name = String(rawName || '').trim();
  // Strip a leading "Meal 1 —" / "Breakfast:" label when a separator follows
  name = name.replace(/^(?:meal\s*\d+|breakfast|brunch|lunch|dinner|supper|snacks?(?:\s*\d+)?|pre[-\s]?workout|post[-\s]?workout)\b\s*[—–\-:.]+\s*/i, '');
  if (GENERIC_NAME_PATTERN.test(name)) name = '';
  if (!name) name = nameFromIngredients(ingredients);
  if (!name) return 'Meal';
  if (name === name.toUpperCase() && name.length > 3) name = name.toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Attempt to parse the plan directly from text without AI.
// Returns { days: [{ name, meals: [...] }], intendedTargets } or null
// if the format isn't recognized (AI fallback handles it then).
function tryRegexParseMeals(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const separatorPattern = /^[\s─—–\-=_*·•~]{4,}$/;
  // "DAILY TOTAL: ...", "Target: ...", "Macros: ..." — never meals
  const totalsPattern = /^[^a-z0-9]*(?:daily\s+)?(?:totals?|targets?|goals?|macros)\b/i;
  const notesHeaderPattern = /^(?:notes?|tips?|guidelines?|swaps?|substitutions?|reminders?)\s*:?\s*$/i;
  const dayPattern = /^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const bulletPattern = /^[-•*▪◦–]\s+/;

  let intendedTargets = null;
  let targetsFromTargetLine = false;
  const days = [];
  let currentDay = null;
  let currentMeal = null;
  let pendingFoodLine = null;
  let inNotes = false;

  const newMeal = (props) => Object.assign(
    { type: null, dishName: '', ingredientLines: [], instructionLines: [], macros: null },
    props || {}
  );
  const ensureDay = () => {
    if (!currentDay) {
      currentDay = { name: '', meals: [] };
      days.push(currentDay);
    }
    return currentDay;
  };
  const finishMeal = () => {
    if (currentMeal && currentMeal.macros) {
      ensureDay().meals.push(currentMeal);
    }
    currentMeal = null;
  };
  const mealsSoFar = () => days.reduce((n, d) => n + d.meals.length, 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (separatorPattern.test(line)) { finishMeal(); pendingFoodLine = null; continue; }

    if (dayPattern.test(line) && !MACRO_CAL_PATTERN.test(line.slice(line.indexOf(':') + 1)) && line.length < 40) {
      finishMeal();
      pendingFoodLine = null;
      inNotes = false;
      currentDay = { name: line.replace(/[:\s]+$/, ''), meals: [] };
      days.push(currentDay);
      continue;
    }

    // Totals / target / summary lines: capture as plan targets, never as a meal.
    // Prefer an explicit "Target"/"Goal" line over a "Daily Total" line.
    if (totalsPattern.test(line)) {
      const m = extractMacros(line);
      if (m && (!intendedTargets || (!targetsFromTargetLine && /target|goal/i.test(line)))) {
        intendedTargets = { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
        targetsFromTargetLine = /target|goal/i.test(line);
      }
      finishMeal();
      pendingFoodLine = null;
      continue;
    }

    if (notesHeaderPattern.test(line)) { finishMeal(); pendingFoodLine = null; inNotes = true; continue; }
    if (inNotes) continue;

    // One-line tips between meals are not meal content
    if (/^(?:easy tip|pro tip|note|tip)s?:/i.test(line)) continue;

    const macros = extractMacros(line);
    if (macros) {
      if (macros.calories < 50 || macros.calories > 5000) { pendingFoodLine = null; continue; }
      if (currentMeal && currentMeal.macros) finishMeal();
      // Inline layout: "Breakfast: Oatmeal with Berries - 350 cal, ..." — the
      // label and/or food name sit on the same line, before the calories.
      const before = line.slice(0, macros.calIndex).replace(/[\s:\-–—|,~(]+$/, '').trim();

      // A macro line with no meal context and no name is a totals/targets
      // line, not a meal ("2,000 calories | 170g protein | ..." under the
      // plan title, or a bare totals line at the bottom).
      const titlePlusTotals = pendingFoodLine && macros.calories >= 1000 && mealsSoFar() === 0 &&
        !/[\d,]/.test(pendingFoodLine) && /\|/.test(line);
      if (!currentMeal && (!before || /^\d+$/.test(before)) && (!pendingFoodLine || titlePlusTotals)) {
        if (!intendedTargets) {
          intendedTargets = { calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
        }
        pendingFoodLine = null;
        continue;
      }

      if (!currentMeal) currentMeal = newMeal();
      if (pendingFoodLine) {
        currentMeal.ingredientLines.unshift(pendingFoodLine);
        pendingFoodLine = null;
      }
      if (before && !/^\d+$/.test(before)) {
        const header = parseMealHeader(before);
        if (header) {
          if (header.type) currentMeal.type = currentMeal.type || header.type;
          if (header.dishName) currentMeal.dishName = currentMeal.dishName || header.dishName;
        } else {
          currentMeal.dishName = currentMeal.dishName || before;
        }
      }
      currentMeal.macros = macros;
      continue;
    }

    const header = parseMealHeader(line);
    if (header) {
      finishMeal();
      pendingFoodLine = null;
      currentMeal = newMeal({ type: header.type, dishName: header.dishName });
      continue;
    }

    // Plain content line: ingredient or instruction
    const hasBulletMarker = bulletPattern.test(line);
    const isNumberedStep = /^\d+[.)]\s/.test(line);
    const cleaned = line.replace(bulletPattern, '').trim();
    const next = i + 1 < lines.length ? lines[i + 1] : '';
    const nextIsMacros = !!next && !totalsPattern.test(next) && MACRO_CAL_PATTERN.test(next);

    // "Foods on one line, then macros" layout: a non-bullet line right before
    // a calorie line is that meal's food list — hold it until the macro line.
    if (nextIsMacros && !hasBulletMarker && (!currentMeal || currentMeal.macros)) {
      finishMeal();
      pendingFoodLine = cleaned;
      continue;
    }
    if (!currentMeal) continue; // intro/header prose — ignore

    const looksLikeIngredient = hasBulletMarker || (!isNumberedStep && /^[\d¼½¾]/.test(line));
    if (looksLikeIngredient || !currentMeal.macros) {
      currentMeal.ingredientLines.push(cleaned);
    } else {
      currentMeal.instructionLines.push(cleaned);
    }
  }
  finishMeal();

  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const finalizedDays = days
    .map(day => {
      const meals = day.meals.map(m => {
        // A single comma-separated line is a list of foods; bulleted lines
        // are one food each (their commas are prep notes, keep them intact).
        let ingredients;
        if (m.ingredientLines.length === 1 && m.ingredientLines[0].includes(',')) {
          ingredients = m.ingredientLines[0].split(',').map(s => s.trim()).filter(s => s.length > 1);
        } else {
          ingredients = m.ingredientLines.filter(s => s.length > 1);
        }
        // A "dish name" that is really a food list ("4 whole eggs, 2 slices
        // bread, 1/2 avocado") becomes the ingredients instead.
        let dishName = m.dishName;
        if (ingredients.length === 0 && dishName && (/^[\d¼½¾]/.test(dishName) || dishName.split(',').length >= 3)) {
          ingredients = dishName.split(',').map(s => s.trim()).filter(s => s.length > 1);
          dishName = '';
        }
        return {
          name: polishMealName(dishName, ingredients),
          type: m.type,
          calories: m.macros.calories,
          protein: m.macros.protein,
          carbs: m.macros.carbs,
          fat: m.macros.fat,
          ingredients,
          instructions: m.instructionLines.join(' ').trim()
        };
      });

      // Safety net: a "meal" whose calories AND protein match the sum of all
      // the other meals is a daily-totals line in disguise — drop it.
      if (meals.length >= 3) {
        for (let idx = 0; idx < meals.length; idx++) {
          const c = meals[idx];
          if (c.calories < 800) continue;
          const otherCal = meals.reduce((n, x, j) => (j === idx ? n : n + x.calories), 0);
          const otherPro = meals.reduce((n, x, j) => (j === idx ? n : n + x.protein), 0);
          if (Math.abs(c.calories - otherCal) <= Math.max(60, otherCal * 0.05) &&
              Math.abs(c.protein - otherPro) <= Math.max(8, otherPro * 0.08)) {
            if (!intendedTargets) {
              intendedTargets = { calories: c.calories, protein: c.protein, carbs: c.carbs, fat: c.fat };
            }
            meals.splice(idx, 1);
            break;
          }
        }
      }

      // Fill in meal types by position for meals without an explicit label
      meals.forEach((meal, idx) => {
        if (!meal.type) meal.type = idx < mealTypes.length ? mealTypes[idx] : 'Snack';
      });

      return { name: day.name, meals };
    })
    .filter(day => day.meals.length > 0);

  const totalMeals = finalizedDays.reduce((n, d) => n + d.meals.length, 0);
  if (totalMeals < 2) return null;
  return { days: finalizedDays, intendedTargets };
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
    const regexResult = tryRegexParseMeals(trimmedContent);

    if (regexResult && regexResult.days.length > 0) {
      const intendedTargets = regexResult.intendedTargets;
      const totalMealsFound = regexResult.days.reduce((n, d) => n + d.meals.length, 0);
      console.log(`Regex parser found ${totalMealsFound} meals across ${regexResult.days.length} day(s), skipping AI`);

      // Extract plan metadata from text
      let planName = 'Imported Diet Plan';
      let goal = '';
      const firstLine = trimmedContent.split(/\r?\n/)[0].trim();
      if (
        firstLine.length > 2 && firstLine.length < 100 &&
        !MACRO_CAL_PATTERN.test(firstLine) &&
        !/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(firstLine)
      ) {
        planName = firstLine;
      }
      if (/(?:cut|lean|shred|fat\s*loss|weight\s*loss|deficit)/i.test(trimmedContent)) goal = 'lose weight';
      else if (/(?:bulk|mass|gain|surplus|muscle\s*gain)/i.test(trimmedContent)) goal = 'gain muscle';
      else if (/(?:maintain|maintenance|recomp)/i.test(trimmedContent)) goal = 'maintain';

      let sumCalories = 0, sumProtein = 0, sumCarbs = 0, sumFat = 0;
      const currentPlan = regexResult.days.map((day, i) => {
        let dayCalories = 0, dayProtein = 0, dayCarbs = 0, dayFat = 0;
        const planMeals = day.meals.map(meal => {
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
        sumCalories += dayCalories;
        sumProtein += dayProtein;
        sumCarbs += dayCarbs;
        sumFat += dayFat;
        // Daily targets: what the plan was designed for (from a "Target"/
        // "Daily Total" line) beats the sum of individual meal macros. A
        // target line may omit some macros — fall back to the sums for those.
        return {
          day: i + 1,
          name: day.name || `Day ${i + 1}`,
          targets: intendedTargets
            ? {
                calories: intendedTargets.calories || dayCalories,
                protein: intendedTargets.protein || dayProtein,
                carbs: intendedTargets.carbs || dayCarbs,
                fat: intendedTargets.fat || dayFat
              }
            : { calories: dayCalories, protein: dayProtein, carbs: dayCarbs, fat: dayFat },
          plan: planMeals
        };
      });

      const daysCount = currentPlan.length;
      const targetCalories = (intendedTargets && intendedTargets.calories) || Math.round(sumCalories / daysCount);
      const targetProtein = (intendedTargets && intendedTargets.protein) || Math.round(sumProtein / daysCount);
      const targetCarbs = (intendedTargets && intendedTargets.carbs) || Math.round(sumCarbs / daysCount);
      const targetFat = (intendedTargets && intendedTargets.fat) || Math.round(sumFat / daysCount);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          plan: {
            planName,
            goal,
            summary: '',
            calories: targetCalories,
            protein: targetProtein,
            carbs: targetCarbs,
            fat: targetFat,
            currentPlan
          },
          stats: {
            totalMeals: totalMealsFound,
            daysCount,
            avgCaloriesPerDay: targetCalories,
            avgProteinPerDay: targetProtein,
            avgCarbsPerDay: targetCarbs,
            avgFatPerDay: targetFat
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
- "name" must describe the actual food in a few words (e.g. "Scrambled Eggs, Oats & Banana"). NEVER use a generic label like "Meal 1", "Meal 2", "Breakfast", or "Snack" as the name — if the source only labels a meal "MEAL 1 — BREAKFAST", use that label for the type and build the name from the meal's foods.
- Preserve exact food/dish wording from the source where a real dish name is given
- Extract or estimate calories, protein (g), carbs (g), and fat (g) for each meal
- If macros are provided in the source, use those exact values. Shorthand like "40P | 60C | 17F" means 40g protein, 60g carbs, 17g fat.
- If only calories are given, estimate macros with a balanced split
- If no nutrition info is given, estimate based on common food knowledge
- Extract ingredients if listed (as array of strings)
- Extract cooking instructions or prep notes if available
- Combine items that are clearly part of the same meal into one meal entry
- Daily totals, daily targets, or summary lines (e.g. "DAILY TOTAL: ~2,305 cal | 200P | 220C | 68F" or "Target: 2,300 cal") are NOT meals — never include them as a meal.

Format detection tips:
- Meals may NOT have explicit labels like "Breakfast:" or "Meal 1:". Look for patterns like:
  * A line listing ingredients/foods (e.g. "4 whole eggs, 2 slices bread, 1/2 avocado")
  * Followed by a calorie/macro line (e.g. "540 cal, 28g protein, 35g carbs, 32g fat")
  * Optionally followed by cooking instructions
- The macro line may also come FIRST: a header like "MEAL 2 — LUNCH", then "~700 cal | 68P | 78C | 11F", then a bulleted list of the foods. Those bullets are the meal's ingredients.
- Each such block is a SEPARATE meal. Count how many calorie lines or macro lines exist to verify meal count.
- If a header says "3 meals + snack" or "4 meals", ensure you return exactly that many meals.
- Tips, notes, or advice paragraphs between meals are NOT separate meals - skip those.

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
          name: polishMealName(meal.name, meal.ingredients || []),
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
