// Netlify Function to invite a client to the portal
const { createClient } = require('@supabase/supabase-js');
const { sendInvitationEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

// Common headers for all responses
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

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
        .select('id, email, full_name')
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

    // Generate a random password (client will reset it via email)
    const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + 'A1!';

    let authUser = null;

    // Try to create the user first - this is more reliable than listUsers which has pagination
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: client.email,
      password: randomPassword,
      email_confirm: true
    });

    if (authError) {
      console.log('Create user error:', authError.message);

      // If user already exists, try to find them
      if (authError.message.includes('already') || authError.message.includes('exists') || authError.message.includes('registered')) {
        console.log('User may already exist, searching with pagination...');

        // Search through all users with pagination
        let page = 1;
        let perPage = 100;
        let found = false;

        while (!found) {
          const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
            page: page,
            perPage: perPage
          });

          if (listError || !usersPage || !usersPage.users || usersPage.users.length === 0) {
            break;
          }

          const existingUser = usersPage.users.find(u => u.email === client.email);
          if (existingUser) {
            console.log('Found existing auth user for email:', client.email);
            authUser = existingUser;
            found = true;
            break;
          }

          // If we got fewer users than requested, we've reached the end
          if (usersPage.users.length < perPage) {
            break;
          }

          page++;
          // Safety limit to prevent infinite loops
          if (page > 100) {
            break;
          }
        }

        if (!authUser) {
          console.error('Could not find or create user for email:', client.email);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: 'Failed to create user account',
              details: 'User may already exist but could not be found. Please contact support.'
            })
          };
        }
      } else {
        // Some other error
        console.error('Auth error:', authError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to create user account',
            details: authError.message
          })
        };
      }
    } else {
      authUser = authData.user;
      console.log('Created new auth user:', authUser.id);
    }

    // Generate password reset link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: client.email,
      options: {
        redirectTo: `${APP_URL}/client-reset-password.html`
      }
    });

    if (linkError) {
      console.error('Failed to generate reset link:', linkError.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to generate invitation link',
          details: linkError.message
        })
      };
    }

    // Send custom branded invitation email
    const emailResult = await sendInvitationEmail({
      client,
      coach,
      resetLink: linkData.properties.action_link
    });

    if (!emailResult.success) {
      console.warn('Warning: Could not send invitation email:', emailResult.error);
      // Don't fail the whole invitation if email fails - user was still created
    } else {
      console.log('Invitation email sent successfully:', emailResult.messageId);
    }

    // Update client record with user_id and invitation timestamp
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        user_id: authUser.id,
        invited_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('coach_id', coachId);

    if (updateError) {
      console.error('Update error:', updateError);
      // Don't delete the user - they might need it later
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to update client record',
          details: updateError.message
        })
      };
    }

    console.log('Client invited successfully:', clientId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: client.email,
        clientName: client.client_name,
        emailSent: emailResult.success,
        message: emailResult.success
          ? 'Client invited successfully. Invitation email sent.'
          : 'Client invited successfully, but email delivery may have failed. Please check the email address.'
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
