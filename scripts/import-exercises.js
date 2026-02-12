/**
 * Exercise Library Import Script
 *
 * Imports exercises from the exerciseanimatic.com CSV into Supabase
 *
 * Usage:
 *   node scripts/import-exercises.js
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Your Supabase service role key
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

// Configuration
const CSV_FILE = path.join(__dirname, '..', '1500+ exercise data.xlsx - Sheet1.csv');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Equipment normalization map
const EQUIPMENT_MAP = {
  'smith machine': 'Smith Machine',
  'none': 'None',
  'none (bodyweight)': 'None',
  'dumbbells': 'Dumbbell',
  'ez bar': 'EZ Bar',
  'leg press machine': 'Leg Press Machine',
  'chair': 'Chair',
  'weight plate': 'Weight Plate',
  'ab roller': 'Ab Roller',
  'ab wheel': 'Ab Roller',
};

// Category normalization
const CATEGORY_MAP = {
  'bodyweight': 'Bodyweight',
  'free weights': 'Free Weights',
  'resistance': 'Resistance',
};

/**
 * Normalize equipment name
 */
function normalizeEquipment(equipment) {
  if (!equipment) return 'None';
  const lower = equipment.toLowerCase().trim();
  return EQUIPMENT_MAP[lower] || equipment.trim();
}

/**
 * Normalize category name
 */
function normalizeCategory(category) {
  if (!category) return null;
  const lower = category.toLowerCase().trim();
  return CATEGORY_MAP[lower] || category.trim();
}

/**
 * Extract gender variant from exercise name
 * Returns { baseName, variant }
 */
function extractGenderVariant(name) {
  if (!name) return { baseName: name, variant: null };

  const lowerName = name.toLowerCase();

  if (lowerName.endsWith('_female')) {
    return {
      baseName: name.slice(0, -7), // Remove '_female'
      variant: 'female'
    };
  }

  if (lowerName.endsWith('_male')) {
    return {
      baseName: name.slice(0, -5), // Remove '_male'
      variant: 'male'
    };
  }

  return { baseName: name, variant: null };
}

/**
 * Determine exercise type based on category and equipment
 */
function determineExerciseType(category, equipment, primaryMuscles) {
  const lowerMuscles = (primaryMuscles || '').toLowerCase();

  // Check for cardio indicators
  if (lowerMuscles.includes('cardiovascular') ||
      equipment?.toLowerCase().includes('treadmill') ||
      equipment?.toLowerCase().includes('bike') ||
      equipment?.toLowerCase().includes('elliptical') ||
      equipment?.toLowerCase().includes('rowing machine')) {
    return 'cardio';
  }

  // Check for flexibility/stretching
  if (lowerMuscles.includes('stretch') ||
      category?.toLowerCase() === 'stretching') {
    return 'flexibility';
  }

  // Default to strength
  return 'strength';
}

/**
 * Determine difficulty based on exercise complexity
 */
function determineDifficulty(instructions, equipment) {
  // Simple heuristic based on instruction length and equipment
  const instructionLength = (instructions || '').length;
  const equipmentLower = (equipment || '').toLowerCase();

  // Complex equipment = intermediate/advanced
  const complexEquipment = ['cable', 'machine', 'smith', 'hammer strength'];
  const isComplexEquipment = complexEquipment.some(e => equipmentLower.includes(e));

  if (isComplexEquipment || instructionLength > 500) {
    return 'intermediate';
  }

  if (instructionLength < 200) {
    return 'beginner';
  }

  return 'beginner';
}

/**
 * Extract primary muscle group (simplified)
 *
 * IMPORTANT: Iteration order matters! Leg muscles must be checked BEFORE arm muscles
 * because scientific names like "Biceps Femoris" (hamstring) and "Triceps Surae" (calf)
 * contain "bicep"/"tricep" which would falsely match 'arms'.
 */
function extractMuscleGroup(primaryMuscles) {
  if (!primaryMuscles) return null;

  // Ordered array instead of object to guarantee check order.
  // Legs MUST come before arms so "Biceps Femoris" → legs, not arms.
  const muscleChecks = [
    ['quadricep', 'legs'],
    ['hamstring', 'legs'],
    ['glute', 'legs'],
    ['calf', 'legs'],
    ['calves', 'legs'],
    ['chest', 'chest'],
    ['pectoralis', 'chest'],
    ['back', 'back'],
    ['latissimus', 'back'],
    ['shoulder', 'shoulders'],
    ['deltoid', 'shoulders'],
    ['abdominal', 'core'],
    ['oblique', 'core'],
    ['core', 'core'],
    ['bicep', 'arms'],
    ['tricep', 'arms'],
    ['forearm', 'arms'],
  ];

  const lowerMuscles = primaryMuscles.toLowerCase();

  for (const [key, group] of muscleChecks) {
    if (lowerMuscles.includes(key)) {
      return group;
    }
  }

  return 'full_body';
}

/**
 * Check if exercise is compound (works multiple major muscle groups)
 */
function isCompoundExercise(primaryMuscles, secondaryMuscles) {
  const allMuscles = ((primaryMuscles || '') + ' ' + (secondaryMuscles || '')).toLowerCase();

  const majorGroups = ['chest', 'back', 'shoulder', 'quadricep', 'hamstring', 'glute'];
  const groupsWorked = majorGroups.filter(g => allMuscles.includes(g));

  return groupsWorked.length >= 2;
}

/**
 * Parse CSV and import exercises
 */
async function importExercises() {
  console.log('Reading CSV file...');

  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const records = csv.parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  console.log(`Found ${records.length} exercises in CSV`);

  // Filter exercises that have at least a name
  const validExercises = records.filter(r => r.Exercise && r.Exercise.trim());
  console.log(`${validExercises.length} exercises have names`);

  // Prepare batch insert
  const exercises = [];

  for (const record of validExercises) {
    const { baseName, variant } = extractGenderVariant(record.Exercise);
    const category = normalizeCategory(record.Categories);
    const equipment = normalizeEquipment(record.Equipment);
    const primaryMuscles = record['Primary Activating Muscles'] || '';
    const secondaryMuscles = record['Secondary Activating Muscles'] || '';

    exercises.push({
      name: record.Exercise.trim(),
      description: null, // Can be generated later
      instructions: record['Exercise Instructions (step by step)'] || null,
      tips: record['Exercise Tips'] || null,
      category: category,
      muscle_group: extractMuscleGroup(primaryMuscles),
      primary_muscles: primaryMuscles || null,
      secondary_muscles: secondaryMuscles ? [secondaryMuscles] : [],
      equipment: equipment,
      exercise_type: determineExerciseType(category, equipment, primaryMuscles),
      difficulty: determineDifficulty(record['Exercise Instructions (step by step)'], equipment),
      is_compound: isCompoundExercise(primaryMuscles, secondaryMuscles),
      is_unilateral: record.Exercise.toLowerCase().includes('single') ||
                     record.Exercise.toLowerCase().includes('one arm') ||
                     record.Exercise.toLowerCase().includes('one leg'),
      gender_variant: variant,
      source: 'exerciseanimatic',
      coach_id: null, // Global exercises
      is_custom: false,
      // Video URLs will be added after upload
      animation_url: null,
      video_url: null,
      thumbnail_url: null,
    });
  }

  console.log(`Prepared ${exercises.length} exercises for import`);

  // Insert in batches of 100
  const BATCH_SIZE = 100;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
    const batch = exercises.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('exercises')
      .upsert(batch, {
        onConflict: 'name',
        ignoreDuplicates: false
      })
      .select('id');

    if (error) {
      console.error(`Error importing batch ${i / BATCH_SIZE + 1}:`, error.message);
      errors += batch.length;
    } else {
      imported += batch.length;
      console.log(`Imported ${imported}/${exercises.length} exercises...`);
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Successfully imported: ${imported}`);
  console.log(`Errors: ${errors}`);

  return { imported, errors };
}

/**
 * Generate video filename from exercise name
 */
function generateVideoFilename(exerciseName) {
  return `${exerciseName}.mp4`;
}

/**
 * Export list of expected video filenames for matching
 */
async function exportVideoFilenames() {
  console.log('Reading CSV to generate video filename list...');

  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const records = csv.parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });

  const filenames = records
    .filter(r => r.Exercise && r.Exercise.trim())
    .map(r => generateVideoFilename(r.Exercise.trim()));

  const outputPath = path.join(__dirname, '..', 'expected-video-files.txt');
  fs.writeFileSync(outputPath, filenames.join('\n'));

  console.log(`Exported ${filenames.length} expected filenames to ${outputPath}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--export-filenames')) {
    await exportVideoFilenames();
  } else if (args.includes('--dry-run')) {
    console.log('Dry run - no changes will be made');
    const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
    const records = csv.parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    });
    console.log(`Would import ${records.filter(r => r.Exercise).length} exercises`);
  } else {
    await importExercises();
  }
}

main().catch(console.error);
