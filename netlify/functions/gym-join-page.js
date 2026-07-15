/**
 * Server-rendered wrapper for the member join page (/join).
 *
 * WHY THIS EXISTS
 * gym-join.html brands itself (logo, gym name) with client-side JavaScript
 * AFTER the page loads. Social apps — Instagram, WhatsApp, iMessage, Facebook —
 * build their link preview by reading the raw HTML and never run that
 * JavaScript, so a shared /join link showed a blank/generic card with no gym
 * logo. This function serves the SAME page but stamps the gym's Open Graph
 * tags (logo, name) into the <head> up front, so the preview shows the gym's
 * own brand. On a white-label gym domain (e.g. huracan-fitness.com/join) the
 * gym is resolved from the hostname; a ?code= query wins if present.
 *
 * Additive & safe: the interactive page still runs its own branding JS for
 * real visitors exactly as before — this only adds the static preview tags.
 * If anything fails we fall back to the plain static file so /join never breaks.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Keep this map in sync with GYM_DOMAIN_CODES in gym-join.html: a white-label
// gym domain carries no ?code=, so the join code is resolved from the hostname.
const GYM_DOMAIN_CODES = {
  'huracan-fitness.com': 'HURACANFITNESS',
  'www.huracan-fitness.com': 'HURACANFITNESS',
  'huracan.ziquecoach.com': 'HURACANFITNESS'
};

// Unbranded default (matches index.html) — used when no gym resolves.
const DEFAULT_IMAGE = 'https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/icons/logo.png';
const DEFAULT_TITLE = 'Join your gym';
const DEFAULT_DESC = 'Set up your login and get started.';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function servePlain() {
  // Last-resort fallback: hand the raw static page back so /join still works.
  return { statusCode: 302, headers: { Location: '/gym-join.html', 'Cache-Control': 'no-store' }, body: '' };
}

exports.handler = async (event) => {
  const host = (event.headers['x-forwarded-host'] || event.headers.host || '').toLowerCase();
  const proto = event.headers['x-forwarded-proto'] || 'https';
  if (!host) return servePlain();

  // Load the static shell that every visitor already gets. Fetching it (rather
  // than reading from disk) keeps us independent of the function bundler and
  // always returns the currently deployed page.
  let html;
  try {
    const res = await fetch(`${proto}://${host}/gym-join.html`);
    if (!res.ok) return servePlain();
    html = await res.text();
  } catch (err) {
    console.error('gym-join-page: could not load shell:', err);
    return servePlain();
  }

  // Resolve the gym: explicit ?code= wins, otherwise the hostname map.
  const code = (event.queryStringParameters?.code || GYM_DOMAIN_CODES[host] || '').trim();

  let ogTitle = DEFAULT_TITLE;
  let ogDesc = DEFAULT_DESC;
  let ogImage = DEFAULT_IMAGE;

  if (code && SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: gymCode } = await supabase
        .from('gym_join_codes')
        .select('coach_id')
        .ilike('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (gymCode) {
        const { data: gym } = await supabase
          .from('coaches')
          .select('brand_name, brand_app_name, brand_logo_url, brand_welcome_message')
          .eq('id', gymCode.coach_id)
          .single();

        const name = gym?.brand_app_name || gym?.brand_name;
        if (name) {
          ogTitle = `Join ${name}`;
          ogDesc = gym?.brand_welcome_message || `Set up your ${name} login and get started.`;
        }
        if (gym?.brand_logo_url) ogImage = gym.brand_logo_url;
      }
    } catch (err) {
      console.error('gym-join-page: branding lookup failed:', err);
      // keep defaults
    }
  }

  const ogUrl = `${proto}://${host}/join`;
  const tags = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(ogDesc)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:url" content="${escapeHtml(ogUrl)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
  ].join('\n  ');

  // Insert right after the existing <title> so the preview tags sit in <head>.
  // Only replace the first occurrence; guard against re-injection.
  if (!html.includes('property="og:image"')) {
    html = html.replace('</title>', `</title>\n  ${tags}`);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short cache: gym logo/name changes propagate to previews within minutes.
      'Cache-Control': 'public, max-age=300'
    },
    body: html
  };
};
