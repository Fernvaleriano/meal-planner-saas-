// Netlify background function: same logic as sync-all-exercises but runs for
// up to 15 minutes. Use this for full-bucket backfills (?all=true). Returns
// 202 immediately; check results by running sync-all-exercises with dryRun=true
// afterwards and watching the created/updated counts drop toward zero.
const { handler } = require('./sync-all-exercises');

exports.handler = handler;
