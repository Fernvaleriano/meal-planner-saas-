// Polling endpoint — reads the job status/result that the background function
// (generate-workout-claude-background.js) writes to Supabase Storage.
//
// Auth: must be the same coach who started the job. We verify by:
//   1. Authenticated user must own coachId via authenticateCoach
//   2. Job blob lives under {coachId}/{jobId}.json so other coaches can't read it
//
// Returns the JSON blob as-is. Frontend reads the `status` field and acts on
// 'queued' | 'running' | 'completed' | 'failed'.
const { createClient } = require('@supabase/supabase-js');
const { corsHeaders, handleCors, authenticateCoach } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'ai-workout-jobs';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  const params = event.queryStringParameters || {};
  const coachId = params.coachId;
  const jobId = params.jobId;

  if (!coachId || !jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId and jobId are required' }) };
  }

  // Verify the requester owns this coach account
  const { user, error: authError } = await authenticateCoach(event, coachId);
  if (authError) return authError;

  // Basic safety: jobId must look like a UUID-ish string (no path traversal)
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid jobId format' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const path = `${coachId}/${jobId}.json`;

  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
  if (error || !data) {
    // Job not found yet (background function may not have written initial state)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'pending', message: 'Job not started yet' })
    };
  }

  const text = await data.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Job file is malformed' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify(payload) };
};
