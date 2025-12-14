const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Simple string similarity (Levenshtein-based)
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Normalize name for matching (lowercase, trim spaces, remove trailing spaces before extension)
function normalizeName(name) {
  return name.toLowerCase().replace(/\.mp4$/i, '').trim().replace(/\s+/g, ' ');
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

  // Check for fuzzy matching mode
  const params = event.queryStringParameters || {};
  const fuzzyMatch = params.fuzzy === 'true';

  try {
    // Get all exercises upfront (one query instead of many)
    const { data: allExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    if (exError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch exercises: ' + exError.message })
      };
    }

    // Create lookup map for fast matching
    const exerciseMap = new Map();
    const exerciseList = [];
    for (const ex of allExercises || []) {
      const normalizedName = normalizeName(ex.name);
      exerciseMap.set(normalizedName, ex);
      exerciseList.push({ ...ex, normalizedName });
    }

    // List all files in the bucket
    const allFiles = [];

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
          await listFilesRecursive(itemPath);
        } else if (item.name.toLowerCase().endsWith('.mp4')) {
          allFiles.push({
            name: item.name,
            path: itemPath
          });
        }
      }
    }

    await listFilesRecursive();

    if (allFiles.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No MP4 files found in storage bucket',
          matched: 0,
          unmatched: 0
        })
      };
    }

    // Process all files and collect updates
    let matched = 0;
    let fuzzyMatched = 0;
    let unmatched = 0;
    let skipped = 0;
    const matchedExercises = [];
    const unmatchedFiles = [];
    const updates = [];

    for (const file of allFiles) {
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(file.path);

      const videoUrl = urlData.publicUrl;
      const normalizedFileName = normalizeName(file.name);

      // Try exact match first (in memory - fast!)
      let exercise = exerciseMap.get(normalizedFileName);

      if (exercise) {
        // Already has this video? Skip
        if (exercise.video_url === videoUrl) {
          skipped++;
          continue;
        }
        matched++;
        matchedExercises.push({ file: file.name, exercise: exercise.name });
        updates.push({ id: exercise.id, video_url: videoUrl, animation_url: videoUrl });
      } else {
        // Find best fuzzy match
        let bestMatch = null;
        let bestScore = 0;

        for (const ex of exerciseList) {
          const score = similarity(normalizedFileName, ex.normalizedName);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = ex;
          }
        }

        // Auto-link if fuzzy enabled and good match
        if (fuzzyMatch && bestScore > 0.8 && bestMatch && !bestMatch.video_url) {
          fuzzyMatched++;
          matchedExercises.push({
            file: file.name,
            exercise: bestMatch.name,
            fuzzy: true,
            confidence: Math.round(bestScore * 100) + '%'
          });
          updates.push({ id: bestMatch.id, video_url: videoUrl, animation_url: videoUrl });
          // Mark as having video now
          bestMatch.video_url = videoUrl;
        } else {
          unmatched++;
          unmatchedFiles.push({
            file: file.name,
            suggestedMatch: bestMatch ? bestMatch.name : null,
            confidence: bestMatch ? Math.round(bestScore * 100) + '%' : null,
            alreadyHasVideo: bestMatch?.video_url ? true : false
          });
        }
      }
    }

    // Batch update all matches (much faster than individual updates)
    let updateErrors = 0;
    for (const update of updates) {
      const { error } = await supabase
        .from('exercises')
        .update({ video_url: update.video_url, animation_url: update.animation_url })
        .eq('id', update.id);

      if (error) updateErrors++;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        totalFiles: allFiles.length,
        matched,
        fuzzyMatched,
        unmatched,
        skipped,
        updateErrors,
        matchedExercises: matchedExercises.slice(0, 50),
        unmatchedFiles,
        tip: unmatched > 0 ? 'Add ?fuzzy=true to auto-link files with >80% name match' : null
      })
    };

  } catch (err) {
    console.error('Link videos error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
