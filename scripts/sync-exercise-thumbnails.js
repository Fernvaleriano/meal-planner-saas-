/**
 * Sync Exercise Thumbnails from Storage
 *
 * Scans the thumbnail storage bucket and links thumbnails to exercises.
 * Matches by exercise name (fuzzy matching).
 *
 * Usage:
 *   node scripts/sync-exercise-thumbnails.js
 *   node scripts/sync-exercise-thumbnails.js --dry-run
 *
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-thumbnails'; // Your thumbnail bucket name

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Clean filename to exercise name for matching
function cleanName(filename) {
  return filename
    // Remove file extension
    .replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '')
    // Remove trailing 1 (second frame images like "exercise1.jpg")
    .replace(/1$/, '')
    // Remove _female, _male, _Female, _Male suffixes
    .replace(/[_\s]*(female|male)$/i, '')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    // Remove (1), (2) etc
    .replace(/\(\d+\)/g, '')
    .toLowerCase()
    .trim();
}

// Normalize name for matching (remove all non-alphanumeric)
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Create multiple matching variations
function getMatchVariations(name) {
  const variations = [normalizeName(name)];

  // Also try without common suffixes
  const withoutDegree = name.replace(/\d+\s*degree/gi, '').trim();
  if (withoutDegree !== name) {
    variations.push(normalizeName(withoutDegree));
  }

  return variations;
}

async function syncThumbnails() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('SYNC EXERCISE THUMBNAILS FROM STORAGE');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log('='.repeat(60));

  // Step 1: List all thumbnails in storage
  console.log('\n[1/4] Scanning thumbnail bucket...');
  const allThumbnails = [];

  async function listFilesRecursive(prefix = '') {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000, offset });

      if (error) {
        console.error(`Error listing ${prefix}:`, error.message);
        return;
      }

      if (!data || data.length === 0) break;

      for (const item of data) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder, recurse into it
          await listFilesRecursive(itemPath);
        } else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name)) {
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(itemPath);

          allThumbnails.push({
            filename: item.name,
            path: itemPath,
            folder: prefix,
            url: urlData.publicUrl,
            cleanName: cleanName(item.name),
            normalizedName: normalizeName(cleanName(item.name))
          });
        }
      }

      offset += data.length;
      hasMore = data.length === 1000;
    }
  }

  await listFilesRecursive();
  console.log(`   Found ${allThumbnails.length} thumbnails in storage`);

  if (allThumbnails.length === 0) {
    console.log('\nNo thumbnails found in bucket. Make sure:');
    console.log(`  1. The bucket name is correct: "${BUCKET_NAME}"`);
    console.log('  2. Files have image extensions (.jpg, .png, etc.)');
    console.log('  3. The bucket is accessible');
    return;
  }

  // Show some sample thumbnails
  console.log('\n   Sample thumbnails found:');
  allThumbnails.slice(0, 5).forEach(t => {
    console.log(`     - ${t.filename} -> "${t.cleanName}"`);
  });

  // Step 2: Get all exercises
  console.log('\n[2/4] Fetching exercises from database...');
  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('id, name, thumbnail_url');

  if (exError) {
    console.error('Failed to fetch exercises:', exError.message);
    process.exit(1);
  }

  console.log(`   Found ${exercises.length} exercises in database`);

  // Build lookup maps for exercises
  const exercisesByNormalized = new Map();
  const exercisesById = new Map();

  for (const ex of exercises) {
    exercisesById.set(ex.id, ex);
    const normalized = normalizeName(ex.name);
    if (!exercisesByNormalized.has(normalized)) {
      exercisesByNormalized.set(normalized, []);
    }
    exercisesByNormalized.get(normalized).push(ex);
  }

  // Step 3: Match thumbnails to exercises
  console.log('\n[3/4] Matching thumbnails to exercises...');

  const toUpdate = [];
  const notMatched = [];

  for (const thumb of allThumbnails) {
    // Try exact normalized match first
    let matches = exercisesByNormalized.get(thumb.normalizedName);

    // If no exact match, try partial matching
    if (!matches || matches.length === 0) {
      for (const [normalized, exList] of exercisesByNormalized.entries()) {
        if (normalized.includes(thumb.normalizedName) || thumb.normalizedName.includes(normalized)) {
          matches = exList;
          break;
        }
      }
    }

    if (matches && matches.length > 0) {
      for (const exercise of matches) {
        // Only update if no thumbnail or different thumbnail
        if (!exercise.thumbnail_url || exercise.thumbnail_url !== thumb.url) {
          toUpdate.push({
            id: exercise.id,
            name: exercise.name,
            thumbnail_url: thumb.url,
            thumbFile: thumb.filename
          });
        }
      }
    } else {
      notMatched.push(thumb);
    }
  }

  console.log(`   Matched: ${toUpdate.length} exercises`);
  console.log(`   Unmatched thumbnails: ${notMatched.length}`);

  if (notMatched.length > 0 && notMatched.length <= 20) {
    console.log('\n   Unmatched thumbnails:');
    notMatched.forEach(t => console.log(`     - ${t.filename}`));
  }

  // Step 4: Update database
  console.log('\n[4/4] Updating database...');

  if (isDryRun) {
    console.log(`   [DRY RUN] Would update ${toUpdate.length} exercises`);
    if (toUpdate.length > 0) {
      console.log('\n   Sample updates:');
      toUpdate.slice(0, 10).forEach(u => {
        console.log(`     - "${u.name}" <- ${u.thumbFile}`);
      });
    }
  } else {
    let updated = 0;
    let errors = [];

    for (const item of toUpdate) {
      const { error } = await supabase
        .from('exercises')
        .update({ thumbnail_url: item.thumbnail_url })
        .eq('id', item.id);

      if (error) {
        errors.push({ name: item.name, error: error.message });
      } else {
        updated++;
        if (updated % 100 === 0) {
          process.stdout.write(`   Updated: ${updated}/${toUpdate.length}\r`);
        }
      }
    }

    console.log(`   Updated: ${updated}/${toUpdate.length}                    `);

    if (errors.length > 0) {
      console.log(`\n   Errors (${errors.length}):`);
      errors.slice(0, 5).forEach(e => console.log(`     - ${e.name}: ${e.error}`));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`Thumbnails in storage: ${allThumbnails.length}`);
  console.log(`Exercises in database: ${exercises.length}`);
  console.log(`Matched & updated:     ${toUpdate.length}`);
  console.log(`Unmatched thumbnails:  ${notMatched.length}`);
}

syncThumbnails().catch(console.error);
