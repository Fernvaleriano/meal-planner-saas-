/**
 * Member-initiated password reset with COACH BRANDING.
 *
 * The app's "Forgot your password?" page used to call Supabase's own
 * resetPasswordForEmail, which sends the platform's generic template —
 * so a Huracan Fitness member got a Ziquecoach email. This function
 * replaces that: it looks up which coach the email belongs to, generates
 * the same recovery link, and sends it through our email service dressed
 * in the coach's branding (same template family as the coach-triggered
 * send-client-password-reset).
 *
 * The reset link lands on set-password.html?coachId=<id>, which brands
 * that page and routes to the coach's branded login afterwards.
 *
 * Public endpoint (no auth): the response is ALWAYS {success:true} for a
 * well-formed request, whether or not the email exists — no account
 * enumeration. Unknown emails send nothing.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_URL = process.env.URL || 'https://ziquecoach.com';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ok = () => ({ statusCode: 200, headers, body: JSON.stringify({ success: true }) });

function isEmail(v) {
    return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { email: rawEmail } = JSON.parse(event.body || '{}');
        const email = (rawEmail || '').trim().toLowerCase();
        if (!isEmail(email)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter a valid email.' }) };
        }
        if (!SUPABASE_SERVICE_KEY) {
            console.error('request-password-reset: missing service key');
            return ok(); // never reveal internals to an unauthenticated caller
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Which coach does this member belong to? (Newest portal-enabled
        // client row wins if the same email exists under several coaches.)
        const { data: clients } = await supabase
            .from('clients')
            .select('client_name, email, coach_id, user_id, created_at')
            .ilike('email', email)
            .not('user_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);
        const client = clients && clients[0];

        // Coach branding (only branded tiers get the white-label email —
        // same gate as every other branded surface).
        let coach = null;
        if (client?.coach_id) {
            const { data } = await supabase
                .from('coaches')
                .select('id, name, full_name, email, subscription_tier, brand_name, brand_app_name, brand_primary_color, brand_logo_url, brand_email_logo_url, brand_email_footer')
                .eq('id', client.coach_id)
                .single();
            coach = data || null;
        }

        const hasBranding = ['professional', 'branded'].includes(coach?.subscription_tier);
        const primaryColor = (hasBranding && coach?.brand_primary_color) || '#2cb5a5';
        const brandName = (hasBranding && (coach?.brand_app_name || coach?.brand_name)) || 'Ziquecoach';
        const footerText = (hasBranding && coach?.brand_email_footer) || brandName;
        const logoUrl = hasBranding ? (coach?.brand_email_logo_url || coach?.brand_logo_url) : null;
        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${brandName}" style="max-width: 150px; height: auto; margin-bottom: 12px;">`
            : '';

        // The reset page brands itself + routes to the branded login via this.
        const redirectUrl = coach?.id
            ? `${APP_URL}/set-password.html?coachId=${coach.id}`
            : `${APP_URL}/set-password.html`;

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: redirectUrl }
        });

        const resetLink = linkData?.properties?.action_link;
        if (linkError || !resetLink) {
            // Most likely: no auth account with this email. Send nothing,
            // report success — indistinguishable from the real thing.
            if (linkError) console.warn('request-password-reset generateLink:', linkError.message);
            return ok();
        }

        const firstName = client?.client_name || 'there';
        const subject = `Reset Your Password - ${brandName}`;

        const textBody = `Hi ${firstName},

We received a request to reset the password for your ${brandName} account.

To choose a new password, click the link below:
${resetLink}

This link will expire in 24 hours.

If you did not request this reset, you can safely ignore this email — your password will stay the same.

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
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Choose a new password for your account</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${firstName}</strong>,</p>

        <p style="margin-bottom: 20px; font-size: 16px;">We received a request to reset the password for your <strong>${brandName}</strong> account.</p>

        <div style="text-align: center; margin: 35px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px;">Reset Password</a>
        </div>

        <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px;">This link will expire in 24 hours</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

        <p style="color: #64748b; font-size: 14px;">If you did not request this reset, you can safely ignore this email — your password will stay the same.</p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">${footerText}</p>
    </div>
</body>
</html>`;

        const emailResult = await sendEmail({
            to: email,
            subject,
            text: textBody,
            html: htmlBody,
            fromName: brandName
        });

        if (!emailResult.success) {
            console.error('request-password-reset send failed:', emailResult.error);
            // Surface a real failure so the app can fall back to Supabase's
            // built-in reset email (unbranded beats no email at all).
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email delivery failed' }) };
        }

        return ok();
    } catch (error) {
        console.error('request-password-reset error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
