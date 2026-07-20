// Smart picker for a workout's cover photo.
//
// The founder curates workout background photos in the public "Default Workout
// Pictures" bucket, each with a descriptive filename ("Kettlebell.png",
// "female plank.png", "man running outside.png", "rowing machine female.png",
// ...). Instead of dropping a purely random photo on an AI-generated workout,
// this picks the one that makes the most sense for the client and the workout:
//
//   1. Never use an opposite-gender photo for a client whose gender we know
//      (a female client should not get a "man deadlifting" cover, and vice
//      versa). Gender-neutral photos (a kettlebell, a rack, treadmills) are
//      always fair game.
//   2. Among what's left, prefer the photo whose name matches the workout's
//      content — a kettlebell session gets the kettlebell photo, a run/cardio
//      session gets the treadmill/running photo, and so on.
//   3. When nothing stands out, fall back to a random pick (same variety as
//      before) so covers don't get repetitive.
//
// It reads meaning straight off the filenames, so it keeps working as the
// founder adds new descriptively-named photos — no code change needed.

// Gender words that can appear in a photo filename. Female is checked first
// because a couple of female words ("woman"/"women"/"female") literally contain
// a male word.
const FEMALE_WORDS = ['female', 'woman', 'women', 'girl', 'lady', 'gal'];
const MALE_WORDS = ['male', 'man', 'men', 'guy', 'boy', 'dude', 'gent'];

// Generic scene/filler words in filenames that carry no workout meaning, so they
// should never count as a content match.
const STOP_WORDS = new Set([
  'gym', 'inside', 'outside', 'indoor', 'outdoor', 'the', 'and', 'with', 'for',
  'dark', 'light', 'line', 'rack', 'machine', 'photo', 'pic', 'picture',
  'image', 'doing', 'some', 'workout', 'exercise', 'fitness', 'training',
]);

// A few filename spellings normalized to the words that actually show up in
// exercise names ("male barbel curl" → barbell).
const TOKEN_ALIASES = { barbel: 'barbell', kettle: 'kettlebell', dumbell: 'dumbbell' };

function normalizeGender(g) {
  const s = String(g || '').trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'man') return 'male';
  if (s === 'female' || s === 'f' || s === 'woman') return 'female';
  return null; // 'all', '', or anything we don't recognize → no gender filter
}

// The gender a photo depicts, from its filename, or null if it shows no person.
export function coverGender(name) {
  // Collapse every non-letter (spaces, underscores, digits, punctuation) to a
  // single space first. Underscores matter: "\b" treats "_" as a word char, so
  // a name like "wave_male.png" would otherwise hide the "male" from \bmale\b.
  const s = String(name || '').toLowerCase().replace(/[^a-z]+/g, ' ');
  const has = (w) => new RegExp(`\\b${w}\\b`).test(s);
  if (FEMALE_WORDS.some(has)) return 'female';
  if (MALE_WORDS.some(has)) return 'male';
  return null;
}

function normalizeToken(tok) {
  let t = tok.toLowerCase();
  if (TOKEN_ALIASES[t]) t = TOKEN_ALIASES[t];
  // Crude singularization so "kettlebells"/"treadmills"/"dumbbells" match.
  if (t.length > 4 && t.endsWith('s')) t = t.slice(0, -1);
  // Crude -ing stemming so "deadlifting"/"running"/"rowing" match the noun form
  // in an exercise name ("Barbell Deadlift", "Treadmill Run").
  if (t.length > 5 && t.endsWith('ing')) {
    t = t.slice(0, -3);
    if (/([bdgmnprt])\1$/.test(t)) t = t.slice(0, -1); // runn→run, swimm→swim
  }
  return t;
}

// The meaningful (non-gender, non-filler) words in a photo's filename.
export function coverContentTokens(name) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  return base
    .toLowerCase()
    .split(/[^a-z]+/)
    .map(normalizeToken)
    .filter(
      (t) =>
        t.length >= 3 &&
        !STOP_WORDS.has(t) &&
        !FEMALE_WORDS.includes(t) &&
        !MALE_WORDS.includes(t)
    );
}

// Flatten a workout's exercises (+ any extra hints) into one lowercased string
// to test cover-name words against.
export function buildWorkoutHaystack({ exercises = [], extra = [] } = {}) {
  const parts = [];
  for (const ex of exercises) {
    if (!ex) continue;
    if (ex.name) parts.push(ex.name);
    if (ex.muscle_group) parts.push(ex.muscle_group);
    if (ex.muscleGroup) parts.push(ex.muscleGroup);
    if (ex.equipment) parts.push(ex.equipment);
    if (ex.category) parts.push(ex.category);
  }
  for (const e of extra) if (e) parts.push(e);
  return parts.join(' ').toLowerCase();
}

/**
 * Choose the best cover photo for a workout.
 *
 * @param {Array<{name:string,url:string}>} covers  The cover library.
 * @param {Object} context
 * @param {string} [context.gender]     Client gender ('male' | 'female' | 'all' | '').
 * @param {Array}  [context.exercises]  The workout's exercises (name/muscle/equipment).
 * @param {Array}  [context.extra]      Extra text hints (goal, split name, ...).
 * @param {string} [context.haystack]   Pre-built haystack (overrides exercises/extra).
 * @param {Function} [context.random]   RNG override, for tests.
 * @returns {string|null} The chosen photo URL, or null if the library is empty.
 */
export function pickBestCover(covers, context = {}) {
  const list = Array.isArray(covers) ? covers.filter((c) => c && c.url) : [];
  if (!list.length) return null;

  const gender = normalizeGender(context.gender);
  const haystack =
    context.haystack != null ? String(context.haystack).toLowerCase() : buildWorkoutHaystack(context);

  // 1. Decide which photos are allowed for this client:
  //    - Known gender  → same-gender people + gender-neutral photos.
  //    - Unknown gender → neutral photos ONLY. Never put a person of a guessed
  //      gender on a workout whose owner's gender we don't know (that's how a
  //      male-named plan ended up with a woman photo). Neutral = equipment /
  //      scenery shots with no person.
  let eligible = list.filter((c) => {
    const g = coverGender(c.name);
    if (!g) return true; // neutral photo — always fine
    return gender ? g === gender : false;
  });
  if (!eligible.length) eligible = list; // safety net so we always return a cover

  // 2. Score each allowed photo by how many of its content words appear in the
  //    workout (kettlebell photo for a kettlebell session, etc.).
  const scored = eligible.map((c) => {
    const tokens = coverContentTokens(c.name);
    let matches = 0;
    for (const tok of tokens) if (haystack.includes(tok)) matches += 1;
    return { cover: c, matches, sameGender: gender && coverGender(c.name) === gender };
  });

  // 3. Prefer photos that actually relate to the workout, but don't lock onto
  //    the single best one — that made every full-body plan share one photo.
  //    Keep all reasonably-relevant photos (>=1 match) as candidates, then pick
  //    at random weighted toward relevance and the client's gender. Result:
  //    varied covers that still make sense and respect gender.
  let pool = scored.filter((s) => s.matches >= 1);
  if (!pool.length) pool = scored;

  const rng = typeof context.random === 'function' ? context.random : Math.random;
  const weightOf = (s) => s.matches * 2 + (s.sameGender ? 2 : 0) + 1;
  const total = pool.reduce((sum, s) => sum + weightOf(s), 0);
  let roll = rng() * total;
  for (const s of pool) {
    roll -= weightOf(s);
    if (roll < 0) return s.cover.url;
  }
  return pool[pool.length - 1].cover.url;
}
