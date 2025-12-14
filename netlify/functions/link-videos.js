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
    // Get all exercises for fuzzy matching
    const { data: allExercises } = await supabase
      .from('exercises')
      .select('id, name, video_url');

    // List all files in the bucket (recursively)
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
          // It's a folder, recurse
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

    console.log(`Found ${allFiles.length} MP4 files in storage`);

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

    // Link each video to exercises
    let matched = 0;
    let unmatched = 0;
    let fuzzyMatched = 0;
    const matchedExercises = [];
    const unmatchedFiles = [];

    for (const file of allFiles) {
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(file.path);

      const videoUrl = urlData.publicUrl;

      // Extract exercise name from filename (remove .mp4)
      const exerciseName = file.name.replace(/\.mp4$/i, '');

      // Try to match with exercise in database (case-insensitive exact match)
      const { data, error } = await supabase
        .from('exercises')
        .update({ video_url: videoUrl, animation_url: videoUrl })
        .ilike('name', exerciseName)
        .select('id, name');

      if (!error && data && data.length > 0) {
        matched++;
        matchedExercises.push({ file: file.name, exercise: data[0].name });
      } else {
        // Find closest match for suggestion
        let bestMatch = null;
        let bestScore = 0;

        for (const ex of allExercises || []) {
          const score = similarity(exerciseName, ex.name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = ex;
          }
        }

        // If fuzzy matching enabled and score > 0.8, auto-link
        if (fuzzyMatch && bestScore > 0.8 && bestMatch) {
          const { error: updateError } = await supabase
            .from('exercises')
            .update({ video_url: videoUrl, animation_url: videoUrl })
            .eq('id', bestMatch.id);

          if (!updateError) {
            fuzzyMatched++;
            matchedExercises.push({
              file: file.name,
              exercise: bestMatch.name,
              fuzzy: true,
              confidence: Math.round(bestScore * 100) + '%'
            });
            continue;
          }
        }

        unmatched++;
        unmatchedFiles.push({
          file: file.name,
          suggestedMatch: bestMatch ? bestMatch.name : null,
          confidence: bestMatch ? Math.round(bestScore * 100) + '%' : null,
          alreadyHasVideo: bestMatch?.video_url ? true : false
        });
      }
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
        matchedExercises,
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
