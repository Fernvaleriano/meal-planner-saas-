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
  'lateral': ['lat', 'side'],
  'front': ['frontal', 'anterior'],
  'rear': ['back', 'posterior'],
  'reverse': ['rev'],
  'single': ['one', '1'],
  'double': ['two', '2'],
  'alternating': ['alt', 'alternate'],
  'wide': ['wideGrip', 'wide-grip'],
  'narrow': ['close', 'closeGrip', 'close-grip'],
  'underhand': ['supinated', 'reverse'],
  'overhand': ['pronated'],

  // Common words to ignore (stop words)
  'the': [],
  'a': [],
  'an': [],
  'with': [],
  'on': [],
  'to': [],
  'for': [],
  'of': [],
  'and': [],
  'in': [],
  'at': []
};

// Important words that should be weighted higher
const HIGH_WEIGHT_WORDS = new Set([
  // Equipment (most important - wrong equipment = wrong exercise)
  'dumbbell', 'dumbbells', 'db', 'barbell', 'bb', 'cable', 'machine',
  'kettlebell', 'kb', 'band', 'bands', 'bodyweight', 'bw', 'smith', 'ez',

  // Core exercise types
  'press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
  'pullup', 'pushup', 'squat', 'lunge', 'deadlift', 'crunch', 'plank', 'dip',
  'shrug', 'kickback',

  // Major muscles
  'chest', 'back', 'shoulder', 'shoulders', 'leg', 'legs', 'arm', 'arms',
  'bicep', 'biceps', 'tricep', 'triceps', 'quad', 'quads', 'hamstring',
  'glute', 'glutes', 'calf', 'calves', 'abs', 'core'
]);

// Words to remove entirely (they don't help with matching)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'with', 'on', 'to', 'for', 'of', 'and', 'in', 'at',
  'exercise', 'workout', 'movement', 'video', 'demo', 'tutorial'
]);

// Normalize and tokenize a name into words
function tokenize(name) {
  return name
    .replace(/\.mp4$/i, '')           // Remove file extension
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase BEFORE lowercasing
    .toLowerCase()                      // Then lowercase
    .replace(/[_\-\.]/g, ' ')          // Replace separators with spaces
    .replace(/[^a-z0-9\s]/g, '')       // Remove special chars
    .split(/\s+/)                       // Split on whitespace
    .filter(word => word.length > 1 && !STOP_WORDS.has(word)); // Remove stop words and single chars
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

  // Check if any variation of word1 matches word2 or its variations
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

  // Track which words from name2 have been matched
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

  // Also account for words in name2 that weren't matched (penalty for extra words)
  const unmatchedIn2 = words2.length - used2.size;
  const penalty = unmatchedIn2 * 0.1; // Small penalty for extra words

  // Score: matched weighted words / total weight, minus penalty
  const rawScore = totalWeight > 0 ? weightedMatches / totalWeight : 0;
  const score = Math.max(0, rawScore - penalty);

  // Also calculate simple overlap percentage
  const overlapPercent = Math.min(words1.length, words2.length) > 0
    ? matchedWords.length / Math.max(words1.length, words2.length)
    : 0;

  // Combine weighted score with overlap
  const finalScore = (score * 0.7) + (overlapPercent * 0.3);

  return {
    score: finalScore,
    matchedWords,
    words1,
    words2,
    totalWords: Math.max(words1.length, words2.length)
  };
}

// Simple Levenshtein similarity as fallback
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

// Normalize name for exact matching
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
      body: JSON.stringify({ error: 'Server configuration error - missing SUPABASE_SERVICE_KEY' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Query parameters
  const params = event.queryStringParameters || {};
  const dryRun = params.dryRun === 'true' || params.dry === 'true';
  const minScore = parseFloat(params.minScore) || 0.6; // Minimum word match score (60%)
  const showAll = params.showAll === 'true'; // Show all potential matches for debugging

  try {
    console.log('Starting smart video linking...');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no updates)' : 'LIVE (will update DB)'}`);
    console.log(`Minimum score: ${minScore}`);

    // Get all exercises
    const { data: allExercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, video_url, muscle_group, equipment');

    if (exError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch exercises: ' + exError.message })
      };
    }

    console.log(`Found ${allExercises?.length || 0} exercises in database`);

    // Create lookup structures
    const exerciseMap = new Map();
    const exerciseList = [];
    for (const ex of allExercises || []) {
      const normalizedName = normalizeName(ex.name);
      exerciseMap.set(normalizedName, ex);
      exerciseList.push({
        ...ex,
        normalizedName,
        tokens: tokenize(ex.name)
      });
    }

    // List all video files in storage
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
            path: itemPath,
            folder: prefix
          });
        }
      }
    }

    await listFilesRecursive();
    console.log(`Found ${allFiles.length} video files in storage`);

    if (allFiles.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No MP4 files found in storage bucket',
          totalExercises: exerciseList.length,
          totalVideos: 0
        })
      };
    }

    // Match videos to exercises
    const results = {
      exactMatches: [],
      wordMatches: [],
      fuzzyMatches: [],
      unmatched: [],
      skipped: [],
      alreadyLinked: []
    };

    const updates = [];

    for (const file of allFiles) {
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(file.path);

      const videoUrl = urlData.publicUrl;
      const normalizedFileName = normalizeName(file.name);

      // 1. Try exact match first
      let exercise = exerciseMap.get(normalizedFileName);

      if (exercise) {
        if (exercise.video_url === videoUrl) {
          results.alreadyLinked.push({
            file: file.name,
            exercise: exercise.name,
            type: 'exact'
          });
          continue;
        }

        results.exactMatches.push({
          file: file.name,
          exercise: exercise.name,
          exerciseId: exercise.id
        });

        if (!dryRun) {
          updates.push({ id: exercise.id, video_url: videoUrl, animation_url: videoUrl });
        }
        continue;
      }

      // 2. Try word-based matching
      let bestWordMatch = null;
      let bestWordScore = 0;
      let bestWordDetails = null;

      for (const ex of exerciseList) {
        const scoreResult = calculateWordScore(file.name, ex.name);

        if (scoreResult.score > bestWordScore) {
          bestWordScore = scoreResult.score;
          bestWordMatch = ex;
          bestWordDetails = scoreResult;
        }
      }

      // 3. Also calculate fuzzy match score for comparison
      let bestFuzzyMatch = null;
      let bestFuzzyScore = 0;

      for (const ex of exerciseList) {
        const score = similarity(normalizedFileName, ex.normalizedName);
        if (score > bestFuzzyScore) {
          bestFuzzyScore = score;
          bestFuzzyMatch = ex;
        }
      }

      // Determine best match (prefer word matching)
      const useWordMatch = bestWordScore >= minScore && bestWordScore >= bestFuzzyScore * 0.9;
      const useFuzzyMatch = !useWordMatch && bestFuzzyScore >= 0.75;

      const bestMatch = useWordMatch ? bestWordMatch : (useFuzzyMatch ? bestFuzzyMatch : null);
      const matchType = useWordMatch ? 'word' : (useFuzzyMatch ? 'fuzzy' : 'none');

      if (bestMatch && !bestMatch.video_url) {
        const matchResult = {
          file: file.name,
          folder: file.folder,
          exercise: bestMatch.name,
          exerciseId: bestMatch.id,
          muscleGroup: bestMatch.muscle_group,
          equipment: bestMatch.equipment,
          wordScore: Math.round(bestWordScore * 100) + '%',
          fuzzyScore: Math.round(bestFuzzyScore * 100) + '%',
          matchedWords: bestWordDetails?.matchedWords || [],
          fileWords: tokenize(file.name),
          exerciseWords: bestMatch.tokens
        };

        if (matchType === 'word') {
          results.wordMatches.push(matchResult);
        } else {
          results.fuzzyMatches.push(matchResult);
        }

        if (!dryRun) {
          updates.push({ id: bestMatch.id, video_url: videoUrl, animation_url: videoUrl });
          bestMatch.video_url = videoUrl; // Mark as matched
        }
      } else if (bestMatch?.video_url) {
        results.skipped.push({
          file: file.name,
          reason: 'Best match already has video',
          bestMatch: bestMatch.name,
          wordScore: Math.round(bestWordScore * 100) + '%',
          fuzzyScore: Math.round(bestFuzzyScore * 100) + '%'
        });
      } else {
        results.unmatched.push({
          file: file.name,
          folder: file.folder,
          fileWords: tokenize(file.name),
          bestWordMatch: bestWordMatch?.name || null,
          wordScore: Math.round(bestWordScore * 100) + '%',
          bestFuzzyMatch: bestFuzzyMatch?.name || null,
          fuzzyScore: Math.round(bestFuzzyScore * 100) + '%'
        });
      }
    }

    // Apply updates if not dry run
    let updateErrors = 0;
    if (!dryRun && updates.length > 0) {
      console.log(`Applying ${updates.length} updates...`);
      for (const update of updates) {
        const { error } = await supabase
          .from('exercises')
          .update({ video_url: update.video_url, animation_url: update.animation_url })
          .eq('id', update.id);

        if (error) {
          console.error(`Error updating exercise ${update.id}:`, error);
          updateErrors++;
        }
      }
    }

    // Build response
    const response = {
      success: true,
      mode: dryRun ? 'DRY RUN' : 'LIVE',
      settings: {
        minWordScore: minScore,
        dryRun
      },
      summary: {
        totalVideos: allFiles.length,
        totalExercises: exerciseList.length,
        exactMatches: results.exactMatches.length,
        wordMatches: results.wordMatches.length,
        fuzzyMatches: results.fuzzyMatches.length,
        alreadyLinked: results.alreadyLinked.length,
        skipped: results.skipped.length,
        unmatched: results.unmatched.length,
        totalLinked: results.exactMatches.length + results.wordMatches.length + results.fuzzyMatches.length,
        updateErrors
      },
      matches: {
        exact: results.exactMatches.slice(0, 20),
        word: results.wordMatches,
        fuzzy: results.fuzzyMatches.slice(0, 20)
      },
      unmatched: results.unmatched,
      skipped: showAll ? results.skipped : results.skipped.slice(0, 10),
      alreadyLinked: showAll ? results.alreadyLinked : results.alreadyLinked.slice(0, 10)
    };

    if (dryRun) {
      response.nextStep = 'Run without ?dryRun=true to apply these matches';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (err) {
    console.error('Smart link videos error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
