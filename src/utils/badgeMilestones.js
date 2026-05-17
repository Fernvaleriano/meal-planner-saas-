// Gym / check-in milestone detection.
//
// The canonical badge ladder lives in ./badges (BADGE_TIERS) and is also
// consumed by Progress.jsx and the share-card generator. This module does NOT
// redefine that ladder — it reuses it so the tiers can never drift apart.
//
// Milestone thresholds (lifetime check-in count): 1, 7, 14, 30, 60, then
// 100, 200, 365. The first five are the primary gym check-in milestones; the
// higher tiers are preserved so long-tenured clients keep earning badges.
import { BADGE_TIERS, getEarnedTiers, getNextTier } from './badges';

export { BADGE_TIERS, getEarnedTiers, getNextTier };

// Just the threshold numbers, in order — handy for tests/assertions.
export const MILESTONE_THRESHOLDS = BADGE_TIERS.map((t) => t.threshold);

// Given the lifetime check-in count BEFORE this check-in and the count AFTER
// it, return the highest badge tier newly earned by this check-in, or null.
//
// Why compare earned-tier sets instead of `threshold === newCount`:
//   - A milestone is never missed if the count advances by more than one
//     (e.g. an offline sync backfilling several check-ins at once).
//   - It still fires exactly once per badge: callers refresh the lifetime
//     count after saving, so a later check-in never re-crosses a threshold
//     it has already passed (prevCount is already past it -> no new tier).
export function getNewlyEarnedMilestone(prevCount, newCount) {
  const earnedBefore = getEarnedTiers(prevCount).length;
  const earnedAfter = getEarnedTiers(newCount);
  if (earnedAfter.length <= earnedBefore) return null;
  return earnedAfter[earnedAfter.length - 1];
}
