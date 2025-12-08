/**
 * Send Test Branding Email
 *
 * Sends a test email to the coach with their current branding applied.
 * Allows coaches to preview how their branded emails will look.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Default branding
const DEFAULT_BRAND_NAME = 'Zique Fitness Nutrition';
const DEFAULT_PRIMARY_COLOR = '#0d9488';
const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

// Email providers
async function sendEmail({ to, subject, text, html, fromEmail, fromName }) {
    const emailFrom = fromEmail || process.env.EMAIL_FROM || 'noreply@ziquefitness.com';
    const emailFromName = fromName || process.env.EMAIL_FROM_NAME || 'Zique Fitness Nutrition';

    if (process.env.RESEND_API_KEY) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: `${emailFromName} <${emailFrom}>`,
                    to: [to],
                    subject,
                    text,
                    html
                })
            });

            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.message };
            }
            return { success: true, messageId: data.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Dev mode fallback
    console.log('=== TEST EMAIL (Dev Mode) ===');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html?.substring(0, 500) + '...');
    return { success: true, messageId: 'dev-' + Date.now() };
}

// Generate branded email HTML
function generateBrandedEmailHtml(coach) {
    const brandName = coach.brand_name || DEFAULT_BRAND_NAME;
    const primaryColor = coach.brand_primary_color || DEFAULT_PRIMARY_COLOR;
    const logoUrl = coach.brand_email_logo_url || coach.brand_logo_url;
    const footer = coach.brand_email_footer || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`;

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${brandName}" style="max-width: 150px; height: auto; margin-bottom: 8px;">`
        : `<h2 style="color: ${primaryColor}; margin: 0 0 8px 0; font-size: 24px;">${brandName}</h2>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Email - ${brandName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px; text-align: center; background: linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}05 100%); border-bottom: 1px solid #e5e7eb;">
                            ${logoHtml}
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px 32px;">
                            <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #111827;">
                                🎨 Your Branding Test Email
                            </h1>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                                This is a test email showing how your branded emails will appear to clients.
                                The colors, logo, and footer below reflect your current branding settings.
                            </p>

                            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                                <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
                                    Your Branding Summary
                                </h3>
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Brand Name:</td>
                                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${brandName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Primary Color:</td>
                                        <td style="padding: 8px 0;">
                                            <span style="display: inline-block; width: 16px; height: 16px; background: ${primaryColor}; border-radius: 4px; vertical-align: middle; margin-right: 8px;"></span>
                                            <span style="color: #111827; font-size: 14px; font-family: monospace;">${primaryColor}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Logo:</td>
                                        <td style="padding: 8px 0; color: #111827; font-size: 14px;">${logoUrl ? '✅ Custom logo set' : '⚪ Using default'}</td>
                                    </tr>
                                </table>
                            </div>

                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                                Below is an example of how a button will appear in your client emails:
                            </p>

                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 8px 0;">
                                        <a href="${APP_URL}" style="display: inline-block; padding: 14px 32px; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                                            Example Button
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                                Happy with how it looks? Your clients will see this branding on all their emails, including invitations and check-in reminders.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                                ${footer}
                            </p>
                        </td>
                    </tr>
                </table>

                <!-- Sub-footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
                    <tr>
                        <td style="padding: 24px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                This is a test email from your brand settings page.<br>
                                Your clients won't receive this email.
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

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    try {
        // Verify authentication
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Authentication required' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Verify user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid token' })
            };
        }

        // Get coach data with branding
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select(`
                id,
                email,
                name,
                subscription_tier,
                brand_name,
                brand_primary_color,
                brand_secondary_color,
                brand_accent_color,
                brand_logo_url,
                brand_email_logo_url,
                brand_email_footer,
                white_label_enabled,
                email_from,
                email_from_name,
                email_from_verified
            `)
            .eq('id', user.id)
            .single();

        if (coachError || !coach) {
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Coach not found' })
            };
        }

        // Check subscription tier
        const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
        if (!hasBrandingAccess) {
            return {
                statusCode: 403,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Branding features require Professional tier' })
            };
        }

        // Generate email HTML
        const html = generateBrandedEmailHtml(coach);
        const brandName = coach.brand_name || DEFAULT_BRAND_NAME;

        // Determine from address (use white-label if enabled)
        const hasWhiteLabel = coach.white_label_enabled && coach.email_from_verified;
        const fromEmail = hasWhiteLabel ? coach.email_from : undefined;
        const fromName = hasWhiteLabel ? coach.email_from_name : brandName;

        // Send email
        const result = await sendEmail({
            to: user.email,
            subject: `[TEST] ${brandName} - Branding Preview`,
            text: `This is a test email showing your branding settings for ${brandName}.`,
            html,
            fromEmail,
            fromName
        });

        if (!result.success) {
            throw new Error(result.error || 'Failed to send email');
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: `Test email sent to ${user.email}`,
                messageId: result.messageId
            })
        };

    } catch (error) {
        console.error('Error sending test email:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to send test email' })
        };
    }
};
