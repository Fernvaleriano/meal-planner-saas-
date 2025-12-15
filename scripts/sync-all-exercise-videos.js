#!/usr/bin/env node
/**
 * Sync All Exercise Videos (Folder-based)
 *
 * This script automatically syncs all videos from the Supabase storage bucket
 * to the exercises database, processing one folder at a time to avoid timeouts.
 *
 * Usage:
 *   node scripts/sync-all-exercise-videos.js
 *   node scripts/sync-all-exercise-videos.js --dry-run   # Preview changes
 */

const https = require('https');
const http = require('http');

// Configuration
const SITE_URL = process.env.SITE_URL || 'https://ziquefitnessnutrition.com';
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_BETWEEN_FOLDERS = 500; // 0.5 second between folders

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
  log('\n=== Exercise Video Sync (Folder-based) ===\n', 'blue');
  log(`Site: ${SITE_URL}`, 'dim');
  log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`, DRY_RUN ? 'yellow' : 'green');
  log('');

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalVideos = 0;

  try {
    // First, get the list of folders
    const baseUrl = `${SITE_URL}/.netlify/functions/sync-exercises-from-videos`;
    log('Fetching folder list...', 'dim');

    const folderList = await fetchUrl(baseUrl);

    if (!folderList.folders || folderList.folders.length === 0) {
      log('No folders found in bucket!', 'red');
      return;
    }

    const folders = folderList.folders;
    log(`Found ${folders.length} folders to process: ${folders.join(', ')}\n`, 'dim');

    // Process each folder
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const url = `${baseUrl}?folder=${encodeURIComponent(folder)}${DRY_RUN ? '&dryRun=true' : ''}`;

      log(`[${i + 1}/${folders.length}] Processing folder: ${folder}...`, 'blue');

      const result = await fetchUrl(url);

      if (result.error) {
        log(`  Error: ${result.error}`, 'red');
        totalErrors++;
        continue;
      }

      totalVideos += result.summary.videosInFolder;
      totalCreated += result.summary.created;
      totalUpdated += result.summary.updated;
      totalSkipped += result.summary.skipped;
      totalErrors += result.summary.errors;

      // Show folder results
      log(`  Videos: ${result.summary.videosInFolder} | Created: ${result.summary.created} | Updated: ${result.summary.updated} | Skipped: ${result.summary.skipped}`, 'dim');

      if (result.summary.errors > 0) {
        log(`  Errors: ${result.summary.errors}`, 'red');
        result.details.errors?.forEach(err => {
          log(`    - ${err.name}: ${err.error}`, 'red');
        });
      }

      // Progress bar
      const progress = Math.round(((i + 1) / folders.length) * 100);
      const progressBar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
      log(`  [${progressBar}] ${progress}%`, 'green');

      // Small delay between folders
      if (i < folders.length - 1) {
        await sleep(DELAY_BETWEEN_FOLDERS);
      }
    }

    // Final summary
    log('\n' + '='.repeat(50), 'blue');
    log('SYNC COMPLETE', 'green');
    log('='.repeat(50), 'blue');
    log(`\nTotal videos processed: ${totalVideos}`);
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
