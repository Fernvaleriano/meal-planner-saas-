// Shared helper for seeding sample/demo data for new coaches.
// Used by: stripe-webhook.js (auto on signup) and seed-sample-data.js (manual trigger)

// ─── Sample Client Profiles ───────────────────────────────────────────────────
const SAMPLE_CLIENTS = [
  {
    client_name: 'Sarah Johnson (Sample)',
    email: null,
    phone: null,
    notes: 'This is a sample client to help you explore the platform. Feel free to edit or delete.',
    default_dietary_restrictions: [],
    default_goal: 'weight_loss',
    age: 28,
    gender: 'female',
    weight: 145,
    height_ft: 5,
    height_in: 5,
    activity_level: 'moderate',
    unit_system: 'imperial',
    calorie_adjustment: -300,
    diet_type: null,
    macro_preference: 'high_protein',
    meal_count: '3 meals, 2 snacks',
    budget: 'moderate',
    allergies: 'Tree nuts',
    disliked_foods: 'Mushrooms, olives',
    preferred_foods: 'Chicken, salmon, sweet potatoes, berries',
    cooking_equipment: ['oven', 'stovetop', 'blender', 'air_fryer'],
    use_protein_powder: true,
    protein_powder_brand: 'Optimum Nutrition Whey',
    protein_powder_calories: 120,
    protein_powder_protein: 24,
    protein_powder_carbs: 3,
    protein_powder_fat: 1,
    use_branded_foods: false,
    unavailable_equipment: [],
    is_sample: true
  },
  {
    client_name: 'Marcus Rivera (Sample)',
    email: null,
    phone: null,
    notes: 'Sample client — muscle building focus. Try creating a workout program and assigning it!',
    default_dietary_restrictions: [],
    default_goal: 'muscle_gain',
    age: 32,
    gender: 'male',
    weight: 185,
    height_ft: 5,
    height_in: 11,
    activity_level: 'very_active',
    unit_system: 'imperial',
    calorie_adjustment: 300,
    diet_type: null,
    macro_preference: 'high_protein',
    meal_count: '4 meals, 1 snack',
    budget: 'moderate',
    allergies: null,
    disliked_foods: 'Tofu',
    preferred_foods: 'Steak, chicken, rice, eggs, oats',
    cooking_equipment: ['oven', 'stovetop', 'grill', 'blender'],
    use_protein_powder: true,
    protein_powder_brand: 'Dymatize ISO100',
    protein_powder_calories: 110,
    protein_powder_protein: 25,
    protein_powder_carbs: 1,
    protein_powder_fat: 0,
    use_branded_foods: false,
    unavailable_equipment: [],
    is_sample: true
  }
];

// ─── Sample Meal Plan for Sarah (Weight Loss) ─────────────────────────────────
function getSarahMealPlan(clientId, clientName) {
  return {
    client_name: clientName,
    plan_name: 'Weight Loss Kickstart (Sample)',
    status: 'published',
    client_id: clientId,
    plan_data: {
      clientName: clientName,
      clientId: clientId,
      planName: 'Weight Loss Kickstart (Sample)',
      calories: 1800,
      protein: 140,
      carbs: 180,
      fat: 60,
      preference: null,
      macroPreference: 'high_protein',
      allergies: 'Tree nuts',
      dislikedFoods: 'Mushrooms, olives',
      preferredFoods: 'Chicken, salmon, sweet potatoes, berries',
      budget: 'moderate',
      currentPlan: [
        {
          day: 'Monday',
          plan: [
            {
              name: 'Greek Yogurt Parfait with Berries',
              calories: 350,
              protein: 28,
              carbs: 42,
              fat: 8,
              type: 'breakfast',
              ingredients: [
                '1 cup non-fat Greek yogurt (150g)',
                '1/2 cup mixed berries (75g)',
                '1/4 cup granola (30g)',
                '1 tbsp honey (21g)'
              ],
              instructions: 'Layer Greek yogurt in a bowl. Top with mixed berries and granola. Drizzle with honey.'
            },
            {
              name: 'Grilled Chicken & Sweet Potato Bowl',
              calories: 520,
              protein: 42,
              carbs: 52,
              fat: 14,
              type: 'lunch',
              ingredients: [
                '6 oz grilled chicken breast (170g)',
                '1 medium sweet potato, cubed and roasted (150g)',
                '2 cups mixed greens (60g)',
                '1/4 avocado, sliced (50g)',
                '1 tbsp balsamic vinaigrette (15ml)'
              ],
              instructions: 'Season and grill chicken breast. Roast sweet potato cubes at 400\u00b0F for 25 minutes. Serve over mixed greens with avocado and drizzle with vinaigrette.'
            },
            {
              name: 'Protein Shake with Banana',
              calories: 250,
              protein: 28,
              carbs: 30,
              fat: 3,
              type: 'snack',
              ingredients: [
                '1 scoop Optimum Nutrition Whey (31g)',
                '1 medium banana (118g)',
                '1 cup unsweetened almond milk (240ml)',
                'Ice'
              ],
              instructions: 'Blend all ingredients until smooth.'
            },
            {
              name: 'Baked Salmon with Asparagus & Quinoa',
              calories: 530,
              protein: 38,
              carbs: 42,
              fat: 22,
              type: 'dinner',
              ingredients: [
                '5 oz salmon fillet (140g)',
                '1 bunch asparagus, trimmed (170g)',
                '3/4 cup cooked quinoa (140g)',
                '1 tbsp olive oil (14ml)',
                'Lemon juice, garlic, salt & pepper'
              ],
              instructions: 'Season salmon with lemon, garlic, salt and pepper. Bake at 400\u00b0F for 12-15 minutes. Toss asparagus in olive oil and roast alongside. Serve over quinoa.'
            },
            {
              name: 'Apple Slices with Cottage Cheese',
              calories: 150,
              protein: 14,
              carbs: 18,
              fat: 2,
              type: 'snack',
              ingredients: [
                '1 medium apple, sliced (182g)',
                '1/2 cup low-fat cottage cheese (113g)',
                'Cinnamon to taste'
              ],
              instructions: 'Slice apple and serve with cottage cheese. Sprinkle with cinnamon.'
            }
          ]
        },
        {
          day: 'Tuesday',
          plan: [
            {
              name: 'Veggie Egg White Scramble',
              calories: 300,
              protein: 30,
              carbs: 22,
              fat: 10,
              type: 'breakfast',
              ingredients: [
                '5 egg whites (165g)',
                '1 whole egg',
                '1/2 cup bell peppers, diced (75g)',
                '1/4 cup onion, diced (40g)',
                '1 cup spinach (30g)',
                '1 slice whole wheat toast'
              ],
              instructions: 'Scramble egg whites and whole egg in a non-stick pan. Add diced bell peppers, onion, and spinach. Cook until vegetables are tender. Serve with toast.'
            },
            {
              name: 'Turkey & Avocado Lettuce Wraps',
              calories: 420,
              protein: 35,
              carbs: 18,
              fat: 24,
              type: 'lunch',
              ingredients: [
                '5 oz sliced turkey breast (140g)',
                '4 large butter lettuce leaves',
                '1/2 avocado, sliced (68g)',
                '1/4 cup shredded carrots (28g)',
                '2 tbsp hummus (30g)'
              ],
              instructions: 'Lay turkey slices on lettuce leaves. Top with avocado, shredded carrots, and hummus. Roll up and enjoy.'
            },
            {
              name: 'Mixed Berry Protein Smoothie',
              calories: 220,
              protein: 26,
              carbs: 26,
              fat: 2,
              type: 'snack',
              ingredients: [
                '1 scoop whey protein (31g)',
                '3/4 cup frozen mixed berries (113g)',
                '1 cup unsweetened almond milk (240ml)'
              ],
              instructions: 'Blend all ingredients until smooth and creamy.'
            },
            {
              name: 'Chicken Stir-Fry with Brown Rice',
              calories: 500,
              protein: 38,
              carbs: 52,
              fat: 14,
              type: 'dinner',
              ingredients: [
                '5 oz chicken breast, sliced (140g)',
                '2 cups stir-fry vegetables (broccoli, peppers, snap peas)',
                '3/4 cup cooked brown rice (140g)',
                '1 tbsp low-sodium soy sauce',
                '1 tsp sesame oil',
                '1 tsp fresh ginger, minced'
              ],
              instructions: 'Cook sliced chicken in sesame oil. Add vegetables and stir-fry 3-4 minutes. Add soy sauce and ginger. Serve over brown rice.'
            },
            {
              name: 'Celery with Sunflower Seed Butter',
              calories: 160,
              protein: 5,
              carbs: 8,
              fat: 12,
              type: 'snack',
              ingredients: [
                '4 celery stalks (160g)',
                '1.5 tbsp sunflower seed butter (24g)'
              ],
              instructions: 'Spread sunflower seed butter on celery stalks.'
            }
          ]
        }
      ],
      summary: 'A balanced weight loss plan featuring high-protein meals with lean proteins, plenty of vegetables, and smart snacking. Designed for sustainable fat loss without feeling deprived.',
      fromTemplate: false,
      startedFromScratch: false
    }
  };
}

// ─── Sample Meal Plan for Marcus (Muscle Gain) ────────────────────────────────
function getMarcusMealPlan(clientId, clientName) {
  return {
    client_name: clientName,
    plan_name: 'Lean Bulk Nutrition Plan (Sample)',
    status: 'published',
    client_id: clientId,
    plan_data: {
      clientName: clientName,
      clientId: clientId,
      planName: 'Lean Bulk Nutrition Plan (Sample)',
      calories: 2800,
      protein: 210,
      carbs: 310,
      fat: 78,
      preference: null,
      macroPreference: 'high_protein',
      allergies: null,
      dislikedFoods: 'Tofu',
      preferredFoods: 'Steak, chicken, rice, eggs, oats',
      budget: 'moderate',
      currentPlan: [
        {
          day: 'Monday',
          plan: [
            {
              name: 'Loaded Oatmeal & Egg Whites',
              calories: 550,
              protein: 42,
              carbs: 68,
              fat: 12,
              type: 'breakfast',
              ingredients: [
                '1 cup rolled oats (80g)',
                '6 egg whites, scrambled (198g)',
                '1 medium banana, sliced (118g)',
                '1 tbsp honey (21g)',
                'Cinnamon to taste'
              ],
              instructions: 'Cook oats with water or milk. Top with sliced banana, honey, and cinnamon. Scramble egg whites separately and serve alongside.'
            },
            {
              name: 'Double Chicken Rice Bowl',
              calories: 720,
              protein: 55,
              carbs: 82,
              fat: 16,
              type: 'lunch',
              ingredients: [
                '8 oz grilled chicken breast (227g)',
                '1.5 cups cooked white rice (280g)',
                '1 cup steamed broccoli (91g)',
                '1 tbsp teriyaki sauce (18ml)',
                '1 tsp sesame seeds'
              ],
              instructions: 'Grill chicken breast and slice. Serve over rice with steamed broccoli. Drizzle with teriyaki sauce and top with sesame seeds.'
            },
            {
              name: 'Post-Workout Protein Shake',
              calories: 380,
              protein: 40,
              carbs: 48,
              fat: 4,
              type: 'snack',
              ingredients: [
                '1.5 scoops Dymatize ISO100 (47g)',
                '1 large banana (136g)',
                '1 cup oat milk (240ml)',
                '1 tbsp honey (21g)'
              ],
              instructions: 'Blend all ingredients until smooth. Drink within 30 minutes of finishing workout.'
            },
            {
              name: 'Grilled Steak with Roasted Potatoes',
              calories: 750,
              protein: 52,
              carbs: 64,
              fat: 28,
              type: 'dinner',
              ingredients: [
                '8 oz sirloin steak (227g)',
                '2 medium red potatoes, cubed (300g)',
                '1 cup green beans (125g)',
                '1 tbsp olive oil (14ml)',
                'Salt, pepper, garlic powder'
              ],
              instructions: 'Season steak with salt, pepper, and garlic powder. Grill to desired doneness. Toss potatoes in olive oil and roast at 425\u00b0F for 25 minutes. Steam green beans. Serve together.'
            },
            {
              name: 'Cottage Cheese & Fruit Bowl',
              calories: 280,
              protein: 24,
              carbs: 35,
              fat: 5,
              type: 'snack',
              ingredients: [
                '1 cup low-fat cottage cheese (226g)',
                '1/2 cup pineapple chunks (82g)',
                '1/4 cup blueberries (37g)'
              ],
              instructions: 'Combine cottage cheese with pineapple and blueberries in a bowl.'
            }
          ]
        }
      ],
      summary: 'High-calorie muscle building plan with emphasis on lean protein and complex carbs. Timing meals around training for optimal muscle recovery and growth.',
      fromTemplate: false,
      startedFromScratch: false
    }
  };
}

// ─── Sample Workout Program (Push/Pull/Legs) ──────────────────────────────────
function getSampleWorkoutProgram(coachId) {
  return {
    coach_id: coachId,
    name: 'Push / Pull / Legs (Sample)',
    description: 'A classic 3-day split hitting each muscle group with compound and isolation exercises. Great starting template \u2014 duplicate and customize for each client.',
    program_type: 'strength',
    difficulty: 'intermediate',
    duration_weeks: 8,
    days_per_week: 3,
    is_template: true,
    is_published: false,
    is_club_workout: false,
    program_data: {
      days: [
        {
          name: 'Push Day (Chest, Shoulders, Triceps)',
          exercises: [
            {
              name: 'Barbell Bench Press',
              muscle_group: 'Chest',
              equipment: 'Barbell',
              sets: 4,
              setsData: [
                { reps: 8, restSeconds: 90 },
                { reps: 8, restSeconds: 90 },
                { reps: 10, restSeconds: 90 },
                { reps: 10, restSeconds: 90 }
              ],
              trackingType: 'reps',
              notes: 'Focus on controlled descent. Warm up with 2 lighter sets first.'
            },
            {
              name: 'Dumbbell Incline Bench Press',
              muscle_group: 'Chest',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 10, restSeconds: 75 },
                { reps: 10, restSeconds: 75 },
                { reps: 12, restSeconds: 75 }
              ],
              trackingType: 'reps',
              notes: '30-degree incline. Squeeze at the top.'
            },
            {
              name: 'Dumbbell Standing Overhead Press',
              muscle_group: 'Shoulders',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 10, restSeconds: 75 },
                { reps: 10, restSeconds: 75 },
                { reps: 12, restSeconds: 75 }
              ],
              trackingType: 'reps',
              notes: 'Keep core braced. Full range of motion.'
            },
            {
              name: 'Lateral raises dumbbell',
              muscle_group: 'Shoulders',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 15, restSeconds: 60 },
                { reps: 15, restSeconds: 60 },
                { reps: 15, restSeconds: 60 }
              ],
              trackingType: 'reps',
              notes: 'Light weight, controlled movement. Slight bend in elbows.'
            },
            {
              name: 'Cable pushdown',
              muscle_group: 'Triceps',
              equipment: 'Cable Machine',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 60 },
                { reps: 12, restSeconds: 60 },
                { reps: 15, restSeconds: 60 }
              ],
              trackingType: 'reps',
              notes: 'Keep elbows pinned to sides. Squeeze at the bottom.'
            }
          ]
        },
        {
          name: 'Pull Day (Back, Biceps)',
          exercises: [
            {
              name: 'Barbell Bent Over Row',
              muscle_group: 'Back',
              equipment: 'Barbell',
              sets: 4,
              setsData: [
                { reps: 8, restSeconds: 90 },
                { reps: 8, restSeconds: 90 },
                { reps: 10, restSeconds: 90 },
                { reps: 10, restSeconds: 90 }
              ],
              trackingType: 'reps',
              notes: 'Hinge at hips, pull to lower chest. Keep back flat.'
            },
            {
              name: 'Cable bar lateral pulldown',
              muscle_group: 'Back',
              equipment: 'Cable Machine',
              sets: 3,
              setsData: [
                { reps: 10, restSeconds: 75 },
                { reps: 10, restSeconds: 75 },
                { reps: 12, restSeconds: 75 }
              ],
              trackingType: 'reps',
              notes: 'Wide grip, pull to upper chest. Lean back slightly.'
            },
            {
              name: 'Cable seated row',
              muscle_group: 'Back',
              equipment: 'Cable Machine',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 75 },
                { reps: 12, restSeconds: 75 },
                { reps: 12, restSeconds: 75 }
              ],
              trackingType: 'reps',
              notes: 'Squeeze shoulder blades together at peak contraction.'
            },
            {
              name: 'Dumbbell curls',
              muscle_group: 'Biceps',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 60 },
                { reps: 12, restSeconds: 60 },
                { reps: 15, restSeconds: 60 }
              ],
              trackingType: 'reps',
              notes: 'Alternate arms. No swinging \u2014 control the weight.'
            },
            {
              name: 'Dumbbell Hammer Curl',
              muscle_group: 'Biceps',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 60 },
                { reps: 12, restSeconds: 60 },
                { reps: 12, restSeconds: 60 }
              ],
              trackingType: 'reps',
              notes: 'Neutral grip. Great for forearm and brachialis development.'
            }
          ]
        },
        {
          name: 'Leg Day (Quads, Hamstrings, Glutes)',
          exercises: [
            {
              name: 'Barbell Full Squat',
              muscle_group: 'Quads',
              equipment: 'Barbell',
              sets: 4,
              setsData: [
                { reps: 8, restSeconds: 120 },
                { reps: 8, restSeconds: 120 },
                { reps: 10, restSeconds: 120 },
                { reps: 10, restSeconds: 120 }
              ],
              trackingType: 'reps',
              notes: 'Below parallel depth. Warm up with bodyweight squats and 2 lighter sets.'
            },
            {
              name: 'Barbell romanian deadlift',
              muscle_group: 'Hamstrings',
              equipment: 'Barbell',
              sets: 3,
              setsData: [
                { reps: 10, restSeconds: 90 },
                { reps: 10, restSeconds: 90 },
                { reps: 12, restSeconds: 90 }
              ],
              trackingType: 'reps',
              notes: 'Hinge at hips, slight knee bend. Feel the stretch in hamstrings.'
            },
            {
              name: 'Leg press machine normal stance',
              muscle_group: 'Quads',
              equipment: 'Leg Press Machine',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 90 },
                { reps: 12, restSeconds: 90 },
                { reps: 15, restSeconds: 90 }
              ],
              trackingType: 'reps',
              notes: 'Feet shoulder-width apart. Full range of motion.'
            },
            {
              name: 'Dumbbell Goblet Forward Lunge',
              muscle_group: 'Glutes',
              equipment: 'Dumbbell',
              sets: 3,
              setsData: [
                { reps: 12, restSeconds: 75 },
                { reps: 12, restSeconds: 75 },
                { reps: 12, restSeconds: 75 }
              ],
              trackingType: 'reps',
              notes: '12 reps per leg. Hold dumbbells at sides.'
            },
            {
              name: 'Dumbbell Seated Calf Raise',
              muscle_group: 'Calves',
              equipment: 'Machine',
              sets: 4,
              setsData: [
                { reps: 15, restSeconds: 45 },
                { reps: 15, restSeconds: 45 },
                { reps: 20, restSeconds: 45 },
                { reps: 20, restSeconds: 45 }
              ],
              trackingType: 'reps',
              notes: 'Slow controlled reps. Pause at the top for 1 second.'
            }
          ]
        }
      ]
    }
  };
}

// ─── Sample Supplement Protocols ──────────────────────────────────────────────
function getSampleProtocols(coachId, clientId) {
  return [
    {
      coach_id: coachId,
      client_id: clientId,
      name: 'Whey Protein',
      timing: 'post_workout',
      dose: '1 scoop (25g protein)',
      notes: 'Take within 30 minutes of finishing workout. Mix with water or milk.',
      frequency_type: 'specific_days',
      frequency_days: ['mon', 'wed', 'fri']
    },
    {
      coach_id: coachId,
      client_id: clientId,
      name: 'Creatine Monohydrate',
      timing: 'with_meal',
      dose: '5g daily',
      notes: 'Take with any meal. Stay well hydrated (aim for 1 gallon of water daily).',
      frequency_type: 'daily'
    },
    {
      coach_id: coachId,
      client_id: clientId,
      name: 'Fish Oil (Omega-3)',
      timing: 'morning',
      dose: '2 softgels (1000mg EPA/DHA)',
      notes: 'Take with breakfast to reduce any fishy aftertaste.',
      frequency_type: 'daily'
    }
  ];
}

// ─── Calorie Goals ────────────────────────────────────────────────────────────
function getSarahCalorieGoals(clientId) {
  return {
    client_id: clientId,
    calorie_goal: 1800,
    protein_goal: 140,
    carbs_goal: 180,
    fat_goal: 60,
    fiber_goal: 25
  };
}

function getMarcusCalorieGoals(clientId) {
  return {
    client_id: clientId,
    calorie_goal: 2800,
    protein_goal: 210,
    carbs_goal: 310,
    fat_goal: 78,
    fiber_goal: 35
  };
}

// ─── Main Seed Function ───────────────────────────────────────────────────────
// Takes a Supabase client (with service key) and a coachId.
// Returns { success, message, data } or throws on critical failure.
async function seedSampleData(supabase, coachId) {
  // Check if sample data already exists for this coach
  const { data: existingClients } = await supabase
    .from('clients')
    .select('id')
    .eq('coach_id', coachId)
    .eq('is_sample', true)
    .limit(1);

  if (existingClients && existingClients.length > 0) {
    return { success: true, message: 'Sample data already exists', alreadySeeded: true };
  }

  // ── 1. Create sample clients ──────────────────────────────────────────
  const clientsToInsert = SAMPLE_CLIENTS.map(c => ({
    ...c,
    coach_id: coachId
  }));

  let sarahClient, marcusClient;

  const { data: createdClients, error: clientsError } = await supabase
    .from('clients')
    .insert(clientsToInsert)
    .select('id, client_name');

  if (clientsError) {
    // If is_sample column doesn't exist, retry without it
    if (clientsError.message && clientsError.message.includes('is_sample')) {
      const clientsWithoutFlag = clientsToInsert.map(({ is_sample, ...rest }) => rest);
      const { data: retryClients, error: retryError } = await supabase
        .from('clients')
        .insert(clientsWithoutFlag)
        .select('id, client_name');

      if (retryError) throw retryError;
      sarahClient = retryClients.find(c => c.client_name.includes('Sarah'));
      marcusClient = retryClients.find(c => c.client_name.includes('Marcus'));
    } else {
      throw clientsError;
    }
  } else {
    sarahClient = createdClients.find(c => c.client_name.includes('Sarah'));
    marcusClient = createdClients.find(c => c.client_name.includes('Marcus'));
  }

  if (!sarahClient || !marcusClient) {
    throw new Error('Failed to identify created sample clients');
  }

  // ── 2. Create sample meal plans ───────────────────────────────────────
  const mealPlans = [
    { coach_id: coachId, ...getSarahMealPlan(sarahClient.id, sarahClient.client_name) },
    { coach_id: coachId, ...getMarcusMealPlan(marcusClient.id, marcusClient.client_name) }
  ];

  const { error: plansError } = await supabase
    .from('coach_meal_plans')
    .insert(mealPlans);

  if (plansError) {
    console.error('Error creating sample meal plans:', plansError);
  }

  // ── 3. Create sample workout program ──────────────────────────────────
  const { error: workoutError } = await supabase
    .from('workout_programs')
    .insert([getSampleWorkoutProgram(coachId)]);

  if (workoutError) {
    console.error('Error creating sample workout program:', workoutError);
  }

  // ── 4. Create sample supplement protocols (for Marcus) ────────────────
  const protocols = getSampleProtocols(coachId, marcusClient.id);
  const { error: protocolsError } = await supabase
    .from('client_protocols')
    .insert(protocols);

  if (protocolsError) {
    console.error('Error creating sample protocols:', protocolsError);
  }

  // ── 5. Create calorie goals for both clients ──────────────────────────
  const goals = [
    getSarahCalorieGoals(sarahClient.id),
    getMarcusCalorieGoals(marcusClient.id)
  ];

  const { error: goalsError } = await supabase
    .from('calorie_goals')
    .insert(goals);

  if (goalsError) {
    console.error('Error creating sample calorie goals:', goalsError);
  }

  return {
    success: true,
    message: 'Sample data created successfully',
    data: {
      clients: [
        { id: sarahClient.id, name: sarahClient.client_name },
        { id: marcusClient.id, name: marcusClient.client_name }
      ],
      mealPlans: plansError ? 0 : 2,
      workoutPrograms: workoutError ? 0 : 1,
      supplementProtocols: protocolsError ? 0 : protocols.length,
      calorieGoals: goalsError ? 0 : 2
    }
  };
}

module.exports = { seedSampleData };
