/**
 * Script to update exercise coaching data (form_tips, common_mistakes, coaching_cues)
 *
 * Usage: node scripts/update-exercise-coaching-data.js
 *
 * Edit the EXERCISE_DATA array below with your curated content
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ===========================================
// ADD YOUR EXERCISE DATA HERE
// ===========================================
const EXERCISE_DATA = [
    {
        name: "Barbell Squat",
        form_tips: [
            "Keep your chest up and core braced throughout",
            "Drive through your heels, not your toes",
            "Keep knees tracking over your toes",
            "Maintain a neutral spine - avoid rounding"
        ],
        common_mistakes: [
            "Rounding the lower back at the bottom",
            "Knees caving inward",
            "Rising onto toes",
            "Not hitting proper depth"
        ],
        coaching_cues: [
            "Chest up",
            "Brace core",
            "Knees out",
            "Squeeze glutes"
        ]
    },
    {
        name: "Barbell Bench Press",
        form_tips: [
            "Plant feet firmly on the floor",
            "Retract shoulder blades and keep them pinched",
            "Lower the bar to mid-chest with control",
            "Keep wrists straight and stacked over elbows"
        ],
        common_mistakes: [
            "Flaring elbows too wide (90 degrees)",
            "Bouncing bar off chest",
            "Lifting hips off bench",
            "Uneven bar path"
        ],
        coaching_cues: [
            "Squeeze the bar",
            "Leg drive",
            "Touch and press",
            "Lock out"
        ]
    },
    {
        name: "Barbell Deadlift",
        form_tips: [
            "Keep the bar close to your body throughout",
            "Hinge at hips, not just bending knees",
            "Engage lats - protect your armpits",
            "Stand tall at the top, squeeze glutes"
        ],
        common_mistakes: [
            "Rounding the lower back",
            "Bar drifting away from body",
            "Jerking the weight off the floor",
            "Hyperextending at the top"
        ],
        coaching_cues: [
            "Push floor away",
            "Chest up",
            "Bar close",
            "Hips through"
        ]
    },
    // Add more exercises below...
    // {
    //     name: "Exercise Name (must match exactly)",
    //     form_tips: ["tip 1", "tip 2", "tip 3"],
    //     common_mistakes: ["mistake 1", "mistake 2"],
    //     coaching_cues: ["cue 1", "cue 2"]
    // },
];

async function updateExercises() {
    console.log(`\nUpdating ${EXERCISE_DATA.length} exercises with coaching data...\n`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const exercise of EXERCISE_DATA) {
        try {
            // Find exercise by name (case-insensitive)
            const { data: existing, error: findError } = await supabase
                .from('exercises')
                .select('id, name')
                .ilike('name', exercise.name)
                .single();

            if (findError || !existing) {
                console.log(`❌ Not found: "${exercise.name}"`);
                notFound++;
                continue;
            }

            // Update the exercise
            const { error: updateError } = await supabase
                .from('exercises')
                .update({
                    form_tips: exercise.form_tips || [],
                    common_mistakes: exercise.common_mistakes || [],
                    coaching_cues: exercise.coaching_cues || []
                })
                .eq('id', existing.id);

            if (updateError) {
                console.log(`⚠️ Error updating "${exercise.name}": ${updateError.message}`);
                errors++;
            } else {
                console.log(`✅ Updated: "${existing.name}"`);
                updated++;
            }
        } catch (err) {
            console.log(`⚠️ Error processing "${exercise.name}": ${err.message}`);
            errors++;
        }
    }

    console.log(`\n========== Summary ==========`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Not found: ${notFound}`);
    console.log(`⚠️ Errors: ${errors}`);
    console.log(`==============================\n`);
}

// List all exercises (useful for getting exact names)
async function listExercises(muscleGroup = null) {
    let query = supabase
        .from('exercises')
        .select('name, muscle_group')
        .is('coach_id', null)
        .order('muscle_group')
        .order('name');

    if (muscleGroup) {
        query = query.eq('muscle_group', muscleGroup);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching exercises:', error.message);
        return;
    }

    console.log(`\n${data.length} exercises found:\n`);

    let currentGroup = '';
    for (const ex of data) {
        if (ex.muscle_group !== currentGroup) {
            currentGroup = ex.muscle_group;
            console.log(`\n=== ${currentGroup?.toUpperCase() || 'UNCATEGORIZED'} ===`);
        }
        console.log(`  - ${ex.name}`);
    }
}

// Run based on command line args
const args = process.argv.slice(2);

if (args[0] === 'list') {
    listExercises(args[1]);
} else if (args[0] === 'update') {
    updateExercises();
} else {
    console.log(`
Exercise Coaching Data Updater

Usage:
  node scripts/update-exercise-coaching-data.js list [muscle_group]  - List all exercises
  node scripts/update-exercise-coaching-data.js update               - Update exercises with data

Examples:
  node scripts/update-exercise-coaching-data.js list                 - List all exercises
  node scripts/update-exercise-coaching-data.js list chest           - List chest exercises
  node scripts/update-exercise-coaching-data.js update               - Run the update

Edit the EXERCISE_DATA array in this file to add your curated content.
    `);
}
