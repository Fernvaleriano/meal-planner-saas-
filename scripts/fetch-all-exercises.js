/**
 * Fetch All Exercises from Supabase
 *
 * Usage:
 *   node scripts/fetch-all-exercises.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
 * Outputs a full exercise list to exercises-list.json and a readable summary to exercises-list.txt
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required.');
  console.error('Set it with: export SUPABASE_SERVICE_KEY="your-key-here"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const fs = require('fs');
const path = require('path');

async function fetchAllExercises() {
  const batchSize = 1000;
  let offset = 0;
  let allExercises = [];
  let total = null;

  console.log('Fetching exercises from database...\n');

  while (true) {
    const { data, error, count } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, secondary_muscles, equipment, exercise_type, difficulty, is_compound, is_unilateral, is_custom, coach_id, category', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching exercises:', error.message);
      process.exit(1);
    }

    if (total === null) {
      total = count;
      console.log(`Total exercises in database: ${total}\n`);
    }

    allExercises = allExercises.concat(data);
    console.log(`  Fetched ${allExercises.length} / ${total}`);

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  // Save full JSON
  const jsonPath = path.join(__dirname, '..', 'exercises-list.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allExercises, null, 2));
  console.log(`\nSaved full JSON to: ${jsonPath}`);

  // Save readable text summary
  const txtPath = path.join(__dirname, '..', 'exercises-list.txt');
  const groups = {};
  for (const ex of allExercises) {
    const group = ex.muscle_group || 'uncategorized';
    if (!groups[group]) groups[group] = [];
    groups[group].push(ex);
  }

  let txt = `EXERCISE LIST — ${allExercises.length} total exercises\n`;
  txt += `Generated: ${new Date().toISOString()}\n`;
  txt += '='.repeat(60) + '\n\n';

  const sortedGroups = Object.keys(groups).sort();
  for (const group of sortedGroups) {
    const exercises = groups[group];
    txt += `\n## ${group.toUpperCase()} (${exercises.length} exercises)\n`;
    txt += '-'.repeat(40) + '\n';
    for (const ex of exercises) {
      const tags = [
        ex.equipment,
        ex.difficulty,
        ex.exercise_type,
        ex.is_compound ? 'compound' : null,
        ex.is_unilateral ? 'unilateral' : null,
        ex.is_custom ? 'custom' : null,
      ].filter(Boolean).join(', ');
      txt += `  ${ex.id}. ${ex.name}${tags ? ` [${tags}]` : ''}\n`;
    }
  }

  fs.writeFileSync(txtPath, txt);
  console.log(`Saved readable list to: ${txtPath}`);
  console.log(`\nBreakdown by muscle group:`);
  for (const group of sortedGroups) {
    console.log(`  ${group}: ${groups[group].length}`);
  }
}

fetchAllExercises().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
