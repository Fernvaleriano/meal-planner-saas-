/**
 * Lets a logged-in client (self-signed-up via gym-join) re-send their own
 * "confirm your email" link, e.g. if it expired or landed in spam.
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { handleCors, authenticateRequest, corsHeaders } = require('./utils/auth');
const { sendClientVerificationEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquecoach.com';

const headers = { 'Content-Type': 'application/json', ...corsHeaders };

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { user, error: authError } = await authenticateRequest(event);
  if (authError) return authError;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, coach_id, email, client_name, email_verified_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (clientError || !client) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Client not found' }) };
    }

    if (client.email_verified_at) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, alreadyVerified: true }) };
    }

    if (!client.email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No email on file' }) };
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('clients')
      .update({
        email_verify_token: verifyToken,
        email_verify_token_expires_at: verifyTokenExpiresAt
      })
      .eq('id', client.id);

    if (updateError) {
      console.error('resend-client-verification-email update error:', updateError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not resend. Please try again.' }) };
    }

    const { data: coach } = await supabase
      .from('coaches')
      .select('subscription_tier, brand_name, brand_primary_color, brand_email_footer, brand_email_logo_url, brand_logo_url')
      .eq('id', client.coach_id)
      .single();

    const verifyLink = `${APP_URL}/.netlify/functions/verify-client-email?token=${verifyToken}`;
    const emailResult = await sendClientVerificationEmail({
      clientEmail: client.email,
      clientName: client.client_name,
      verifyLink,
      coach
    });

    if (!emailResult.success) {
      console.error('resend-client-verification-email send failed:', emailResult.error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not send email. Please try again.' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('resend-client-verification-email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
  }
};
