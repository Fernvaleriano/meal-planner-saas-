/**
 * Public (no-auth) gym member self-signup via a shared join code.
 *
 * A "gym" is a coach account. A member who joins becomes a client of that
 * coach (coach_id = the gym). This is the ONLY new public account-creation
 * path; it does not modify create-client.js (coach-authenticated) or the
 * per-client intake-token flow. Nothing here affects existing clients.
 *
 * Abuse protection:
 *  - member_cap: once the gym is full, no new members can join with the code.
 *  - is_active: a leaked code can be switched off (gym rotates to a new one).
 *  - email uniqueness: one account per email; existing coach emails rejected.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const code = (body.code || '').trim();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    // --- Validate input ---
    if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter your gym code.' }) };
    if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter your name.' }) };
    if (!isEmail(email)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter a valid email.' }) };
    if (password.length < 6) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password must be at least 6 characters.' }) };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // --- Resolve the code to a gym (active only) ---
    const { data: gymCode, error: codeError } = await supabase
      .from('gym_join_codes')
      .select('coach_id, member_cap, is_active')
      .ilike('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (codeError || !gymCode) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'That gym code isn’t valid. Please check with your gym.' }) };
    }

    // --- Cap check: is the gym full? (exclude archived members) ---
    const { count: memberCount, error: countError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', gymCode.coach_id)
      .not('is_archived', 'is', true);

    if (countError) {
      console.error('gym-join count error:', countError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
    }
    if ((memberCount || 0) >= (gymCode.member_cap || 0)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'This gym is full. Please ask the gym for a new code.', code: 'GYM_FULL' }) };
    }

    // --- Guard: email must not already be a coach account ---
    const { data: existingCoach } = await supabase
      .from('coaches')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingCoach) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'This email is already registered. Please use a different one.' }) };
    }

    // --- Create the login account ---
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (/already|exists|registered/i.test(authError.message || '')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'This email is already registered. Try logging in instead.' }) };
      }
      console.error('gym-join auth error:', authError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not create your account. Please try again.' }) };
    }

    const authUserId = authData.user.id;

    // --- Create the member (client) row, linked to the gym ---
    const nowIso = new Date().toISOString();
    const { data: client, error: insertError } = await supabase
      .from('clients')
      .insert([{
        coach_id: gymCode.coach_id,
        client_name: name,
        email,
        user_id: authUserId,
        access_status: 'active',
        registered_at: nowIso
      }])
      .select('id')
      .single();

    if (insertError) {
      console.error('gym-join insert error:', insertError);
      // Roll back the auth user so a failed join can be retried cleanly
      try { await supabase.auth.admin.deleteUser(authUserId); } catch (_) { /* best effort */ }
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not finish joining. Please try again.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, clientId: client.id })
    };
  } catch (error) {
    console.error('gym-join error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
  }
};
