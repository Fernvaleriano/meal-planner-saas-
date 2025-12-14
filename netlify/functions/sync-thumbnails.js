const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Clean and normalize name for matching
function normalizeName(name) {
  return name
    .replace(/\.(jpeg|jpg|png|gif|webp)$/i, '') // Remove image extension
    .replace(/\d+$/g, '')                        // Remove trailing numbers (like "1" in duplicates)
    .replace(/[_-]/g, ' ')                       // Replace separators with spaces
    .replace(/\s+/g, ' ')                        // Collapse multiple spaces
    .trim()
    .toLowerCase();
}

// Remove gender suffix for matching
function removeGenderSuffix(name) {
  return name
    .replace(/[_\s]?(female|male)$/i, '')
    .trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};
  const dryRun = params.dryRun === 'true';
  const batchSize = parseInt(params.batch) || 100;
  const offset = parseInt(params.offset) || 0;

  try {
    // List all images in bucket
    const allImages = [];

    async function listFilesRecursive(prefix = '') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000 });

      if (error) {
        console.error('Error listing files:', error);
        return;
      }

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder
          await listFilesRecursive(itemPath);
        } else if (/\.(jpeg|jpg|png|gif|webp)$/i.test(item.name)) {
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(itemPath);

          allImages.push({
            filename: item.name,
            path: itemPath,
            folder: prefix,
            url: urlData.publicUrl
          });
        }
      }
    }

    await listFilesRecursive();
    console.log(`Found ${allImages.length} images in storage`);

    // Get all exercises
    const { data: exercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, thumbnail_url');

    if (exError) {
      throw new Error('Failed to fetch exercises: ' + exError.message);
    }

    // Create lookup map by normalized name
    const exerciseMap = new Map();
    for (const ex of exercises) {
      const normalized = normalizeName(ex.name);
      const withoutGender = removeGenderSuffix(normalized);
      exerciseMap.set(normalized, ex);
      if (normalized !== withoutGender) {
        exerciseMap.set(withoutGender, ex);
      }
    }

    // Process images in batch
    const imageBatch = allImages.slice(offset, offset + batchSize);
    const hasMore = offset + batchSize < allImages.length;
    const nextOffset = offset + batchSize;
    const remaining = Math.max(0, allImages.length - nextOffset);

    const results = {
      matched: [],
      skipped: [],
      notFound: []
    };

    for (const image of imageBatch) {
      const normalized = normalizeName(image.filename);
      const withoutGender = removeGenderSuffix(normalized);

      // Try to find matching exercise
      let exercise = exerciseMap.get(normalized) || exerciseMap.get(withoutGender);

      if (exercise) {
        if (exercise.thumbnail_url === image.url) {
          results.skipped.push({ image: image.filename, exercise: exercise.name, reason: 'already set' });
        } else {
          if (!dryRun) {
            const { error } = await supabase
              .from('exercises')
              .update({ thumbnail_url: image.url })
              .eq('id', exercise.id);

            if (error) {
              results.notFound.push({ image: image.filename, error: error.message });
            } else {
              results.matched.push({ image: image.filename, exercise: exercise.name });
            }
          } else {
            results.matched.push({ image: image.filename, exercise: exercise.name, dryRun: true });
          }
        }
      } else {
        results.notFound.push({ image: image.filename, normalized: normalized });
      }
    }

    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN' : 'LIVE',
      batch: {
        processed: imageBatch.length,
        offset: offset,
        total: allImages.length,
        hasMore: hasMore,
        remaining: remaining
      },
      summary: {
        imagesInBucket: allImages.length,
        exercisesInDb: exercises.length,
        matched: results.matched.length,
        skipped: results.skipped.length,
        notFound: results.notFound.length
      },
      details: {
        matched: results.matched.slice(0, 30),
        notFound: results.notFound.slice(0, 30)
      }
    };

    if (hasMore) {
      response.nextBatch = `?offset=${nextOffset}${dryRun ? '&dryRun=true' : ''}`;
      response.message = `Processed ${imageBatch.length} images. ${remaining} remaining.`;
    } else {
      response.message = 'All images processed!';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (err) {
    console.error('Sync thumbnails error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
