#!/usr/bin/env node

/**
 * Test script for smart video-exercise matching
 * Run: node scripts/test-smart-matching.js
 */

// Word variations mapping (copy from smart-link-videos.js for testing)
const WORD_VARIATIONS = {
  'bicep': ['biceps', 'bi'],
  'biceps': ['bicep', 'bi'],
  'tricep': ['triceps', 'tri'],
  'triceps': ['tricep', 'tri'],
  'dumbbell': ['db', 'dumbbells', 'dbs'],
  'db': ['dumbbell', 'dumbbells', 'dbs'],
  'barbell': ['bb', 'barbells'],
  'bb': ['barbell', 'barbells'],
  'curl': ['curls', 'curling'],
  'curls': ['curl', 'curling'],
  'press': ['pressing'],
  'row': ['rows', 'rowing'],
  'rows': ['row', 'rowing'],
  'fly': ['flies', 'flyes', 'flye'],
  'flies': ['fly', 'flyes', 'flye'],
  'raise': ['raises', 'raising'],
  'raises': ['raise', 'raising'],
  'extension': ['extensions', 'ext'],
  'extensions': ['extension', 'ext'],
  'incline': ['inclined', 'inc'],
  'decline': ['declined', 'dec'],
  'seated': ['sitting', 'sit'],
  'standing': ['stand'],
  'lateral': ['lat', 'side'],
  'front': ['frontal', 'anterior'],
  'rear': ['back', 'posterior'],
  'single': ['one', '1'],
  'alternating': ['alt', 'alternate'],
  'hammer': ['neutral'],
  'chest': ['pec', 'pecs', 'pectoral'],
  'back': ['lats', 'lat'],
  'shoulder': ['shoulders', 'delt', 'delts'],
  'shoulders': ['shoulder', 'delt', 'delts'],
  'leg': ['legs'],
  'legs': ['leg'],
};

const HIGH_WEIGHT_WORDS = new Set([
  'dumbbell', 'dumbbells', 'db', 'barbell', 'bb', 'cable', 'machine',
  'kettlebell', 'kb', 'band', 'bands', 'bodyweight', 'bw', 'smith', 'ez',
  'press', 'curl', 'row', 'fly', 'raise', 'extension', 'pulldown', 'pushdown',
  'pullup', 'pushup', 'squat', 'lunge', 'deadlift', 'crunch', 'plank', 'dip',
  'chest', 'back', 'shoulder', 'shoulders', 'leg', 'legs', 'arm', 'arms',
  'bicep', 'biceps', 'tricep', 'triceps', 'quad', 'quads', 'hamstring',
  'glute', 'glutes', 'calf', 'calves', 'abs', 'core'
]);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'with', 'on', 'to', 'for', 'of', 'and', 'in', 'at',
  'exercise', 'workout', 'movement', 'video', 'demo', 'tutorial'
]);

function tokenize(name) {
  return name
    .replace(/\.mp4$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase BEFORE lowercasing
    .toLowerCase()
    .replace(/[_\-\.]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

function getWordVariations(word) {
  const variations = new Set([word]);
  if (WORD_VARIATIONS[word]) {
    WORD_VARIATIONS[word].forEach(v => variations.add(v));
  }
  return variations;
}

function wordsMatch(word1, word2) {
  if (word1 === word2) return true;
  const variations1 = getWordVariations(word1);
  const variations2 = getWordVariations(word2);
  for (const v1 of variations1) {
    if (variations2.has(v1)) return true;
  }
  return false;
}

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

// Test cases
const testCases = [
  // Should match well
  ['Dumbbell Bicep Curl.mp4', 'Dumbbell Biceps Curl'],
  ['Barbell Bench Press.mp4', 'Barbell Bench Press'],
  ['DB Incline Press.mp4', 'Dumbbell Incline Chest Press'],
  ['Cable Lateral Raise.mp4', 'Cable Side Lateral Raises'],
  ['BB Row.mp4', 'Barbell Row'],
  ['Triceps Pushdown Cable.mp4', 'Cable Tricep Pushdown'],
  ['Seated DB Shoulder Press.mp4', 'Seated Dumbbell Shoulder Press'],
  ['Hammer Curls.mp4', 'Hammer Curl'],

  // Should NOT match (different exercises)
  ['Dumbbell Bicep Curl.mp4', 'Barbell Squat'],
  ['Bench Press.mp4', 'Leg Press'],
  ['Tricep Extension.mp4', 'Leg Extension'],

  // Edge cases
  ['incline_dumbbell_fly.mp4', 'Incline Dumbbell Fly'],
  ['seated-cable-row.mp4', 'Seated Cable Row'],
  ['frontRaises.mp4', 'Front Raises'],
];

console.log('🧪 Testing Smart Video-Exercise Matching\n');
console.log('='.repeat(80));

for (const [videoName, exerciseName] of testCases) {
  const result = calculateWordScore(videoName, exerciseName);
  const score = Math.round(result.score * 100);
  const status = score >= 60 ? '✅' : '❌';

  console.log(`\n${status} Score: ${score}%`);
  console.log(`   Video:    "${videoName}"`);
  console.log(`   Exercise: "${exerciseName}"`);
  console.log(`   Tokens:   [${result.words1.join(', ')}] vs [${result.words2.join(', ')}]`);
  console.log(`   Matched:  [${result.matchedWords.join(', ')}]`);
}

console.log('\n' + '='.repeat(80));
console.log('Test complete!\n');

// Summary
const passing = testCases.filter((tc, i) => {
  const result = calculateWordScore(tc[0], tc[1]);
  // First 8 should match (>=60%), last 3 should NOT match (<60%)
  if (i < 8) return result.score >= 0.6;
  if (i >= 8 && i < 11) return result.score < 0.6;
  return result.score >= 0.6;
}).length;

console.log(`Passed: ${passing}/${testCases.length} test cases`);
