// Netlify Function to send password reset email to a client
// Allows coaches to help clients who need to reset their password
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquefitnutrition.com';

// Common headers for all responses
const headers = {
  'Content-Type': 'application/json',
  ...corsHeaders
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { clientId, coachId } = JSON.parse(event.body);

    if (!clientId || !coachId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    console.log(`🔐 Authenticated coach ${user.id} sending password reset for client ${clientId}`);

    // Initialize Supabase client with service key for admin operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_name, email, user_id, coach_id')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .single();

    if (clientError || !client) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Client not found' })
      };
    }

    // Check if client has an email
    if (!client.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Client email required',
          message: 'This client does not have an email address on file.'
        })
      };
    }

    // Check if client has a user account (must have portal access to reset password)
    if (!client.user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Client has no portal access',
          message: 'This client has not been invited to the portal yet. Send them an invitation first.'
        })
      };
    }

    // Send password reset email using Supabase Auth
    const redirectUrl = `${APP_URL}/set-password.html`;

    const { error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: client.email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (resetError) {
      console.error('Password reset error:', resetError);

      // Try alternative method using resetPasswordForEmail
      const { error: altResetError } = await supabase.auth.resetPasswordForEmail(client.email, {
        redirectTo: redirectUrl
      });

      if (altResetError) {
        console.error('Alternative reset error:', altResetError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to send password reset email',
            message: altResetError.message
          })
        };
      }
    }

    console.log(`✅ Password reset email sent to ${client.email} for client ${client.client_name}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: client.email,
        clientName: client.client_name,
        message: `Password reset email sent to ${client.email}`
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
