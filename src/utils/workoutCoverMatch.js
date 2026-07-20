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
  const s = String(name || '').toLowerCase();
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

  // 1. Drop opposite-gender photos. If that would leave nothing, keep the full
  //    list so we always return a cover.
  let eligible = list;
  if (gender) {
    const kept = list.filter((c) => {
      const g = coverGender(c.name);
      return !g || g === gender;
    });
    if (kept.length) eligible = kept;
  }

  // 2. Score each remaining photo by how many of its content words appear in the
  //    workout.
  const scored = eligible.map((c) => {
    const tokens = coverContentTokens(c.name);
    let matches = 0;
    for (const tok of tokens) if (haystack.includes(tok)) matches += 1;
    return { cover: c, matches };
  });

  const maxMatches = scored.reduce((m, s) => Math.max(m, s.matches), 0);
  let top = scored.filter((s) => s.matches === maxMatches);

  // 3. On a real content match, if both a gender-matching and a neutral photo
  //    tie, prefer the one that also matches the client's gender.
  if (maxMatches > 0 && gender) {
    const gm = top.filter((s) => coverGender(s.cover.name) === gender);
    if (gm.length) top = gm;
  }

  // Random tiebreak (and full randomness when nothing matched) keeps variety.
  const rng = typeof context.random === 'function' ? context.random : Math.random;
  const chosen = top[Math.floor(rng() * top.length)] || top[0];
  return chosen ? chosen.cover.url : null;
}
