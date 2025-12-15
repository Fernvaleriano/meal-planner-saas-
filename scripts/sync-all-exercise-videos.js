#!/usr/bin/env node
/**
 * Sync All Exercise Videos
 *
 * This script automatically syncs all videos from the Supabase storage bucket
 * to the exercises database, handling pagination automatically.
 *
 * Usage:
 *   node scripts/sync-all-exercise-videos.js
 *   node scripts/sync-all-exercise-videos.js --dry-run   # Preview changes
 *   node scripts/sync-all-exercise-videos.js --batch=200  # Custom batch size
 */

const https = require('https');
const http = require('http');

// Configuration
const SITE_URL = process.env.SITE_URL || 'https://ziquefitness.netlify.app';
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1]) || 100;
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_BETWEEN_BATCHES = 1000; // 1 second between batches

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncAllVideos() {
  log('\n=== Exercise Video Sync ===\n', 'blue');
  log(`Site: ${SITE_URL}`, 'dim');
  log(`Batch size: ${BATCH_SIZE}`, 'dim');
  log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`, DRY_RUN ? 'yellow' : 'green');
  log('');

  let offset = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalVideos = 0;
  let batchNumber = 1;

  try {
    while (true) {
      const url = `${SITE_URL}/.netlify/functions/sync-exercises-from-videos?batch=${BATCH_SIZE}&offset=${offset}${DRY_RUN ? '&dryRun=true' : ''}`;

      log(`\n[Batch ${batchNumber}] Processing videos ${offset} - ${offset + BATCH_SIZE}...`, 'blue');

      const result = await fetchUrl(url);

      if (result.error) {
        log(`Error: ${result.error}`, 'red');
        break;
      }

      totalVideos = result.batch.total;
      totalCreated += result.summary.created;
      totalUpdated += result.summary.updated;
      totalSkipped += result.summary.skipped;
      totalErrors += result.summary.errors;

      // Show batch results
      const processed = result.batch.processed;
      log(`  Created: ${result.summary.created} | Updated: ${result.summary.updated} | Skipped: ${result.summary.skipped}`, 'dim');

      if (result.summary.errors > 0) {
        log(`  Errors: ${result.summary.errors}`, 'red');
        result.details.errors?.forEach(err => {
          log(`    - ${err.name}: ${err.error}`, 'red');
        });
      }

      // Progress bar
      const progress = Math.min(100, Math.round(((offset + processed) / totalVideos) * 100));
      const progressBar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
      log(`  [${progressBar}] ${progress}% (${offset + processed}/${totalVideos})`, 'green');

      // Check if we're done
      if (!result.batch.hasMore) {
        break;
      }

      offset = result.batch.offset + result.batch.processed;
      batchNumber++;

      // Small delay between batches to avoid overwhelming the server
      await sleep(DELAY_BETWEEN_BATCHES);
    }

    // Final summary
    log('\n' + '='.repeat(50), 'blue');
    log('SYNC COMPLETE', 'green');
    log('='.repeat(50), 'blue');
    log(`\nTotal videos in bucket: ${totalVideos}`);
    log(`  Created: ${totalCreated}`, totalCreated > 0 ? 'green' : 'dim');
    log(`  Updated: ${totalUpdated}`, totalUpdated > 0 ? 'green' : 'dim');
    log(`  Skipped: ${totalSkipped}`, 'dim');
    log(`  Errors:  ${totalErrors}`, totalErrors > 0 ? 'red' : 'dim');

    if (DRY_RUN) {
      log('\nThis was a DRY RUN - no changes were made.', 'yellow');
      log('Run without --dry-run to apply changes.', 'yellow');
    }

    log('');

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run
syncAllVideos();
