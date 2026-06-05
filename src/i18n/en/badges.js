// Streak/consistency badge tier names + descriptions. The data lives in
// src/utils/badges.js (BADGE_TIERS) which is a plain module (no hook access),
// so each tier carries a nameKey/descKey resolved with t() at the render sites
// (BadgeCelebrationModal, Progress).
export default {
  name1: 'First Step',
  desc1: 'First check-in',
  name7: 'Week Warrior',
  desc7: '7 check-ins',
  name14: 'Two Weeks Strong',
  desc14: '14 check-ins',
  name30: 'Monthly Champion',
  desc30: '30 check-ins',
  name60: 'Consistency Hero',
  desc60: '60 check-ins',
  name100: 'Century Club',
  desc100: '100 check-ins',
  name200: 'Dedication Master',
  desc200: '200 check-ins',
  name365: 'Legend',
  desc365: '365 check-ins',
};
