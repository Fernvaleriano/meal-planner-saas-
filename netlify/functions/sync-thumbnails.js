const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-thumbnails';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Word variations mapping - common synonyms and variations
const WORD_VARIATIONS = {
  // Muscle variations
  'bicep': ['biceps', 'bi'],
  'biceps': ['bicep', 'bi'],
  'tricep': ['triceps', 'tri'],
  'triceps': ['tricep', 'tri'],
  'quad': ['quads', 'quadriceps', 'quadricep'],
  'quads': ['quad', 'quadriceps', 'quadricep'],
  'quadriceps': ['quad', 'quads', 'quadricep'],
  'glute': ['glutes', 'gluteus', 'butt'],
  'glutes': ['glute', 'gluteus', 'butt'],
  'abs': ['abdominals', 'abdominal', 'core'],
  'abdominals': ['abs', 'core', 'abdominal'],
  'pec': ['pecs', 'pectoral', 'pectorals', 'chest'],
  'pecs': ['pec', 'pectoral', 'pectorals', 'chest'],
  'pectoral': ['pec', 'pecs', 'pectorals', 'chest'],
  'lat': ['lats', 'latissimus'],
  'lats': ['lat', 'latissimus'],
  'delt': ['delts', 'deltoid', 'deltoids', 'shoulder'],
  'delts': ['delt', 'deltoid', 'deltoids', 'shoulder'],
  'deltoid': ['delt', 'delts', 'deltoids', 'shoulder'],
  'trap': ['traps', 'trapezius'],
  'traps': ['trap', 'trapezius'],
  'ham': ['hams', 'hamstring', 'hamstrings'],
  'hamstring': ['ham', 'hams', 'hamstrings'],
  'hamstrings': ['ham', 'hams', 'hamstring'],
  'calf': ['calves', 'calfs'],
  'calves': ['calf', 'calfs'],
  'forearm': ['forearms'],
  'forearms': ['forearm'],

  // Equipment variations
  'db': ['dumbbell', 'dumbbells', 'dbs'],
  'dumbbell': ['db', 'dumbbells', 'dbs'],
  'dumbbells': ['db', 'dumbbell', 'dbs'],
  'bb': ['barbell', 'barbells'],
  'barbell': ['bb', 'barbells'],
  'ez': ['ezbar', 'ez-bar', 'curlbar'],
  'ezbar': ['ez', 'ez-bar', 'curlbar'],
  'kb': ['kettlebell', 'kettlebells'],
  'kettlebell': ['kb', 'kettlebells'],
  'bw': ['bodyweight', 'body-weight'],
  'bodyweight': ['bw', 'body-weight'],
  'cable': ['cables'],
  'machine': ['mach'],
  'smith': ['smithmachine'],
  'band': ['bands', 'resistance-band', 'resistanceband'],
  'bands': ['band', 'resistance-band', 'resistanceband'],

  // Exercise type variations
  'press': ['pressing'],
  'curl': ['curls', 'curling'],
  'curls': ['curl', 'curling'],
  'row': ['rows', 'rowing'],
  'rows': ['row', 'rowing'],
  'fly': ['flies', 'flyes', 'flye'],
  'flies': ['fly', 'flyes', 'flye'],
  'flyes': ['fly', 'flies', 'flye'],
  'raise': ['raises', 'raising'],
  'raises': ['raise', 'raising'],
  'extension': ['extensions', 'ext'],
  'extensions': ['extension', 'ext'],
  'pulldown': ['pulldowns', 'pull-down', 'pull-downs'],
  'pulldowns': ['pulldown', 'pull-down', 'pull-downs'],
  'pushdown': ['pushdowns', 'push-down', 'push-downs'],
  'pushdowns': ['pushdown', 'push-down', 'push-downs'],
  'pullup': ['pullups', 'pull-up', 'pull-ups', 'chinup', 'chinups'],
  'pullups': ['pullup', 'pull-up', 'pull-ups'],
  'pushup': ['pushups', 'push-up', 'push-ups'],
  'pushups': ['pushup', 'push-up', 'push-ups'],
  'squat': ['squats', 'squatting'],
  'squats': ['squat', 'squatting'],
  'lunge': ['lunges', 'lunging'],
  'lunges': ['lunge', 'lunging'],
  'deadlift': ['deadlifts', 'dl'],
  'deadlifts': ['deadlift', 'dl'],
  'crunch': ['crunches'],
  'crunches': ['crunch'],
  'situp': ['situps', 'sit-up', 'sit-ups'],
  'situps': ['situp', 'sit-up', 'sit-ups'],
  'plank': ['planks', 'planking'],
  'dip': ['dips', 'dipping'],
  'dips': ['dip', 'dipping'],
  'shrug': ['shrugs', 'shrugging'],
  'shrugs': ['shrug', 'shrugging'],
  'kickback': ['kickbacks', 'kick-back', 'kick-backs'],
  'kickbacks': ['kickback', 'kick-back', 'kick-backs'],

  // Position/direction variations
  'incline': ['inclined', 'inc'],
  'decline': ['declined', 'dec'],
  'flat': ['horizontal'],
  'seated': ['sitting', 'sit'],
  'standing': ['stand'],
  'lying': ['lay', 'laying'],
  'bent': ['bentover', 'bent-over'],
  'bentover': ['bent', 'bent-over'],
  'overhead': ['over-head', 'oh'],
  'lateral': ['side'],
  'front': ['frontal', 'anterior'],
  'rear': ['back', 'posterior'],
  'reverse': ['rev'],
  'single': ['one', '1', 'unilateral'],
  'double': ['two', '2', 'bilateral'],
  'alternating': ['alt', 'alternate'],
  'wide': ['widegrip', 'wide-grip'],
  'narrow': ['close', 'closegrip', 'close-grip'],
  'underhand': ['supinated', 'reverse'],
  'overhand': ['pronated']
};

// Important words that should be weighted higher
const HIGH_WEIGHT_WORDS = new Set([
  'dumbbell', 'dumbbells', 'db', 'barbell', 'bb', 'cable', 'machine',
  'kettlebell', 'kb', 'band', 'bands', 'bodyweight', 'bw', 'smith', 'ez',
  'press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
  'pullup', 'pushup', 'squat', 'lunge', 'deadlift', 'crunch', 'plank', 'dip',
  'shrug', 'kickback',
  'chest', 'back', 'shoulder', 'shoulders', 'leg', 'legs', 'arm', 'arms',
  'bicep', 'biceps', 'tricep', 'triceps', 'quad', 'quads', 'hamstring',
  'glute', 'glutes', 'calf', 'calves', 'abs', 'core'
]);

// Words to remove entirely
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'with', 'on', 'to', 'for', 'of', 'and', 'in', 'at',
  'exercise', 'workout', 'movement', 'video', 'demo', 'tutorial', 'male', 'female'
]);

// Normalize and tokenize a name into words
function tokenize(name) {
  return name
    .replace(/\.(jpeg|jpg|png|gif|webp|mp4)$/i, '') // Remove file extensions
    .replace(/([a-z])([A-Z])/g, '$1 $2')            // Split camelCase
    .toLowerCase()
    .replace(/[_\-\.]/g, ' ')                       // Replace separators
    .replace(/[^a-z0-9\s]/g, '')                    // Remove special chars
    .replace(/\d+$/g, '')                           // Remove trailing numbers
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

// Get all variations of a word
function getWordVariations(word) {
  const variations = new Set([word]);
  if (WORD_VARIATIONS[word]) {
    WORD_VARIATIONS[word].forEach(v => variations.add(v));
  }
  return variations;
}

// Check if two words match (including variations)
function wordsMatch(word1, word2) {
  if (word1 === word2) return true;

  const variations1 = getWordVariations(word1);
  const variations2 = getWordVariations(word2);

  for (const v1 of variations1) {
    if (variations2.has(v1)) return true;
  }

  return false;
}

// Calculate word-based match score between two names
function calculateWordScore(name1, name2) {
  const words1 = tokenize(name1);
  const words2 = tokenize(name2);

  if (words1.length === 0 || words2.length === 0) {
    return { score: 0, matchedWords: [], totalWords: 0 };
  }

  let matchedWords = [];
  let weightedMatches = 0;
  let totalWeight = 0;

  const used2 = new Set();

  for (const w1 of words1) {
    const isHighWeight = HIGH_WEIGHT_WORDS.has(w1);
    const weight = isHighWeight ? 2 : 1;
    totalWeight += weight;

    for (let i = 0; i < words2.length; i++) {
      if (used2.has(i)) continue;

      if (wordsMatch(w1, words2[i])) {
        used2.add(i);
        matchedWords.push(w1);
        weightedMatches += weight;
        break;
      }
    }
  }

  const unmatchedIn2 = words2.length - used2.size;
  const penalty = unmatchedIn2 * 0.1;

  const rawScore = totalWeight > 0 ? weightedMatches / totalWeight : 0;
  const score = Math.max(0, rawScore - penalty);

  const overlapPercent = Math.min(words1.length, words2.length) > 0
    ? matchedWords.length / Math.max(words1.length, words2.length)
    : 0;

  const finalScore = (score * 0.7) + (overlapPercent * 0.3);

  return {
    score: finalScore,
    matchedWords,
    words1,
    words2,
    totalWords: Math.max(words1.length, words2.length)
  };
}

// Find best matching exercise for an image
function findBestMatch(imageFilename, exercises, minScore = 0.6) {
  let bestMatch = null;
  let bestScore = 0;

  for (const exercise of exercises) {
    const result = calculateWordScore(imageFilename, exercise.name);

    if (result.score > bestScore && result.score >= minScore) {
      bestScore = result.score;
      bestMatch = {
        exercise,
        score: result.score,
        matchedWords: result.matchedWords
      };
    }
  }

  return bestMatch;
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

  // Single exercise update mode (called from UI)
  if (params.exerciseId && params.thumbnailUrl) {
    try {
      const { error } = await supabase
        .from('exercises')
        .update({ thumbnail_url: params.thumbnailUrl })
        .eq('id', params.exerciseId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, exerciseId: params.exerciseId })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  const dryRun = params.dryRun === 'true';
  const batchSize = parseInt(params.batch) || 100;
  const offset = parseInt(params.offset) || 0;
  const minScore = parseFloat(params.minScore) || 0.6;

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
      // Find best matching exercise using smart matching
      const match = findBestMatch(image.filename, exercises, minScore);

      if (match) {
        const exercise = match.exercise;

        if (exercise.thumbnail_url === image.url) {
          results.skipped.push({
            image: image.filename,
            exercise: exercise.name,
            reason: 'already set'
          });
        } else if (exercise.thumbnail_url && !params.overwrite) {
          results.skipped.push({
            image: image.filename,
            exercise: exercise.name,
            reason: 'has thumbnail (use overwrite=true to replace)'
          });
        } else {
          if (!dryRun) {
            const { error } = await supabase
              .from('exercises')
              .update({ thumbnail_url: image.url })
              .eq('id', exercise.id);

            if (error) {
              results.notFound.push({ image: image.filename, error: error.message });
            } else {
              results.matched.push({
                image: image.filename,
                exercise: exercise.name,
                score: Math.round(match.score * 100) + '%',
                matchedWords: match.matchedWords.join(', ')
              });
            }
          } else {
            results.matched.push({
              image: image.filename,
              exercise: exercise.name,
              score: Math.round(match.score * 100) + '%',
              matchedWords: match.matchedWords.join(', '),
              dryRun: true
            });
          }
        }
      } else {
        // No match found - show what the tokenized name looks like for debugging
        const tokens = tokenize(image.filename);
        results.notFound.push({
          image: image.filename,
          tokens: tokens.join(' '),
          hint: 'No exercise matched above ' + (minScore * 100) + '% threshold'
        });
      }
    }

    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN' : 'LIVE',
      settings: {
        minScore: minScore,
        overwrite: params.overwrite === 'true'
      },
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
        matched: results.matched.slice(0, 50),
        skipped: results.skipped.slice(0, 20),
        notFound: results.notFound.slice(0, 50)
      }
    };

    if (hasMore) {
      response.nextBatch = `?offset=${nextOffset}${dryRun ? '&dryRun=true' : ''}${params.overwrite ? '&overwrite=true' : ''}&minScore=${minScore}`;
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
