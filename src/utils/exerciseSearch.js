// ===== Fuzzy exercise search (v2 — typo & partial-match tolerant) =====
// Shared engine used by the "Add Activity" modal and the "Swap Exercise"
// modal's Browse-All search so both behave identically. Pipeline:
//   1. Direct name hits (exact / prefix / substring) — highest scores.
//   2. Weighted token coverage — query tokens matched against name then
//      haystack (muscles, equipment). >=50% weighted coverage required, so
//      "overhead seated dumbbell extension" finds "Triceps extension seated - DB".
//   3. Trigram similarity (Dice coefficient) for typo tolerance —
//      "tirceps" matches "triceps", "dumbel" matches "dumbbell".
//   4. Soft positional modifiers (overhead/seated/incline/etc.) carry
//      lower weight, so they don't disqualify a match when missing.
//   5. Movement-pattern aliases — "skullcrusher" finds lying triceps extensions.
//
// Plural/singular tolerance (via expandSearchToken) is why "jumping jacks"
// finds the library's "Jumping jack".

const FUZZY_SYNONYMS = {
  'pushup': ['push up'], 'pushups': ['push up'], 'pushp': ['push up'],
  'pullup': ['pull up'], 'pullups': ['pull up'],
  'chinup': ['chin up'], 'chinups': ['chin up'],
  'situp': ['sit up'], 'situps': ['sit up'],
  'stepup': ['step up'], 'stepups': ['step up'],
  'stepdown': ['step down'],
  'deadlift': ['dead lift'], 'deadlifts': ['dead lift'],
  'tricep': ['triceps'], 'triceps': ['tricep'],
  'bicep': ['biceps'], 'biceps': ['bicep'],
  'ab': ['abs', 'abdominal'], 'abs': ['abdominal', 'abdominals'],
  'db': ['dumbbell'], 'dumbell': ['dumbbell'], 'dumbells': ['dumbbell'],
  'dumbbell': ['db'], 'dumbbells': ['db'],
  'bb': ['barbell'], 'barbel': ['barbell'], 'barbells': ['barbell'],
  'barbell': ['bb'],
  'kb': ['kettlebell'], 'kettle': ['kettlebell'], 'kettlebells': ['kettlebell'],
  'kettlebell': ['kb'],
  'bw': ['bodyweight'], 'bodyweigh': ['bodyweight'],
  'lat': ['lats', 'latissimus'], 'lats': ['lat', 'latissimus'],
  'glute': ['glutes'], 'glutes': ['glute'],
  'delt': ['delts', 'deltoid'], 'delts': ['delt', 'deltoid'], 'deltoid': ['delt'], 'deltoids': ['delt'],
  'quad': ['quads', 'quadriceps'], 'quads': ['quad', 'quadriceps'], 'quadricep': ['quad'], 'quadriceps': ['quad'],
  'ham': ['hamstring'], 'hams': ['hamstring'], 'hamstrings': ['hamstring'],
  'pec': ['pecs', 'pectoral'], 'pecs': ['pec', 'pectoral'], 'pectoral': ['pec'], 'pectorals': ['pec'],
  'calves': ['calf'], 'calf': ['calves'],
  'knees': ['knee'], 'knee': ['knees'],
  'rdl': ['romanian dead lift', 'romanian deadlift', 'stiff leg deadlift', 'stiff legged deadlift'],
  'ohp': ['overhead press'], 'bp': ['bench press']
};

const MOVEMENT_ALIASES = [
  { slang: ['skullcrusher', 'skullcrushers', 'skull crusher', 'skull crushers'],
    requires: ['lying', 'triceps', 'extension'] },
  { slang: ['lawnmower', 'lawnmowers', 'lawn mower', 'lawn mowers'],
    requires: ['single', 'arm', 'row'] },
  { slang: ['suitcase', 'suitcase carry', 'suitcase carries'],
    requires: ['single', 'arm', 'farmer'] },
  { slang: ['hip thrust', 'hip thrusts'],
    requires: ['glute', 'bridge'] },
  { slang: ['rdl', 'romanian deadlift', 'romanian dead lift'],
    requires: ['stiff', 'leg', 'deadlift'] }
];

const SOFT_MODIFIERS = new Set([
  'seated', 'standing', 'lying', 'kneeling', 'incline', 'decline',
  'flat', 'overhead', 'reverse', 'wide', 'narrow', 'close',
  'underhand', 'overhand', 'alternating', 'single', 'one', 'unilateral',
  'bilateral', 'machine', 'free', 'weighted', 'assisted', 'with', 'and'
]);

export const normalizeForSearch = (str) =>
  (str || '').toLowerCase().replace(/[^\w\s]+/g, ' ').replace(/\s+/g, ' ').trim();

const expandSearchToken = (token) => {
  const variants = new Set([token]);
  if (FUZZY_SYNONYMS[token]) FUZZY_SYNONYMS[token].forEach(v => variants.add(v));
  if (token.length > 3 && token.endsWith('s')) variants.add(token.slice(0, -1));
  else if (token.length > 2) variants.add(token + 's');
  if (token.length > 4 && token.endsWith('ing')) variants.add(token.slice(0, -3));
  if (token.length > 3 && token.endsWith('ed')) variants.add(token.slice(0, -2));
  return Array.from(variants);
};

const getExerciseSearchText = (ex) => {
  if (ex._searchText) return ex._searchText;
  const nameNorm = normalizeForSearch(ex.name);
  const secondary = Array.isArray(ex.secondary_muscles)
    ? ex.secondary_muscles.join(' ')
    : (ex.secondary_muscles || '');
  const baseParts = [
    ex.name, ex.muscle_group, ex.primary_muscles,
    secondary, ex.equipment, ex.exercise_type, ex.category
  ].filter(Boolean).join(' ');
  let combined = normalizeForSearch(baseParts);
  const aliasTerms = [];
  for (const entry of MOVEMENT_ALIASES) {
    if (entry.requires.every(t => nameNorm.includes(t))) aliasTerms.push(...entry.slang);
  }
  if (aliasTerms.length) combined += ' ' + aliasTerms.join(' ');
  ex._searchText = combined;
  ex._nameNorm = nameNorm;
  return combined;
};

const trigramSet = (s) => {
  const padded = `  ${s}  `;
  const set = new Set();
  for (let i = 0; i <= padded.length - 3; i++) set.add(padded.substr(i, 3));
  return set;
};

const trigramSimilarity = (a, b) => {
  if (!a || !b || a.length < 3 || b.length < 3) return 0;
  const A = trigramSet(a);
  const B = trigramSet(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
};

const bestWordTrigramSim = (token, text) => {
  let best = 0;
  for (const w of text.split(' ')) {
    if (w.length < 3) continue;
    const s = trigramSimilarity(token, w);
    if (s > best) best = s;
  }
  return best;
};

// Score an exercise against a query. Returns 0 when the exercise should be hidden.
export const fuzzyScore = (exercise, query) => {
  if (!query || !exercise?.name) return 0;
  const q = normalizeForSearch(query);
  if (!q) return 0;

  const haystack = getExerciseSearchText(exercise);
  const nameNorm = exercise._nameNorm || normalizeForSearch(exercise.name);

  if (nameNorm === q) return 10000;
  if (nameNorm.startsWith(q)) return 8000;
  if (nameNorm.includes(q)) return 6000;
  if (haystack.includes(q)) return 4000;

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length === 0) return 0;

  let coverage = 0, nameHits = 0, trigramBoost = 0, totalWeight = 0;
  for (const token of tokens) {
    const weight = SOFT_MODIFIERS.has(token) ? 0.4 : 1.0;
    totalWeight += weight;
    const variants = expandSearchToken(token);
    let inName = false, inHay = false;
    for (const v of variants) if (nameNorm.includes(v)) { inName = true; break; }
    if (!inName) for (const v of variants) if (haystack.includes(v)) { inHay = true; break; }
    if (inName) { coverage += weight; nameHits += weight; }
    else if (inHay) { coverage += weight * 0.7; }
    else if (token.length >= 4) {
      const sim = Math.max(
        bestWordTrigramSim(token, nameNorm),
        bestWordTrigramSim(token, haystack) * 0.85
      );
      if (sim >= 0.5) { coverage += weight * sim; trigramBoost += sim; }
    }
  }

  if (totalWeight === 0) return 0;
  const ratio = coverage / totalWeight;
  if (ratio < 0.5) return 0;

  const nameRatio = nameHits / totalWeight;
  const lengthPenalty = Math.max(0, nameNorm.length - 30);
  const score = Math.round(ratio * 2000)
              + Math.round(nameRatio * 1500)
              + Math.round(trigramBoost * 200)
              - lengthPenalty;
  return Math.max(score, 1);
};
