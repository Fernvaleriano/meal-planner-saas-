// Netlify Function to invite a client to the portal
// Sends an intake form link where clients fill out their profile and set password
const { createClient } = require('@supabase/supabase-js');
const { sendIntakeInvitationEmail } = require('./utils/email-service');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

// Token expiry time (7 days)
const TOKEN_EXPIRY_DAYS = 7;

// Common headers for all responses
const headers = {
  'Content-Type': 'application/json',
  ...corsHeaders
};

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

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
    const { clientId, coachId, intakeFormConfig } = JSON.parse(event.body);

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

    // Initialize Supabase client with service key for admin operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get client data and coach data in parallel
    const [clientResult, coachResult] = await Promise.all([
      supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .single(),
      supabase
        .from('coaches')
        .select('*')
        .eq('id', coachId)
        .single()
    ]);

    const { data: client, error: clientError } = clientResult;
    const { data: coach, error: coachError } = coachResult;

    if (clientError || !client) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Client not found' })
      };
    }

    // Check if client already has a user account
    if (client.user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Client already has portal access',
          message: 'This client has already been invited and has portal access.'
        })
      };
    }

    // Verify client has an email
    if (!client.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Client email required',
          message: 'Please add an email address to this client before inviting them.'
        })
      };
    }

    // Generate intake token
    const intakeToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

    // Update client record with intake token and optional form config
    const updateData = {
      intake_token: intakeToken,
      intake_token_expires_at: expiresAt.toISOString(),
      invited_at: new Date().toISOString()
    };

    // Store questionnaire customization if provided
    if (intakeFormConfig) {
      updateData.intake_form_config = intakeFormConfig;
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .eq('coach_id', coachId);

    if (updateError) {
      console.error('Update error:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to generate invitation',
          details: updateError.message
        })
      };
    }

    // Build the intake form URL
    const intakeFormUrl = `${APP_URL}/client-intake.html?token=${intakeToken}`;

    // Send invitation email with intake form link
    const emailResult = await sendIntakeInvitationEmail({
      client,
      coach,
      intakeFormUrl
    });

    if (!emailResult.success) {
      console.warn('Warning: Could not send invitation email:', emailResult.error);
      // Don't fail - token was still created
    } else {
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: client.email,
        clientName: client.client_name,
        emailSent: emailResult.success,
        message: emailResult.success
          ? 'Invitation sent! Client will receive an email to complete their profile.'
          : 'Invitation created, but email delivery may have failed. Please check the email address.'
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
