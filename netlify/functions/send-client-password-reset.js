// Netlify Function to send password reset email to a client
// Allows coaches to help clients who need to reset their password
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');
const { sendEmail } = require('./utils/email-service');

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

    // Generate password reset link using Supabase Auth admin API
    const redirectUrl = `${APP_URL}/set-password.html`;

    const { data: linkData, error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: client.email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (resetError) {
      console.error('Password reset link generation error:', resetError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to generate password reset link',
          message: resetError.message
        })
      };
    }

    // Get the recovery link from the response
    const resetLink = linkData?.properties?.action_link;
    if (!resetLink) {
      console.error('No action_link returned from generateLink');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to generate password reset link',
          message: 'No recovery link was generated'
        })
      };
    }

    // Get coach info for the email
    const { data: coach } = await supabase
      .from('coaches')
      .select('full_name, email, white_label_enabled, email_from_verified, email_from, email_from_name, subscription_tier, brand_name, brand_primary_color, brand_logo_url, brand_email_logo_url, brand_email_footer')
      .eq('id', coachId)
      .single();

    const coachName = coach?.full_name || coach?.email || 'Your Coach';
    const hasWhiteLabel = coach?.white_label_enabled && coach?.email_from_verified;
    const hasBranding = ['professional', 'branded'].includes(coach?.subscription_tier);
    const primaryColor = (hasBranding && coach?.brand_primary_color) || '#0d9488';
    const brandName = (hasBranding && coach?.brand_name) || (hasWhiteLabel ? coachName : 'Zique Fitness Nutrition');
    const footerText = (hasBranding && coach?.brand_email_footer) || brandName;
    const logoUrl = hasBranding ? (coach?.brand_email_logo_url || coach?.brand_logo_url) : null;
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="${brandName}" style="max-width: 150px; height: auto; margin-bottom: 12px;">`
      : '';

    const clientName = client.client_name || 'there';
    const subject = `Reset Your Password - ${brandName}`;

    const textBody = `Hi ${clientName},

Your coach ${coachName} has requested a password reset for your account at ${brandName}.

To reset your password, click the link below:
${resetLink}

This link will expire in 24 hours.

If you did not request this reset, you can safely ignore this email.

${coachName}

---
${footerText}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background-color: ${primaryColor}; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
        ${logoHtml}
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Password Reset</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Reset your account password</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${clientName}</strong>,</p>

        <p style="margin-bottom: 20px; font-size: 16px;">Your coach <strong>${coachName}</strong> has requested a password reset for your account.</p>

        <p style="margin-bottom: 20px; font-size: 16px;">Click the button below to set a new password:</p>

        <div style="text-align: center; margin: 35px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px;">Reset Password</a>
        </div>

        <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px;">This link will expire in 24 hours</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

        <p style="color: #64748b; font-size: 14px;">If you did not request this reset, you can safely ignore this email.</p>

        <p style="margin-top: 25px; color: #334155;">
            <strong>${coachName}</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">${footerText}</p>
    </div>
</body>
</html>`;

    // Send the email using the app's email service
    const emailResult = await sendEmail({
      to: client.email,
      subject,
      text: textBody,
      html: htmlBody,
      fromEmail: hasWhiteLabel ? coach.email_from : undefined,
      fromName: hasWhiteLabel ? coach.email_from_name : undefined
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to send password reset email',
          message: emailResult.error || 'Email delivery failed'
        })
      };
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
