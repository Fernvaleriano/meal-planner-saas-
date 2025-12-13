/**
 * Link Exercise Videos Script
 *
 * This script links already-uploaded videos in Supabase Storage to exercises in the database.
 * It lists all files in the exercise-videos bucket and updates matching exercises with video URLs.
 *
 * Usage:
 *   node scripts/link-exercise-videos.js
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Your Supabase service role key
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  console.error('Set it with: set SUPABASE_SERVICE_KEY=your_key_here');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * List all files in a storage bucket (including nested folders)
 */
async function listAllFiles(prefix = '') {
  const allFiles = [];

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    console.error(`Error listing files in ${prefix || 'root'}:`, error.message);
    return allFiles;
  }

  for (const item of data) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id === null) {
      // This is a folder, recurse into it
      const nestedFiles = await listAllFiles(itemPath);
      allFiles.push(...nestedFiles);
    } else if (item.name.toLowerCase().endsWith('.mp4')) {
      // This is an MP4 file
      allFiles.push({
        name: item.name,
        path: itemPath,
        size: item.metadata?.size || 0
      });
    }
  }

  return allFiles;
}

/**
 * Get the public URL for a file
 */
function getPublicUrl(filePath) {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Find and update exercise with video URL
 */
async function linkVideoToExercise(filename, videoUrl) {
  // Extract exercise name from filename (remove .mp4 extension)
  const exerciseName = filename.replace(/\.mp4$/i, '');

  // Try exact match first
  let { data, error } = await supabase
    .from('exercises')
    .update({
      video_url: videoUrl,
      animation_url: videoUrl
    })
    .ilike('name', exerciseName)
    .select('id, name');

  if (!error && data && data.length > 0) {
    return { matched: true, exerciseName: data[0].name };
  }

  // Try partial match (name contains the filename)
  const { data: partialData, error: partialError } = await supabase
    .from('exercises')
    .update({
      video_url: videoUrl,
      animation_url: videoUrl
    })
    .ilike('name', `%${exerciseName}%`)
    .select('id, name');

  if (!partialError && partialData && partialData.length > 0) {
    return { matched: true, exerciseName: partialData[0].name };
  }

  return { matched: false, exerciseName: null };
}

/**
 * Main function
 */
async function main() {
  console.log('=== Exercise Video Linker ===\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  // List all files in the bucket
  console.log('Scanning storage bucket for MP4 files...\n');
  const files = await listAllFiles();

  console.log(`Found ${files.length} MP4 files in storage\n`);

  if (files.length === 0) {
    console.log('No MP4 files found. Make sure videos are uploaded to the bucket.');
    return;
  }

  // Show first few files
  console.log('Sample files found:');
  files.slice(0, 5).forEach(f => console.log(`  - ${f.path}`));
  if (files.length > 5) console.log(`  ... and ${files.length - 5} more\n`);

  // Link each video to exercises
  let matched = 0;
  let unmatched = 0;
  const unmatchedFiles = [];

  console.log('\nLinking videos to exercises...\n');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const videoUrl = getPublicUrl(file.path);

    const result = await linkVideoToExercise(file.name, videoUrl);

    if (result.matched) {
      matched++;
      if (matched <= 10) {
        console.log(`✓ Linked: ${file.name} → ${result.exerciseName}`);
      }
    } else {
      unmatched++;
      unmatchedFiles.push(file.name);
    }

    // Progress update every 100 files
    if ((i + 1) % 100 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${files.length} (${matched} matched, ${unmatched} unmatched) ---\n`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total video files: ${files.length}`);
  console.log(`Matched to exercises: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);

  if (unmatchedFiles.length > 0 && unmatchedFiles.length <= 20) {
    console.log('\nUnmatched files:');
    unmatchedFiles.forEach(f => console.log(`  - ${f}`));
  } else if (unmatchedFiles.length > 20) {
    console.log(`\nFirst 20 unmatched files:`);
    unmatchedFiles.slice(0, 20).forEach(f => console.log(`  - ${f}`));
    console.log(`  ... and ${unmatchedFiles.length - 20} more`);
  }

  // Show exercises still without videos
  const { data: noVideoExercises, error } = await supabase
    .from('exercises')
    .select('name')
    .is('video_url', null)
    .limit(10);

  if (noVideoExercises && noVideoExercises.length > 0) {
    console.log(`\nExercises still without videos (showing first 10):`);
    noVideoExercises.forEach(e => console.log(`  - ${e.name}`));
  }
}

main().catch(console.error);
