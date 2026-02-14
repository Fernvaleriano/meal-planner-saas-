/**
 * List all exercises missing thumbnails
 *
 * Usage:
 *   node scripts/list-missing-thumbnails.js
 *   node scripts/list-missing-thumbnails.js --json > missing-thumbnails.json
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const jsonOutput = process.argv.includes('--json');

async function listMissingThumbnails() {
  // Fetch all exercises without thumbnails
  let allMissing = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, animation_url, video_url')
      .is('thumbnail_url', null)
      .order('muscle_group')
      .order('name')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching exercises:', error.message);
      process.exit(1);
    }

    allMissing = allMissing.concat(data || []);
    if (!data || data.length < batchSize) break;
    offset += batchSize;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(allMissing, null, 2));
    return;
  }

  // Group by muscle group
  const grouped = {};
  let hasAnimation = 0;
  let hasVideo = 0;
  let noMedia = 0;

  for (const ex of allMissing) {
    const group = ex.muscle_group || 'unknown';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(ex);

    if (ex.animation_url) hasAnimation++;
    else if (ex.video_url) hasVideo++;
    else noMedia++;
  }

  console.log('='.repeat(70));
  console.log('EXERCISES MISSING THUMBNAILS');
  console.log('='.repeat(70));
  console.log(`Total missing: ${allMissing.length}`);
  console.log(`  - Has animation_url (GIF): ${hasAnimation}`);
  console.log(`  - Has video_url only: ${hasVideo}`);
  console.log(`  - No media at all: ${noMedia}`);
  console.log('='.repeat(70));

  for (const [group, exercises] of Object.entries(grouped).sort()) {
    console.log(`\n── ${group.toUpperCase()} (${exercises.length}) ──`);
    for (const ex of exercises) {
      const media = ex.animation_url ? '[has GIF]' : ex.video_url ? '[has video]' : '[NO MEDIA]';
      console.log(`  ${ex.name} ${media}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Total: ${allMissing.length} exercises need thumbnails`);
  console.log('='.repeat(70));
}

listMissingThumbnails().catch(console.error);
