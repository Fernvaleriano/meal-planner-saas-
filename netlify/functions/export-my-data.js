/**
 * Export My Data  (GDPR Phase 1 — data portability / right of access)
 *
 * Lets an authenticated user download a copy of THEIR OWN data only.
 * Output is a single JSON document (plus a media manifest of signed,
 * short-lived URLs for stored photos). It is uploaded to a private
 * storage bucket and delivered as a short-lived signed link by email.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  SECURITY MODEL  — this is the part to eyeball before going live.
 * ──────────────────────────────────────────────────────────────────────
 *  1. The caller MUST present a valid Supabase auth token (Bearer).
 *  2. The user's identity is derived SOLELY from that verified token.
 *     No id / clientId / coachId is ever accepted from the request
 *     (no query params, no body). There is therefore no IDOR surface.
 *  3. ALL personal-data reads go through `userClient`, a Supabase client
 *     bound to the caller's JWT (anon key + Authorization header). Row
 *     Level Security is enforced on every read, so even if a table or
 *     scope filter below were wrong, the database physically refuses to
 *     return another user's rows (fail-closed, returns empty).
 *  4. The service key is used ONLY for infrastructure that cannot run
 *     under user RLS: verifying the token, creating/using the private
 *     export bucket, and signing the download URL. It is never used to
 *     read personal data.
 *  5. Rate limited to 1 export / 24h (tracked via the append-only
 *     audit_log table) to bound cost and abuse.
 * ──────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// Public anon key (same value ships in the frontend bundle by design).
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

const EXPORT_BUCKET = 'data-exports';
const SIGNED_URL_TTL_SECONDS = 3600;          // 1 hour (founder window: 15min–1h)
const RATE_LIMIT_HOURS = 24;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Tables exported for a CLIENT identity, filtered by client_id.
const CLIENT_TABLES = [
  'client_checkins', 'client_measurements', 'food_diary_entries',
  'calorie_goals', 'workout_logs', 'exercise_logs', 'personal_records',
  'client_adhoc_workouts', 'client_workout_assignments', 'client_protocols',
  'client_subscriptions', 'client_payments', 'chat_messages',
  'notifications', 'challenge_participants', 'challenge_progress'
];

// Tables exported for a COACH identity, filtered by coach_id.
const COACH_TABLES = [
  'coach_challenges', 'coach_payment_plans', 'coach_promo_codes',
  'workout_programs', 'shared_workout_programs'
];

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

/**
 * Pull every row from `table` the caller can see, additionally filtered
 * by `scopeCol = scopeVal`. Runs under the caller's RLS context. Any
 * error (e.g. column does not exist) is reported in the manifest rather
 * than failing the whole export or — critically — leaking anything.
 */
async function collect(userClient, table, scopeCol, scopeVal) {
  try {
    const { data, error } = await userClient
      .from(table)
      .select('*')
      .eq(scopeCol, scopeVal);
    if (error) {
      return { table, status: 'skipped', reason: error.message, rows: [] };
    }
    return {
      table,
      status: (data && data.length) ? 'included' : 'empty',
      count: data ? data.length : 0,
      rows: data || []
    };
  } catch (e) {
    return { table, status: 'skipped', reason: e.message, rows: [] };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return json(500, { error: 'Server configuration error' });
  }

  // 1. Require + verify the auth token.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required' });
  }
  const token = authHeader.replace('Bearer ', '');

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
  const { data: { user } = {}, error: authError } =
    await serviceClient.auth.getUser(token);
  if (authError || !user) {
    return json(401, { error: 'Invalid token' });
  }

  // RLS-bound client: every personal-data read below is the caller's.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  try {
    // 2. Rate limit: 1 export / 24h (read own audit rows via RLS).
    const since = new Date(Date.now() - RATE_LIMIT_HOURS * 3600 * 1000).toISOString();
    const { data: recent } = await userClient
      .from('audit_log')
      .select('id, created_at')
      .eq('actor_id', user.id)
      .eq('action', 'data_export')
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length) {
      return json(429, {
        error: `You can request one data export every ${RATE_LIMIT_HOURS} hours. Please try again later.`
      });
    }

    // 3. Resolve identity SOLELY from the verified token.
    const { data: clientRow } = await userClient
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: coachRow } = await userClient
      .from('coaches')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!clientRow && !coachRow) {
      return json(404, { error: 'No profile found for this account' });
    }

    // 4. Collect data, RLS-scoped, with a manifest of what was included.
    const manifest = [];
    const data = {};

    if (clientRow) {
      for (const table of CLIENT_TABLES) {
        const r = await collect(userClient, table, 'client_id', clientRow.id);
        manifest.push({ scope: 'client', ...r, rows: undefined });
        data[table] = r.rows;
      }
    }
    if (coachRow) {
      for (const table of COACH_TABLES) {
        const r = await collect(userClient, table, 'coach_id', coachRow.id);
        manifest.push({ scope: 'coach', ...r, rows: undefined });
        data[table] = r.rows;
      }
    }

    // 5. Media manifest: signed, short-lived URLs for owned photo proofs.
    const media = [];
    try {
      const { data: proofs } = await userClient
        .from('weight_proofs')
        .select('id, storage_path, created_at')
        .not('storage_path', 'is', null);
      for (const p of proofs || []) {
        const { data: signed } = await serviceClient
          .storage.from('weight-proofs')
          .createSignedUrl(p.storage_path, SIGNED_URL_TTL_SECONDS);
        media.push({
          id: p.id,
          path: p.storage_path,
          created_at: p.created_at,
          signed_url: signed ? signed.signedUrl : null,
          expires_in_seconds: SIGNED_URL_TTL_SECONDS
        });
      }
    } catch (e) {
      manifest.push({ scope: 'media', table: 'weight_proofs', status: 'skipped', reason: e.message });
    }

    const exportDoc = {
      export_format_version: 1,
      generated_at: new Date().toISOString(),
      account: { auth_user_id: user.id, email: user.email },
      profile: { client: clientRow || null, coach: coachRow || null },
      data,
      media,
      manifest,
      notes: 'This is a copy of the personal data Ziquecoach holds about you. ' +
             'Photo links expire in 1 hour — download them promptly.'
    };

    // 6. Upload to a private bucket and sign a short-lived link.
    await serviceClient.storage.createBucket(EXPORT_BUCKET, { public: false })
      .catch(() => { /* already exists — fine */ });

    const objectPath = `${user.id}/${Date.now()}.json`;
    const { error: uploadError } = await serviceClient.storage
      .from(EXPORT_BUCKET)
      .upload(objectPath, JSON.stringify(exportDoc, null, 2), {
        contentType: 'application/json',
        upsert: false
      });
    if (uploadError) {
      throw new Error(`Failed to store export: ${uploadError.message}`);
    }

    const { data: signed, error: signError } = await serviceClient.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) {
      throw new Error(`Failed to sign export link: ${signError?.message}`);
    }

    // 7. Email the short-lived link.
    const emailResult = await sendExportEmail(user.email, signed.signedUrl);

    // 8. Append-only audit entry (written as the user, under RLS).
    await userClient.from('audit_log').insert({
      actor_id: user.id,
      tenant_id: clientRow ? (clientRow.coach_id || null) : user.id,
      action: 'data_export',
      target_type: 'account',
      target_id: user.id,
      ip: event.headers['x-nf-client-connection-ip'] ||
          event.headers['client-ip'] || null,
      metadata: { delivered_by: 'email', email_ok: emailResult.success }
    });

    return json(200, {
      success: true,
      message: `Your data export has been emailed to ${user.email}. ` +
               `The download link expires in 1 hour.`,
      email_delivered: emailResult.success
    });

  } catch (error) {
    console.error('export-my-data error:', error);
    return json(500, { error: 'Failed to generate data export' });
  }
};

async function sendExportEmail(to, link) {
  const emailFrom = process.env.EMAIL_FROM || 'noreply@ziquecoach.com';
  const emailFromName = process.env.EMAIL_FROM_NAME || 'Ziquecoach';
  const subject = 'Your Ziquecoach data export is ready';
  const text =
    `Your data export is ready.\n\n` +
    `Download it here (this link expires in 1 hour):\n${link}\n\n` +
    `If you did not request this, you can ignore this email — the link ` +
    `is private and expires automatically.`;
  const html =
    `<p>Your data export is ready.</p>` +
    `<p><a href="${link}">Download your data</a></p>` +
    `<p>This link expires in <strong>1 hour</strong> for your security. ` +
    `If you did not request this export, you can safely ignore this email.</p>`;

  if (!process.env.RESEND_API_KEY) {
    return { success: true, messageId: 'dev-' + Date.now() };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${emailFromName} <${emailFrom}>`,
        to: [to], subject, text, html
      })
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.message };
    return { success: true, messageId: data.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
