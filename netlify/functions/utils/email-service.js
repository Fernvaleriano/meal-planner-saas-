/**
 * Email Service for Check-in Reminders
 *
 * Supports multiple email providers via environment configuration:
 * - Resend (recommended): Set RESEND_API_KEY
 * - SendGrid: Set SENDGRID_API_KEY
 * - Mailgun: Set MAILGUN_API_KEY and MAILGUN_DOMAIN
 *
 * Falls back to logging if no provider is configured (dev mode)
 *
 * White-label support: Professional tier coaches can send from their own domain
 */

// Note: Using global fetch (available in Node 18+, which is set in netlify.toml)

// Default email settings (fallback when coach doesn't have white-label)
const DEFAULT_EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ziquefitness.com';
const DEFAULT_EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Zique Fitness Nutrition';
const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

/**
 * Send an email using the configured provider
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 * @param {string} options.fromEmail - Custom from email (optional, for white-label)
 * @param {string} options.fromName - Custom from name (optional, for white-label)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, subject, text, html, fromEmail, fromName }) {
    // Use custom from address if provided (white-label), otherwise use defaults
    const emailFrom = fromEmail || DEFAULT_EMAIL_FROM;
    const emailFromName = fromName || DEFAULT_EMAIL_FROM_NAME;

    // Validate inputs
    if (!to || !subject || !text) {
        return { success: false, error: 'Missing required fields: to, subject, text' };
    }

    // Try providers in order of preference
    if (process.env.RESEND_API_KEY) {
        return sendWithResend({ to, subject, text, html, emailFrom, emailFromName });
    }

    if (process.env.SENDGRID_API_KEY) {
        return sendWithSendGrid({ to, subject, text, html, emailFrom, emailFromName });
    }

    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
        return sendWithMailgun({ to, subject, text, html, emailFrom, emailFromName });
    }

    // Development fallback - just log the email
    console.log('=== EMAIL (Dev Mode - No provider configured) ===');
    console.log('From:', `${emailFromName} <${emailFrom}>`);
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Body:', text.substring(0, 200) + '...');
    console.log('================================================');

    return {
        success: true,
        messageId: `dev-${Date.now()}`,
        note: 'Email logged (no provider configured)'
    };
}

/**
 * Send email using Resend
 */
async function sendWithResend({ to, subject, text, html, emailFrom, emailFromName }) {
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
                html: html || text.replace(/\n/g, '<br>')
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Resend error:', data);
            return { success: false, error: data.message || 'Resend API error' };
        }

        return { success: true, messageId: data.id };
    } catch (error) {
        console.error('Resend send failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email using SendGrid
 */
async function sendWithSendGrid({ to, subject, text, html, emailFrom, emailFromName }) {
    try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from: { email: emailFrom, name: emailFromName },
                subject,
                content: [
                    { type: 'text/plain', value: text },
                    { type: 'text/html', value: html || text.replace(/\n/g, '<br>') }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('SendGrid error:', errorText);
            return { success: false, error: errorText };
        }

        // SendGrid returns 202 with no body on success
        const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;
        return { success: true, messageId };
    } catch (error) {
        console.error('SendGrid send failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email using Mailgun
 */
async function sendWithMailgun({ to, subject, text, html, emailFrom, emailFromName }) {
    try {
        const domain = process.env.MAILGUN_DOMAIN;
        const formData = new URLSearchParams();
        formData.append('from', `${emailFromName} <${emailFrom}>`);
        formData.append('to', to);
        formData.append('subject', subject);
        formData.append('text', text);
        if (html) {
            formData.append('html', html);
        }

        const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Mailgun error:', data);
            return { success: false, error: data.message || 'Mailgun API error' };
        }

        return { success: true, messageId: data.id };
    } catch (error) {
        console.error('Mailgun send failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate check-in reminder email content
 * @param {Object} options
 * @param {string} options.clientName - Client's name
 * @param {string} options.clientEmail - Client's email
 * @param {string} options.coachName - Coach's name (optional)
 * @param {number} options.clientId - Client ID for building check-in link
 * @param {string} options.customSubject - Custom email subject (optional)
 * @param {string} options.customMessage - Custom email message (optional)
 * @param {boolean} options.isFollowup - Is this a follow-up reminder?
 * @param {boolean} options.whiteLabel - Is this a white-label email? (no Zique branding)
 * @returns {Object} - { subject, text, html }
 */
function generateReminderEmail({
    clientName,
    clientEmail,
    coachName = 'Your Coach',
    clientId,
    customSubject,
    customMessage,
    isFollowup = false,
    whiteLabel = false
}) {
    const checkinLink = `${APP_URL}/client-dashboard.html`;

    // Default subject
    let subject = isFollowup
        ? `Reminder: Don't forget your weekly check-in!`
        : `Time for your weekly check-in!`;

    // Use custom subject if provided
    if (customSubject) {
        subject = customSubject
            .replace('{client_name}', clientName)
            .replace('{coach_name}', coachName);

        if (isFollowup && !subject.toLowerCase().includes('reminder')) {
            subject = `Reminder: ${subject}`;
        }
    }

    // Footer text - different for white-label
    const footerText = whiteLabel ? coachName : 'Zique Fitness Nutrition';
    const footerHtml = whiteLabel
        ? `<p>${coachName}</p>`
        : `<p>Zique Fitness Nutrition</p><p><a href="${APP_URL}" style="color: #0d9488;">Visit Dashboard</a></p>`;

    // Default message
    let textBody = `Hi ${clientName},

${isFollowup ? 'This is a friendly follow-up reminder - ' : ''}It's time for your weekly check-in! Your coach is looking forward to hearing about your progress.

Your check-in helps track your journey and allows your coach to provide personalized guidance.

Log in to submit your check-in:
${checkinLink}

What to include in your check-in:
- Your energy and sleep quality this week
- How well you followed your meal plan
- Any wins or challenges you experienced
- Questions for your coach

Best,
${coachName}

---
${footerText}`;

    // Use custom message if provided
    if (customMessage) {
        textBody = customMessage
            .replace(/{client_name}/g, clientName)
            .replace(/{coach_name}/g, coachName)
            .replace(/{checkin_link}/g, checkinLink);
    }

    // Generate HTML version
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Weekly Check-in ${isFollowup ? 'Reminder' : 'Time'}</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${clientName}</strong>,</p>

        ${isFollowup ? '<p style="color: #d97706; font-weight: 500; margin-bottom: 20px;">This is a friendly follow-up reminder!</p>' : ''}

        <p style="margin-bottom: 20px;">It's time for your weekly check-in! Your coach is looking forward to hearing about your progress.</p>

        <p style="margin-bottom: 20px;">Your check-in helps track your journey and allows your coach to provide personalized guidance.</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${checkinLink}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Submit Your Check-in</a>
        </div>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="font-weight: 600; margin: 0 0 10px 0; color: #1e293b;">What to include:</p>
            <ul style="margin: 0; padding-left: 20px; color: #64748b;">
                <li>Your energy and sleep quality this week</li>
                <li>How well you followed your meal plan</li>
                <li>Any wins or challenges you experienced</li>
                <li>Questions for your coach</li>
            </ul>
        </div>

        <p style="margin-top: 30px; color: #64748b;">
            Best,<br>
            <strong>${coachName}</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        ${footerHtml}
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send a check-in reminder to a client
 * @param {Object} options
 * @param {Object} options.client - Client object from database
 * @param {Object} options.coach - Coach object from database (optional)
 * @param {Object} options.settings - Reminder settings (optional)
 * @param {boolean} options.isFollowup - Is this a follow-up reminder?
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendCheckinReminder({
    client,
    coach,
    settings = {},
    isFollowup = false
}) {
    if (!client || !client.email) {
        return { success: false, error: 'Client email not available' };
    }

    // Check if coach has white-label email enabled
    const hasWhiteLabel = coach?.white_label_enabled && coach?.email_from_verified;

    const emailContent = generateReminderEmail({
        clientName: client.client_name || 'there',
        clientEmail: client.email,
        coachName: coach?.full_name || coach?.email || 'Your Coach',
        clientId: client.id,
        customSubject: settings.email_subject,
        customMessage: settings.email_message,
        isFollowup,
        whiteLabel: hasWhiteLabel
    });

    return sendEmail({
        to: client.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        fromEmail: hasWhiteLabel ? coach.email_from : undefined,
        fromName: hasWhiteLabel ? coach.email_from_name : undefined
    });
}

/**
 * Generate client invitation email content
 * @param {Object} options
 * @param {string} options.clientName - Client's name
 * @param {string} options.clientEmail - Client's email
 * @param {string} options.coachName - Coach's name
 * @param {string} options.resetLink - Password reset link
 * @param {boolean} options.whiteLabel - Is this a white-label email?
 * @returns {Object} - { subject, text, html }
 */
function generateInvitationEmail({
    clientName,
    clientEmail,
    coachName = 'Your Coach',
    resetLink,
    whiteLabel = false
}) {
    const subject = whiteLabel
        ? `${coachName} has invited you to join`
        : `${coachName} has invited you to Zique Fitness Nutrition`;

    const footerText = whiteLabel ? coachName : 'Zique Fitness Nutrition';
    const welcomeTitle = whiteLabel ? `Welcome!` : `Welcome to Zique Fitness`;
    const welcomeSubtitle = 'Your nutrition coaching journey starts here';

    const textBody = `Hi ${clientName},

Great news! ${coachName} has invited you to join ${whiteLabel ? 'their' : 'Zique Fitness Nutrition -'} your personal nutrition coaching portal.

With your new account, you'll be able to:
- View your personalized meal plans
- Track your daily food intake
- Submit weekly check-ins
- Message your coach directly
- Track your progress over time

To get started, set up your password using the link below:
${resetLink}

This link will expire in 24 hours.

If you have any questions, reach out to your coach directly.

Welcome aboard!

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
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">${welcomeTitle}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${welcomeSubtitle}</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${clientName}</strong>,</p>

        <p style="margin-bottom: 20px; font-size: 16px;">Great news! <strong>${coachName}</strong> has invited you to join your personal nutrition coaching portal.</p>

        <div style="background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%); padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0d9488;">
            <p style="font-weight: 600; margin: 0 0 12px 0; color: #0f766e; font-size: 16px;">With your new account, you'll be able to:</p>
            <ul style="margin: 0; padding-left: 20px; color: #334155;">
                <li style="margin-bottom: 8px;">View your personalized meal plans</li>
                <li style="margin-bottom: 8px;">Track your daily food intake</li>
                <li style="margin-bottom: 8px;">Submit weekly check-ins</li>
                <li style="margin-bottom: 8px;">Message your coach directly</li>
                <li style="margin-bottom: 0;">Track your progress over time</li>
            </ul>
        </div>

        <div style="text-align: center; margin: 35px 0;">
            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">Set Up Your Password</a>
        </div>

        <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px;">This link will expire in 24 hours</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

        <p style="color: #64748b; font-size: 14px;">If you have any questions, reach out to your coach directly.</p>

        <p style="margin-top: 25px; color: #334155;">
            Welcome aboard!<br>
            <strong>${coachName}</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">${footerText}</p>
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send an invitation email to a new client
 * @param {Object} options
 * @param {Object} options.client - Client object from database
 * @param {Object} options.coach - Coach object from database
 * @param {string} options.resetLink - Password reset link
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendInvitationEmail({
    client,
    coach,
    resetLink
}) {
    if (!client || !client.email) {
        return { success: false, error: 'Client email not available' };
    }

    if (!resetLink) {
        return { success: false, error: 'Reset link is required' };
    }

    // Check if coach has white-label email enabled
    const hasWhiteLabel = coach?.white_label_enabled && coach?.email_from_verified;

    const emailContent = generateInvitationEmail({
        clientName: client.client_name || 'there',
        clientEmail: client.email,
        coachName: coach?.full_name || coach?.email || 'Your Coach',
        resetLink,
        whiteLabel: hasWhiteLabel
    });

    return sendEmail({
        to: client.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        fromEmail: hasWhiteLabel ? coach.email_from : undefined,
        fromName: hasWhiteLabel ? coach.email_from_name : undefined
    });
}

/**
 * Generate subscription cancellation email content
 * @param {Object} options
 * @param {string} options.coachName - Coach's name
 * @param {string} options.coachEmail - Coach's email
 * @param {Date} options.cancelDate - When the subscription will end
 * @param {string} options.tier - Current subscription tier
 * @returns {Object} - { subject, text, html }
 */
function generateCancellationEmail({
    coachName,
    coachEmail,
    cancelDate,
    tier = 'starter'
}) {
    const subject = 'Your subscription cancellation is confirmed';
    const formattedDate = cancelDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const textBody = `Hi ${coachName},

We've received your request to cancel your subscription.

Your subscription will remain active until ${formattedDate}. You'll continue to have full access to all your ${tier} features until then.

Here's what happens next:
- Your account will remain fully functional until ${formattedDate}
- Your clients will still be able to access their portals
- All your data (clients, meal plans, recipes) will be preserved
- After ${formattedDate}, your account will be downgraded

If you change your mind, you can reactivate your subscription anytime before ${formattedDate} from your account settings.

We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you.

Thank you for being a part of Zique Fitness Nutrition.

Best,
The Zique Team

---
Zique Fitness Nutrition
${APP_URL}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Cancellation Confirmed</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">We've received your request to cancel your subscription.</p>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-weight: 600; color: #92400e;">Your subscription will remain active until:</p>
            <p style="margin: 8px 0 0 0; font-size: 1.25rem; color: #78350f;">${formattedDate}</p>
        </div>

        <p style="margin-bottom: 15px;"><strong>Here's what happens next:</strong></p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #475569;">
            <li style="margin-bottom: 8px;">Your account will remain fully functional until the end date</li>
            <li style="margin-bottom: 8px;">Your clients will still be able to access their portals</li>
            <li style="margin-bottom: 8px;">All your data (clients, meal plans, recipes) will be preserved</li>
            <li style="margin-bottom: 0;">After the end date, your account will be downgraded</li>
        </ul>

        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #bbf7d0;">
            <p style="margin: 0; color: #166534;"><strong>Changed your mind?</strong></p>
            <p style="margin: 8px 0 0 0; color: #15803d;">You can reactivate your subscription anytime before ${formattedDate} from your account settings.</p>
        </div>

        <p style="margin-bottom: 20px; color: #64748b;">We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you.</p>

        <p style="margin-top: 30px; color: #64748b;">
            Thank you for being a part of Zique Fitness Nutrition.<br><br>
            Best,<br>
            <strong>The Zique Team</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Zique Fitness Nutrition</p>
        <p style="margin: 8px 0 0 0;"><a href="${APP_URL}" style="color: #64748b;">Visit Dashboard</a></p>
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send a cancellation confirmation email to a coach
 * @param {Object} options
 * @param {Object} options.coach - Coach object from database
 * @param {Date} options.cancelDate - When the subscription will end
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendCancellationEmail({
    coach,
    cancelDate
}) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    const emailContent = generateCancellationEmail({
        coachName: coach.name || coach.email.split('@')[0],
        coachEmail: coach.email,
        cancelDate: cancelDate instanceof Date ? cancelDate : new Date(cancelDate),
        tier: coach.subscription_tier || 'starter'
    });

    return sendEmail({
        to: coach.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

module.exports = {
    sendEmail,
    sendCheckinReminder,
    generateReminderEmail,
    sendInvitationEmail,
    generateInvitationEmail,
    sendCancellationEmail,
    generateCancellationEmail
};
