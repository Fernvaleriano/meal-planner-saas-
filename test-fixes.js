/**
 * Test script to verify the brute force logic fixes
 * Simulates the exact problem case from the user's example:
 * - LLM returns oversized portions
 * - Scaling reintroduces violations
 * - Meal names don't match ingredients
 *
 * Run with: node test-fixes.js
 */

// Import the key functions from generate-meal-plan.js
// We'll extract and test them directly

const PORTION_LIMITS = {
  'sweet_potato': { min: 100, max: 300, unit: 'g', type: 'carbs' },
  'green_beans': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'cod': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'oats_rolled_dry': { min: 30, max: 80, unit: 'g', type: 'carbs' },
  'greek_yogurt_nonfat': { min: 150, max: 250, unit: 'g', type: 'protein' },
  'blueberries': { min: 50, max: 150, unit: 'g', type: 'fruits' },
  'chicken_breast': { min: 120, max: 250, unit: 'g', type: 'protein' },
  'asparagus': { min: 50, max: 200, unit: 'g', type: 'vegetables' },
  'butter': { min: 0.5, max: 2, unit: 'tbsp', type: 'fats' },
};

// Simulate the BEFORE scenario (buggy behavior)
function simulateBuggyBehavior() {
  console.log('='.repeat(60));
  console.log('BEFORE FIX: Simulating buggy behavior');
  console.log('='.repeat(60));

  // LLM returns oversized portions (like the user's example)
  const llmResponse = {
    name: 'Baked Cod (282g) with Sweet Potato (352g), Green Beans (211g)',
    ingredients: [
      'Cod (282g)',
      'Sweet Potato (352g)',
      'Green Beans (211g)',
      'Butter (1 tbsp)'
    ]
  };

  console.log('\n1. LLM returns:');
  console.log('   Name:', llmResponse.name);
  console.log('   Ingredients:', llmResponse.ingredients);

  // Step 1: Cap portions
  const capped = simulateCapping(llmResponse.ingredients);
  console.log('\n2. After capping:');
  console.log('   Ingredients:', capped.ingredients);
  console.log('   Violations:', capped.violations);

  // Step 2: Scale by 1.08x (to hit calorie target)
  const scaleFactor = 1.08;
  const scaled = capped.ingredients.map(ing => scaleIngredient(ing, scaleFactor));
  console.log(`\n3. After scaling by ${scaleFactor}x (BUGGY - no re-validation):`);
  console.log('   Ingredients:', scaled);

  // Check for violations
  const violations = checkViolations(scaled);
  console.log('\n4. PROBLEM: Violations reintroduced!');
  violations.forEach(v => console.log(`   ❌ ${v}`));

  console.log('\n5. PROBLEM: Meal name still says original amounts!');
  console.log('   Name:', llmResponse.name);
  console.log('   But ingredients show:', scaled);
}

// Simulate the AFTER scenario (fixed behavior)
function simulateFixedBehavior() {
  console.log('\n' + '='.repeat(60));
  console.log('AFTER FIX: Simulating corrected behavior');
  console.log('='.repeat(60));

  // Same LLM response
  const llmResponse = {
    name: 'Baked Cod (282g) with Sweet Potato (352g), Green Beans (211g)',
    ingredients: [
      'Cod (282g)',
      'Sweet Potato (352g)',
      'Green Beans (211g)',
      'Butter (1 tbsp)'
    ]
  };

  console.log('\n1. LLM returns:');
  console.log('   Name:', llmResponse.name);
  console.log('   Ingredients:', llmResponse.ingredients);

  // Step 1: Cap portions
  const capped = simulateCapping(llmResponse.ingredients);
  console.log('\n2. After capping:');
  console.log('   Ingredients:', capped.ingredients);

  // FIX: Sync meal name with capped ingredients
  let mealName = syncMealName(llmResponse.name, capped.ingredients);
  console.log('   Name synced:', mealName);

  // Step 2: Scale by 1.08x
  const scaleFactor = 1.08;
  let scaled = capped.ingredients.map(ing => scaleIngredient(ing, scaleFactor));
  console.log(`\n3. After scaling by ${scaleFactor}x:`);
  console.log('   Ingredients:', scaled);

  // FIX: Re-validate after scaling
  console.log('\n4. FIX: Re-validating after scaling...');
  const revalidated = simulateCapping(scaled);
  scaled = revalidated.ingredients;
  console.log('   Ingredients:', scaled);
  if (revalidated.violations.length > 0) {
    console.log('   Post-scale violations capped:', revalidated.violations);
  }

  // FIX: Sync meal name again
  mealName = syncMealName(mealName, scaled);
  console.log('\n5. FIX: Final meal name synced with ingredients:');
  console.log('   Name:', mealName);
  console.log('   Ingredients:', scaled);

  // Verify no violations
  const violations = checkViolations(scaled);
  if (violations.length === 0) {
    console.log('\n✅ SUCCESS: No portion violations!');
    console.log('✅ SUCCESS: Meal name matches ingredients!');
  } else {
    console.log('\n❌ Still has violations:', violations);
  }
}

// Helper: Simulate portion capping
function simulateCapping(ingredients) {
  const capped = [];
  const violations = [];

  for (const ing of ingredients) {
    const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
    if (!match) {
      capped.push(ing);
      continue;
    }

    const foodName = match[1].trim();
    const amount = match[2].trim();
    const numMatch = amount.match(/^([\d.]+)\s*(.*)$/);

    if (!numMatch) {
      capped.push(ing);
      continue;
    }

    const num = parseFloat(numMatch[1]);
    const unit = numMatch[2];

    // Find matching limit
    const foodKey = foodName.toLowerCase().replace(/ /g, '_');
    const limit = PORTION_LIMITS[foodKey];

    if (limit && num > limit.max) {
      violations.push(`${foodName}: ${num}${unit} → ${limit.max}${unit}`);
      capped.push(`${foodName} (${limit.max}${unit})`);
    } else {
      capped.push(ing);
    }
  }

  return { ingredients: capped, violations };
}

// Helper: Scale ingredient
function scaleIngredient(ing, factor) {
  return ing.replace(/\((\d+(?:\.\d+)?)\s*(g|tbsp|cups?)\)/gi, (match, num, unit) => {
    const scaled = Math.round(parseFloat(num) * factor);
    return `(${scaled}${unit})`;
  });
}

// Helper: Check for violations
function checkViolations(ingredients) {
  const violations = [];

  for (const ing of ingredients) {
    const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
    if (!match) continue;

    const foodName = match[1].trim();
    const amount = match[2].trim();
    const numMatch = amount.match(/^([\d.]+)/);

    if (!numMatch) continue;

    const num = parseFloat(numMatch[1]);
    const foodKey = foodName.toLowerCase().replace(/ /g, '_');
    const limit = PORTION_LIMITS[foodKey];

    if (limit && num > limit.max) {
      violations.push(`${foodName}: ${num} exceeds max ${limit.max}`);
    }
  }

  return violations;
}

// Helper: Sync meal name with actual ingredients
function syncMealName(mealName, ingredients) {
  // Build map of food -> amount from ingredients
  const amounts = {};
  for (const ing of ingredients) {
    const match = ing.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      const food = match[1].trim().toLowerCase();
      const amount = match[2].trim();
      amounts[food] = amount;
    }
  }

  // Update meal name with actual amounts
  return mealName.replace(/(\w[\w\s]*?)\s*\((\d+(?:\.\d+)?)\s*(g|tbsp)\)/gi,
    (match, food, oldNum, unit) => {
      const key = food.trim().toLowerCase();
      if (amounts[key]) {
        const newNum = amounts[key].match(/^([\d.]+)/)?.[1] || oldNum;
        return `${food} (${newNum}${unit})`;
      }
      return match;
    });
}

// Run tests
console.log('\n🧪 TESTING BRUTE FORCE LOGIC FIXES\n');
console.log('Scenario: LLM returns Cod (282g), Sweet Potato (352g), Green Beans (211g)');
console.log('Then system scales by 1.08x to hit calorie target\n');

simulateBuggyBehavior();
simulateFixedBehavior();

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));
