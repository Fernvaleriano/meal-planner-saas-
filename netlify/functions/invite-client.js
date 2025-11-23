// Netlify Function to invite a client to the portal
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { clientId, coachId } = JSON.parse(event.body);

    if (!clientId || !coachId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Client ID and Coach ID are required' })
      };
    }

    // Initialize Supabase client with service key for admin operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .single();

    if (clientError || !client) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Client not found' })
      };
    }

    // Check if client already has a user account
    if (client.user_id) {
      return {
        statusCode: 400,
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
        body: JSON.stringify({
          error: 'Client email required',
          message: 'Please add an email address to this client before inviting them.'
        })
      };
    }

    // Generate a random password (client will reset it via email)
    const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + 'A1!';

    // Create auth user with auto-confirm
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: client.email,
      password: randomPassword,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth error:', authError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to create user account',
          details: authError.message
        })
      };
    }

    // Send password reset email so client can set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      client.email,
      {
        redirectTo: `${process.env.URL || 'https://cute-jalebi-b0f423.netlify.app'}/client-login.html`
      }
    );

    if (resetError) {
      console.warn('Warning: Could not send password reset email:', resetError.message);
      // Don't fail the whole invitation if email fails - we'll continue
    }

    // Update client record with user_id and invitation timestamp
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        user_id: authData.user.id,
        invited_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .eq('coach_id', coachId);

    if (updateError) {
      console.error('Update error:', updateError);
      // Try to clean up the created user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update client record',
          details: updateError.message
        })
      };
    }

    console.log('Client invited successfully:', clientId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        email: client.email,
        clientName: client.client_name,
        message: 'Client invited successfully. Password reset email sent.'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
