/**
 * Public (no-auth) email confirmation link target for self-signed-up
 * clients (see gym-join.js). Visiting the link with a valid, unexpired
 * token marks the client's email as verified and clears the token.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquecoach.com';

function redirect(query) {
  return {
    statusCode: 302,
    headers: { Location: `${APP_URL}/app/login?${query}` },
    body: ''
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = (event.queryStringParameters && event.queryStringParameters.token || '').trim();
  if (!token) {
    return redirect('verifyError=1');
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: client, error } = await supabase
      .from('clients')
      .select('id, email_verified_at, email_verify_token_expires_at')
      .eq('email_verify_token', token)
      .maybeSingle();

    if (error || !client) {
      return redirect('verifyError=1');
    }

    if (client.email_verified_at) {
      return redirect('emailVerified=1');
    }

    if (!client.email_verify_token_expires_at || new Date(client.email_verify_token_expires_at) < new Date()) {
      return redirect('verifyError=expired');
    }

    await supabase
      .from('clients')
      .update({
        email_verified_at: new Date().toISOString(),
        email_verify_token: null,
        email_verify_token_expires_at: null
      })
      .eq('id', client.id);

    return redirect('emailVerified=1');
  } catch (err) {
    console.error('verify-client-email error:', err);
    return redirect('verifyError=1');
  }
};
