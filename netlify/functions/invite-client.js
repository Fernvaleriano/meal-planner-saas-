// Netlify Function to invite a client to the portal
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.URL || 'https://cute-jalebi-b0f423.netlify.app';

// Common headers for all responses
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Generate the invitation email HTML
function generateInviteEmailHTML(data) {
  const { clientName, coachName, businessName, logoUrl, brandColor, resetLink } = data;

  const displayName = businessName || coachName || 'Your Coach';
  const primaryColor = brandColor || '#7c3aed';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${displayName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${primaryColor} 0%, #1e1b4b 100%); padding: 40px 30px; text-align: center;">
              ${logoUrl ? `<img src="${logoUrl}" alt="${displayName}" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;">` : ''}
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0;">Welcome to ${displayName}!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi ${clientName || 'there'},
              </p>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                <strong>${coachName || displayName}</strong> has invited you to join their nutrition coaching portal. You'll have access to:
              </p>

              <!-- Features List -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: ${primaryColor}; font-size: 18px; margin-right: 12px;">✓</span>
                    <span style="color: #374151; font-size: 15px;">Track your meals and macros</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: ${primaryColor}; font-size: 18px; margin-right: 12px;">✓</span>
                    <span style="color: #374151; font-size: 15px;">View your personalized meal plans</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="color: ${primaryColor}; font-size: 18px; margin-right: 12px;">✓</span>
                    <span style="color: #374151; font-size: 15px;">Access your supplement protocols</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <span style="color: ${primaryColor}; font-size: 18px; margin-right: 12px;">✓</span>
                    <span style="color: #374151; font-size: 15px;">AI-powered nutrition assistant</span>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, ${primaryColor} 0%, #5b21b6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                      Set Up Your Account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
                This link will expire in 24 hours. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                Sent by ${displayName}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate plain text version of the email
function generateInviteEmailText(data) {
  const { clientName, coachName, businessName, resetLink } = data;
  const displayName = businessName || coachName || 'Your Coach';

  return `
Welcome to ${displayName}!

Hi ${clientName || 'there'},

${coachName || displayName} has invited you to join their nutrition coaching portal.

You'll have access to:
- Track your meals and macros
- View your personalized meal plans
- Access your supplement protocols
- AI-powered nutrition assistant

Set up your account by clicking this link:
${resetLink}

This link will expire in 24 hours.

If you didn't expect this invitation, you can safely ignore this email.

- ${displayName}
  `.trim();
}

// Send email via Resend
async function sendEmailViaResend(to, subject, html, text, fromName) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${fromName} <onboarding@resend.dev>`,
      to: [to],
      subject: subject,
      html: html,
      text: text
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Failed to send email');
  }

  return result;
}

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

    // Get coach data for branding
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('full_name, business_name, logo_url, brand_color, email')
      .eq('id', coachId)
      .single();

    if (coachError) {
      console.warn('Could not fetch coach data:', coachError.message);
    }

    const coachName = coach?.full_name || 'Your Coach';
    const businessName = coach?.business_name || coachName;
    const logoUrl = coach?.logo_url || null;
    const brandColor = coach?.brand_color || '#7c3aed';

    // Generate a random password (client will reset it via email)
    const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + 'A1!';

    let authUser = null;

    // Try to create the user first
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: client.email,
      password: randomPassword,
      email_confirm: true
    });

    if (authError) {
      console.log('Create user error:', authError.message);

      // If user already exists, try to find them
      if (authError.message.includes('already') || authError.message.includes('exists') || authError.message.includes('registered')) {
        console.log('User may already exist, searching...');

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

          if (usersPage.users.length < perPage) {
            break;
          }

          page++;
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

    // Generate password reset link using Supabase admin
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: client.email,
      options: {
        redirectTo: `${SITE_URL}/client-reset-password.html`
      }
    });

    if (linkError) {
      console.error('Error generating reset link:', linkError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to generate invitation link',
          details: linkError.message
        })
      };
    }

    // The link from generateLink needs to be properly formed
    // It returns properties that we need to construct the full URL
    const resetLink = linkData?.properties?.action_link ||
                      `${SITE_URL}/client-reset-password.html#access_token=${linkData?.properties?.hashed_token}`;

    console.log('Generated reset link for:', client.email);

    // Send custom branded email via Resend
    if (RESEND_API_KEY) {
      try {
        const emailData = {
          clientName: client.client_name,
          coachName: coachName,
          businessName: businessName,
          logoUrl: logoUrl,
          brandColor: brandColor,
          resetLink: resetLink
        };

        const emailHtml = generateInviteEmailHTML(emailData);
        const emailText = generateInviteEmailText(emailData);

        await sendEmailViaResend(
          client.email,
          `${businessName} - You're Invited!`,
          emailHtml,
          emailText,
          businessName
        );

        console.log('Custom invitation email sent to:', client.email);
      } catch (emailError) {
        console.error('Error sending custom email:', emailError);
        // Fall back to Supabase email if Resend fails
        console.log('Falling back to Supabase email...');
        await supabase.auth.resetPasswordForEmail(client.email, {
          redirectTo: `${SITE_URL}/client-reset-password.html`
        });
      }
    } else {
      // No Resend API key, use Supabase default email
      console.log('No Resend API key, using Supabase email...');
      await supabase.auth.resetPasswordForEmail(client.email, {
        redirectTo: `${SITE_URL}/client-reset-password.html`
      });
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
        message: 'Client invited successfully. Custom invitation email sent.'
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
