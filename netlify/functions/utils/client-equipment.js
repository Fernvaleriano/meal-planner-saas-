// Shared helper: resolve a client's effective equipment for workout generation.
//
// A client can have a photo-derived equipment list stored on
// clients.gym_equipment (set via the "Their Gym" area on the client profile).
// When that list has been APPROVED by the coach, it becomes the source of
// truth for what equipment the workout AI may use — it "wins" over whatever
// equipment checkboxes were sent in the request.
//
// This keeps both generate-workout-claude.js and
// generate-workout-claude-background.js in sync (single source of truth) so
// the behavior can never drift between the foreground and background paths.

// The category tokens the workout generator's equipment filter understands.
// Keep this in sync with the matchesSelectedEquipment() filters in the
// generator functions.
const VALID_EQUIPMENT_CATEGORIES = [
  'barbell', 'dumbbell', 'cable', 'machine',
  'bodyweight', 'kettlebell', 'bands', 'pullup_bar'
];

/**
 * Look up a client's approved gym equipment and decide what equipment filter
 * the generator should actually use.
 *
 * @param {object} supabase   - service-role Supabase client
 * @param {string|null} clientId
 * @param {string[]} passedEquipment - equipment array from the request body
 * @returns {Promise<{categories: string[], detailText: string, autoApplied: boolean, items: string[]}>}
 *   categories  - the equipment tokens to filter exercises with
 *   detailText  - human-readable specifics to add to the AI prompt (or '')
 *   autoApplied - true when the client's approved list overrode passedEquipment
 *   items       - the friendly equipment item strings (for logging/UI)
 */
async function resolveClientEquipment(supabase, clientId, passedEquipment) {
  const fallback = {
    categories: Array.isArray(passedEquipment) ? passedEquipment : [],
    detailText: '',
    autoApplied: false,
    items: []
  };

  if (!clientId) return fallback;

  let gym = null;
  try {
    const { data } = await supabase
      .from('clients')
      .select('gym_equipment')
      .eq('id', clientId)
      .maybeSingle();
    gym = data?.gym_equipment || null;
  } catch (err) {
    // gym_equipment column may not exist yet, or the lookup failed — never
    // let this break generation; just fall back to the passed equipment.
    console.warn('resolveClientEquipment lookup failed:', err.message);
    return fallback;
  }

  // Only an APPROVED list with at least one usable category overrides the
  // request. A pending (un-approved) list is ignored on purpose — the coach
  // chose to review before it affects plans.
  if (!gym || typeof gym !== 'object') return fallback;
  if (gym.status !== 'approved') return fallback;

  const rawCategories = Array.isArray(gym.categories) ? gym.categories : [];
  const categories = [...new Set(
    rawCategories
      .map(c => String(c || '').toLowerCase().trim())
      .filter(c => VALID_EQUIPMENT_CATEGORIES.includes(c))
  )];

  // Nothing usable in the approved list → don't override.
  if (categories.length === 0) return fallback;

  // Always allow bodyweight movements: every client has a body, and this
  // guarantees the equipment filter can never produce an empty exercise pool
  // (which would otherwise fail generation).
  if (!categories.includes('bodyweight')) categories.push('bodyweight');

  const items = Array.isArray(gym.items)
    ? gym.items.map(i => String(i || '').trim()).filter(Boolean)
    : [];

  let detailText = '';
  if (items.length > 0) {
    detailText =
      '\n=== THIS CLIENT\'S ACTUAL EQUIPMENT (from photos of their gym — STRICT) ===\n' +
      'Only program exercises that can be performed with the equipment listed below. ' +
      'Do NOT assume a full commercial gym. If an all-in-one / multi-station machine is ' +
      'listed, you may use any of the movements it provides (e.g. lat pulldown, chest ' +
      'press, leg extension, seated row) but nothing requiring equipment not listed.\n' +
      items.map(i => `  • ${i}`).join('\n') + '\n';
  }

  return { categories, detailText, autoApplied: true, items };
}

module.exports = { resolveClientEquipment, VALID_EQUIPMENT_CATEGORIES };
