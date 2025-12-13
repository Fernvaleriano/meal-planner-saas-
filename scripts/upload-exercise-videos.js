/**
 * Exercise Video Upload Script
 *
 * Uploads exercise MP4 files from a local folder to Supabase Storage
 * and updates the database with video URLs
 *
 * Usage:
 *   node scripts/upload-exercise-videos.js /path/to/videos/folder
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Your Supabase service role key
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Recursively get all MP4 files from a directory
 */
function getAllMP4Files(dirPath, files = []) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllMP4Files(fullPath, files);
    } else if (item.toLowerCase().endsWith('.mp4')) {
      files.push({
        fullPath,
        filename: item,
        folder: path.basename(path.dirname(fullPath)),
      });
    }
  }

  return files;
}

/**
 * Upload a single video to Supabase Storage
 */
async function uploadVideo(filePath, filename, folder) {
  const fileContent = fs.readFileSync(filePath);

  // Organize by folder (muscle group) in storage
  const storagePath = folder ? `${folder}/${filename}` : filename;

  console.log(`Uploading: ${storagePath} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)...`);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileContent, {
      contentType: 'video/mp4',
      cacheControl: '31536000', // 1 year cache
      upsert: true, // Overwrite if exists
    });

  if (error) {
    console.error(`  Error uploading ${filename}:`, error.message);
    return null;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  console.log(`  Uploaded: ${publicUrl}`);
  return publicUrl;
}

/**
 * Update exercise in database with video URL
 */
async function updateExerciseVideoUrl(exerciseName, videoUrl) {
  // Try exact match first
  let { data, error } = await supabase
    .from('exercises')
    .update({ video_url: videoUrl, animation_url: videoUrl })
    .eq('name', exerciseName)
    .select('id, name');

  if (error || !data || data.length === 0) {
    // Try without extension
    const nameWithoutExt = exerciseName.replace('.mp4', '');
    const result = await supabase
      .from('exercises')
      .update({ video_url: videoUrl, animation_url: videoUrl })
      .eq('name', nameWithoutExt)
      .select('id, name');

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error(`  Error updating ${exerciseName}:`, error.message);
    return false;
  }

  if (!data || data.length === 0) {
    console.log(`  No matching exercise found for: ${exerciseName}`);
    return false;
  }

  console.log(`  Updated exercise: ${data[0].name}`);
  return true;
}

/**
 * Create storage bucket if it doesn't exist
 */
async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();

  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!bucketExists) {
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 104857600, // 100MB max
      allowedMimeTypes: ['video/mp4'],
    });

    if (error) {
      console.error('Error creating bucket:', error.message);
      return false;
    }
  }

  return true;
}

/**
 * Main upload function
 */
async function uploadAllVideos(videosFolder) {
  console.log(`\nScanning folder: ${videosFolder}\n`);

  // Ensure bucket exists
  const bucketReady = await ensureBucketExists();
  if (!bucketReady) {
    console.error('Failed to create/verify storage bucket');
    return;
  }

  // Get all MP4 files
  const mp4Files = getAllMP4Files(videosFolder);
  console.log(`Found ${mp4Files.length} MP4 files\n`);

  if (mp4Files.length === 0) {
    console.log('No MP4 files found in the specified folder');
    return;
  }

  // Upload stats
  let uploaded = 0;
  let failed = 0;
  let matched = 0;
  let unmatched = 0;

  // Process files
  for (let i = 0; i < mp4Files.length; i++) {
    const { fullPath, filename, folder } = mp4Files[i];
    console.log(`\n[${i + 1}/${mp4Files.length}] Processing: ${filename}`);

    // Upload to storage
    const videoUrl = await uploadVideo(fullPath, filename, folder);

    if (videoUrl) {
      uploaded++;

      // Update database
      const exerciseName = filename.replace('.mp4', '');
      const updated = await updateExerciseVideoUrl(exerciseName, videoUrl);

      if (updated) {
        matched++;
      } else {
        unmatched++;
      }
    } else {
      failed++;
    }

    // Progress update every 50 files
    if ((i + 1) % 50 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${mp4Files.length} processed ---\n`);
    }
  }

  console.log('\n=== Upload Complete ===');
  console.log(`Total files: ${mp4Files.length}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Matched in DB: ${matched}`);
  console.log(`Not matched in DB: ${unmatched}`);
}

/**
 * List unmatched exercises (exercises without video URLs)
 */
async function listUnmatchedExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('name')
    .is('video_url', null)
    .order('name');

  if (error) {
    console.error('Error fetching exercises:', error.message);
    return;
  }

  console.log(`\n${data.length} exercises without video URLs:\n`);
  data.forEach(e => console.log(`  - ${e.name}`));
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list-unmatched')) {
    await listUnmatchedExercises();
    return;
  }

  if (args.length === 0 || args[0].startsWith('--')) {
    console.log(`
Exercise Video Upload Script

Usage:
  node scripts/upload-exercise-videos.js /path/to/videos/folder
  node scripts/upload-exercise-videos.js --list-unmatched

Examples:
  node scripts/upload-exercise-videos.js "C:\\Users\\valer\\Downloads\\ULTIMATE BUNDLE\\4K UHD"
  node scripts/upload-exercise-videos.js ~/Downloads/exercise-videos

Options:
  --list-unmatched    List exercises that don't have video URLs yet

Environment Variables:
  SUPABASE_URL            Your Supabase project URL
  SUPABASE_SERVICE_KEY    Your Supabase service role key (required)
`);
    return;
  }

  const videosFolder = args[0];

  if (!fs.existsSync(videosFolder)) {
    console.error(`Error: Folder not found: ${videosFolder}`);
    process.exit(1);
  }

  await uploadAllVideos(videosFolder);
}

main().catch(console.error);
