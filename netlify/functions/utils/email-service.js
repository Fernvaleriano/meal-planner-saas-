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
    <div style="background-color: #0d9488; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Weekly Check-in ${isFollowup ? 'Reminder' : 'Time'}</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${clientName}</strong>,</p>

        ${isFollowup ? '<p style="color: #d97706; font-weight: 500; margin-bottom: 20px;">This is a friendly follow-up reminder!</p>' : ''}

        <p style="margin-bottom: 20px;">It's time for your weekly check-in! Your coach is looking forward to hearing about your progress.</p>

        <p style="margin-bottom: 20px;">Your check-in helps track your journey and allows your coach to provide personalized guidance.</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${checkinLink}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Submit Your Check-in</a>
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
    <div style="background-color: #0d9488; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${welcomeTitle}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${welcomeSubtitle}</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${clientName}</strong>,</p>

        <p style="margin-bottom: 20px; font-size: 16px;">Great news! <strong>${coachName}</strong> has invited you to join your personal nutrition coaching portal.</p>

        <div style="background-color: #f0fdfa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0d9488;">
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
            <a href="${resetLink}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">Set Up Your Password</a>
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
 * Generate intake form invitation email content
 * @param {Object} options
 * @param {string} options.clientName - Client's name (may be empty)
 * @param {string} options.clientEmail - Client's email
 * @param {string} options.coachName - Coach's name
 * @param {string} options.intakeFormUrl - URL to the intake form
 * @param {boolean} options.whiteLabel - Is this a white-label email?
 * @returns {Object} - { subject, text, html }
 */
function generateIntakeInvitationEmail({
    clientName,
    clientEmail,
    coachName = 'Your Coach',
    intakeFormUrl,
    whiteLabel = false
}) {
    const displayName = clientName || 'there';

    const subject = whiteLabel
        ? `${coachName} has invited you to join`
        : `${coachName} has invited you to Zique Fitness Nutrition`;

    const footerText = whiteLabel ? coachName : 'Zique Fitness Nutrition';
    const welcomeTitle = whiteLabel ? `Welcome!` : `Welcome to Zique Fitness`;
    const welcomeSubtitle = 'Your nutrition coaching journey starts here';

    const textBody = `Hi ${displayName},

Great news! ${coachName} has invited you to join ${whiteLabel ? 'their' : 'Zique Fitness Nutrition -'} your personal nutrition coaching portal.

To get started, please complete your profile by clicking the link below. This will help your coach create a personalized meal plan just for you.

Complete Your Profile:
${intakeFormUrl}

You'll be asked to provide:
- Basic information (name, contact details)
- Physical stats (weight, height, activity level)
- Your nutrition goals
- Food preferences and any allergies
- A password for your account

This link will expire in 7 days.

Once you've completed your profile, you'll have access to:
- Personalized meal plans
- Daily food tracking
- Weekly check-ins with your coach
- Progress tracking

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
    <div style="background-color: #0d9488; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${welcomeTitle}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${welcomeSubtitle}</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Hi <strong>${displayName}</strong>,</p>

        <p style="margin-bottom: 20px; font-size: 16px;">Great news! <strong>${coachName}</strong> has invited you to join your personal nutrition coaching portal.</p>

        <p style="margin-bottom: 20px;">To get started, please complete your profile. This will help your coach create a personalized meal plan just for you.</p>

        <div style="text-align: center; margin: 35px 0;">
            <a href="${intakeFormUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);">Complete Your Profile</a>
        </div>

        <div style="background-color: #f0fdfa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0d9488;">
            <p style="font-weight: 600; margin: 0 0 12px 0; color: #0f766e; font-size: 16px;">You'll be asked to provide:</p>
            <ul style="margin: 0; padding-left: 20px; color: #334155;">
                <li style="margin-bottom: 8px;">Basic information (name, contact details)</li>
                <li style="margin-bottom: 8px;">Physical stats (weight, height, activity level)</li>
                <li style="margin-bottom: 8px;">Your nutrition goals</li>
                <li style="margin-bottom: 8px;">Food preferences and any allergies</li>
                <li style="margin-bottom: 0;">A password for your account</li>
            </ul>
        </div>

        <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px;">This link will expire in 7 days</p>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="font-weight: 600; margin: 0 0 12px 0; color: #334155;">Once you've completed your profile, you'll have access to:</p>
            <ul style="margin: 0; padding-left: 20px; color: #64748b;">
                <li style="margin-bottom: 6px;">Personalized meal plans</li>
                <li style="margin-bottom: 6px;">Daily food tracking</li>
                <li style="margin-bottom: 6px;">Weekly check-ins with your coach</li>
                <li style="margin-bottom: 0;">Progress tracking</li>
            </ul>
        </div>

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
 * Send an intake form invitation email to a new client
 * @param {Object} options
 * @param {Object} options.client - Client object from database
 * @param {Object} options.coach - Coach object from database
 * @param {string} options.intakeFormUrl - URL to the intake form with token
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendIntakeInvitationEmail({
    client,
    coach,
    intakeFormUrl
}) {
    if (!client || !client.email) {
        return { success: false, error: 'Client email not available' };
    }

    if (!intakeFormUrl) {
        return { success: false, error: 'Intake form URL is required' };
    }

    // Check if coach has white-label email enabled
    const hasWhiteLabel = coach?.white_label_enabled && coach?.email_from_verified;

    const emailContent = generateIntakeInvitationEmail({
        clientName: client.client_name || '',
        clientEmail: client.email,
        coachName: coach?.full_name || coach?.email || 'Your Coach',
        intakeFormUrl,
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
 * @param {boolean} options.immediatelyCanceled - If true, trial was canceled immediately
 * @returns {Object} - { subject, text, html }
 */
function generateCancellationEmail({
    coachName,
    coachEmail,
    cancelDate,
    tier = 'starter',
    immediatelyCanceled = false
}) {
    // Different email for trial cancellation vs paid subscription cancellation
    if (immediatelyCanceled) {
        const subject = 'Your trial has been canceled';

        const textBody = `Hi ${coachName},

We've received your request to cancel your free trial.

Your trial has been canceled and your access to premium features has ended immediately.

Here's what this means:
- Your account has been downgraded to the free tier
- Your clients will no longer have access to their portals
- All your data (clients, meal plans, recipes) is still preserved
- You can resubscribe anytime to regain full access

Ready to come back? You can reactivate your subscription anytime from your account settings or the pricing page.

We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you.

Thank you for trying Zique Fitness Nutrition.

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
    <div style="background-color: #64748b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Trial Canceled</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">We've received your request to cancel your free trial.</p>

        <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ef4444;">
            <p style="margin: 0; font-weight: 600; color: #991b1b;">Your trial has ended</p>
            <p style="margin: 8px 0 0 0; color: #b91c1c;">Access to premium features has been removed immediately.</p>
        </div>

        <p style="margin-bottom: 15px;"><strong>Here's what this means:</strong></p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #475569;">
            <li style="margin-bottom: 8px;">Your account has been downgraded</li>
            <li style="margin-bottom: 8px;">Your clients will no longer have access to their portals</li>
            <li style="margin-bottom: 8px;">All your data (clients, meal plans, recipes) is still preserved</li>
            <li style="margin-bottom: 0;">You can resubscribe anytime to regain full access</li>
        </ul>

        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #bbf7d0;">
            <p style="margin: 0; color: #166534;"><strong>Ready to come back?</strong></p>
            <p style="margin: 8px 0 15px 0; color: #15803d;">You can reactivate your subscription anytime to regain full access.</p>
            <a href="${APP_URL}/pricing.html" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">View Plans</a>
        </div>

        <p style="margin-bottom: 20px; color: #64748b;">We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you.</p>

        <p style="margin-top: 30px; color: #64748b;">
            Thank you for trying Zique Fitness Nutrition.<br><br>
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

    // Standard cancellation email for paid subscriptions (keep access until end of period)
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
    <div style="background-color: #64748b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Cancellation Confirmed</h1>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">We've received your request to cancel your subscription.</p>

        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
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
 * @param {boolean} options.immediatelyCanceled - If true, trial was canceled immediately
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendCancellationEmail({
    coach,
    cancelDate,
    immediatelyCanceled = false
}) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    const emailContent = generateCancellationEmail({
        coachName: coach.name || coach.email.split('@')[0],
        coachEmail: coach.email,
        cancelDate: cancelDate instanceof Date ? cancelDate : new Date(cancelDate),
        tier: coach.subscription_tier || 'starter',
        immediatelyCanceled
    });

    return sendEmail({
        to: coach.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

/**
 * Generate reactivation confirmation email content
 */
function generateReactivationEmail({ coachName, plan = 'starter' }) {
    const subject = 'Welcome back! Your subscription is active';

    const tierNames = {
        'starter': 'Starter',
        'growth': 'Growth',
        'professional': 'Professional',
        'basic': 'Starter',
        'branded': 'Professional'
    };
    const planName = tierNames[plan] || 'Starter';

    const textBody = `Hi ${coachName},

Welcome back! Your ${planName} subscription has been reactivated successfully.

You now have full access to all features again:
- Manage your clients and meal plans
- Use the AI meal planner
- Send check-in reminders
- Access all your saved recipes and data

Everything is right where you left it. Your clients can continue accessing their portals immediately.

Log in to your dashboard:
${APP_URL}/dashboard.html

Thank you for continuing with Zique Fitness Nutrition!

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
    <div style="background-color: #0d9488; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome Back!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your subscription is active</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">Your <strong>${planName}</strong> subscription has been reactivated successfully!</p>

        <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-weight: 600; color: #065f46;">You now have full access to:</p>
            <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #047857;">
                <li>Manage clients and meal plans</li>
                <li>AI meal planner</li>
                <li>Check-in reminders</li>
                <li>All your saved recipes and data</li>
            </ul>
        </div>

        <p style="margin-bottom: 25px;">Everything is right where you left it. Your clients can continue accessing their portals immediately.</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/dashboard.html" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Go to Dashboard</a>
        </div>

        <p style="margin-top: 30px; color: #64748b;">
            Thank you for continuing with Zique Fitness Nutrition!<br><br>
            Best,<br>
            <strong>The Zique Team</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Zique Fitness Nutrition</p>
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send reactivation confirmation email to coach
 */
async function sendReactivationEmail({ coach, plan }) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    const emailContent = generateReactivationEmail({
        coachName: coach.name || coach.email.split('@')[0],
        plan: plan
    });

    return sendEmail({
        to: coach.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

/**
 * Generate payment failed email content
 */
function generatePaymentFailedEmail({ coachName }) {
    const subject = 'Action required: Your payment failed';

    const textBody = `Hi ${coachName},

We tried to process your subscription payment, but it was unsuccessful.

Don't worry - your account is still active for now, but please update your payment method to avoid any interruption to your service.

Update your payment method here:
${APP_URL}/billing.html

Common reasons for failed payments:
- Expired credit card
- Insufficient funds
- Card issuer declined the transaction

If you need help, just reply to this email.

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
    <div style="background-color: #f59e0b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Failed</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Action required</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">We tried to process your subscription payment, but it was unsuccessful.</p>

        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-weight: 600; color: #92400e;">Your account is still active for now</p>
            <p style="margin: 8px 0 0 0; color: #a16207;">Please update your payment method to avoid any interruption to your service.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/billing.html" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Update Payment Method</a>
        </div>

        <p style="margin-bottom: 15px;"><strong>Common reasons for failed payments:</strong></p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #64748b;">
            <li>Expired credit card</li>
            <li>Insufficient funds</li>
            <li>Card issuer declined the transaction</li>
        </ul>

        <p style="margin-top: 30px; color: #64748b;">
            If you need help, just reply to this email.<br><br>
            Best,<br>
            <strong>The Zique Team</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Zique Fitness Nutrition</p>
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send payment failed email to coach
 */
async function sendPaymentFailedEmail({ coach }) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    const emailContent = generatePaymentFailedEmail({
        coachName: coach.name || coach.email.split('@')[0]
    });

    return sendEmail({
        to: coach.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

/**
 * Generate trial ending soon email content
 */
function generateTrialEndingEmail({ coachName, daysLeft, trialEndDate }) {
    const subject = `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

    const formattedDate = trialEndDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const textBody = `Hi ${coachName},

Just a heads up - your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${formattedDate}).

To continue using Zique Fitness Nutrition without interruption, add your payment method now:
${APP_URL}/billing.html

After your trial ends, you'll need an active subscription to:
- Access your clients and meal plans
- Use the AI meal planner
- Send check-in reminders

All your data will be safely preserved. You can reactivate anytime.

Questions? Just reply to this email.

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
    <div style="background-color: #0d9488; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Trial Ending Soon</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining</p>
    </div>

    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${coachName}</strong>,</p>

        <p style="margin-bottom: 20px;">Just a heads up - your free trial ends on <strong>${formattedDate}</strong>.</p>

        <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; font-weight: 600; color: #1e40af;">Add your payment method now to continue without interruption</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/billing.html" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Add Payment Method</a>
        </div>

        <p style="margin-bottom: 15px; color: #64748b;"><strong>After your trial ends, you'll need an active subscription to:</strong></p>
        <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #64748b;">
            <li>Access your clients and meal plans</li>
            <li>Use the AI meal planner</li>
            <li>Send check-in reminders</li>
        </ul>

        <p style="color: #64748b;">All your data will be safely preserved. You can reactivate anytime.</p>

        <p style="margin-top: 30px; color: #64748b;">
            Questions? Just reply to this email.<br><br>
            Best,<br>
            <strong>The Zique Team</strong>
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Zique Fitness Nutrition</p>
    </div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send trial ending soon email to coach
 */
async function sendTrialEndingEmail({ coach, daysLeft, trialEndDate }) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    const emailContent = generateTrialEndingEmail({
        coachName: coach.name || coach.email.split('@')[0],
        daysLeft,
        trialEndDate: trialEndDate instanceof Date ? trialEndDate : new Date(trialEndDate)
    });

    return sendEmail({
        to: coach.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

/**
 * Send admin notification for new coach signup
 */
async function sendNewCoachNotification({ coach, plan }) {
    const adminEmail = process.env.ADMIN_EMAIL || 'contact@ziquefitness.com';

    const tierNames = {
        'starter': 'Starter ($49/mo)',
        'growth': 'Growth ($99/mo)',
        'professional': 'Professional ($199/mo)',
        'basic': 'Starter ($49/mo)',
        'branded': 'Professional ($199/mo)'
    };
    const planName = tierNames[plan] || plan;

    const subject = `New Coach Signup: ${coach.name || coach.email}`;

    const text = `New coach signed up!

Name: ${coach.name || 'Not provided'}
Email: ${coach.email}
Plan: ${planName}
Date: ${new Date().toLocaleString()}

View in Supabase: https://supabase.com/dashboard
View in Stripe: https://dashboard.stripe.com/customers
`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; padding: 20px;">
    <div style="background-color: #0d9488; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0;">New Coach Signup!</h2>
    </div>
    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <table style="width: 100%;">
            <tr><td style="padding: 8px 0; color: #64748b;">Name:</td><td style="padding: 8px 0;"><strong>${coach.name || 'Not provided'}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0;"><strong>${coach.email}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0;"><strong>${planName}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Date:</td><td style="padding: 8px 0;">${new Date().toLocaleString()}</td></tr>
        </table>
    </div>
</body>
</html>`;

    return sendEmail({ to: adminEmail, subject, text, html });
}

/**
 * Send admin notification for new payment/subscription
 */
async function sendNewPaymentNotification({ coach, plan, amount, isReactivation = false }) {
    const adminEmail = process.env.ADMIN_EMAIL || 'contact@ziquefitness.com';

    const tierNames = {
        'starter': 'Starter',
        'growth': 'Growth',
        'professional': 'Professional',
        'basic': 'Starter',
        'branded': 'Professional'
    };
    const planName = tierNames[plan] || plan;

    const subject = isReactivation
        ? `Reactivation: ${coach.name || coach.email} is back!`
        : `New Payment: ${coach.name || coach.email}`;

    const text = `${isReactivation ? 'Coach reactivated!' : 'New payment received!'}

Coach: ${coach.name || 'Unknown'} (${coach.email})
Plan: ${planName}
${amount ? `Amount: $${amount}` : ''}
Date: ${new Date().toLocaleString()}
`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; padding: 20px;">
    <div style="background: ${isReactivation ? '#10b981' : '#0d9488'}; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0;">${isReactivation ? 'Coach Reactivated!' : 'New Payment!'}</h2>
    </div>
    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <table style="width: 100%;">
            <tr><td style="padding: 8px 0; color: #64748b;">Coach:</td><td style="padding: 8px 0;"><strong>${coach.name || 'Unknown'}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0;">${coach.email}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0;"><strong>${planName}</strong></td></tr>
            ${amount ? `<tr><td style="padding: 8px 0; color: #64748b;">Amount:</td><td style="padding: 8px 0; color: #10b981; font-weight: bold;">$${amount}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #64748b;">Date:</td><td style="padding: 8px 0;">${new Date().toLocaleString()}</td></tr>
        </table>
    </div>
</body>
</html>`;

    return sendEmail({ to: adminEmail, subject, text, html });
}

/**
 * Send admin notification when subscription is canceled
 */
async function sendCancellationNotification({ coach, plan }) {
    const adminEmail = process.env.ADMIN_EMAIL || 'contact@ziquefitness.com';

    const subject = `Cancellation: ${coach.name || coach.email}`;

    const text = `A coach has canceled their subscription.

Coach: ${coach.name || 'Unknown'} (${coach.email})
Plan: ${plan || 'Unknown'}
Date: ${new Date().toLocaleString()}
`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; padding: 20px;">
    <div style="background: #f59e0b; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0;">Subscription Canceled</h2>
    </div>
    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <table style="width: 100%;">
            <tr><td style="padding: 8px 0; color: #64748b;">Coach:</td><td style="padding: 8px 0;"><strong>${coach.name || 'Unknown'}</strong></td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0;">${coach.email}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Plan:</td><td style="padding: 8px 0;">${plan || 'Unknown'}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Date:</td><td style="padding: 8px 0;">${new Date().toLocaleString()}</td></tr>
        </table>
    </div>
</body>
</html>`;

    return sendEmail({ to: adminEmail, subject, text, html });
}

/**
 * Generate welcome email for new coach signups
 */
function generateWelcomeEmail({ coachName, plan = 'starter', resetLink }) {
    const subject = 'Welcome to Zique Fitness Nutrition!';

    const tierNames = {
        'starter': 'Starter',
        'growth': 'Growth',
        'professional': 'Professional',
        'basic': 'Starter',
        'branded': 'Professional'
    };
    const planName = tierNames[plan] || 'Starter';

    const textBody = `Hi ${coachName},

Welcome to Zique Fitness Nutrition! Your ${planName} subscription is now active with a 14-day free trial.

To get started, set up your password using the link below:
${resetLink}

This link will expire in 24 hours.

With your new account, you can:
- Create personalized meal plans for your clients
- Use our AI-powered meal planner
- Track client progress with food diaries
- Send automated check-in reminders
- Manage your entire nutrition coaching business

We're excited to have you on board!

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
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
        <tr>
            <td style="background-color: #0d9488; padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Welcome to Zique Fitness!</h1>
                <p style="color: #e0f2f1; margin: 10px 0 0 0; font-size: 16px;">Your ${planName} subscription is active</p>
            </td>
        </tr>
        <tr>
            <td style="background-color: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="font-size: 18px; margin-bottom: 20px; color: #333333;">Hi <strong>${coachName}</strong>,</p>

                <p style="margin-bottom: 20px; font-size: 16px; color: #333333;">Welcome aboard! Your 14-day free trial has started.</p>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                        <td align="center">
                            <a href="${resetLink}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 18px;">Set Up Your Password</a>
                        </td>
                    </tr>
                </table>

                <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 25px;">This link will expire in 24 hours</p>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdfa; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0d9488;">
                    <tr>
                        <td style="padding: 20px;">
                            <p style="font-weight: bold; margin: 0 0 12px 0; color: #0f766e; font-size: 16px;">With your new account, you can:</p>
                            <ul style="margin: 0; padding-left: 20px; color: #334155;">
                                <li style="margin-bottom: 8px;">Create personalized meal plans for your clients</li>
                                <li style="margin-bottom: 8px;">Use our AI-powered meal planner</li>
                                <li style="margin-bottom: 8px;">Track client progress with food diaries</li>
                                <li style="margin-bottom: 8px;">Send automated check-in reminders</li>
                                <li style="margin-bottom: 0;">Manage your entire nutrition coaching business</li>
                            </ul>
                        </td>
                    </tr>
                </table>

                <p style="margin-top: 30px; color: #334155;">
                    We're excited to have you on board!<br><br>
                    Best,<br>
                    <strong>The Zique Team</strong>
                </p>
            </td>
        </tr>
        <tr>
            <td style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
                <p style="margin: 0;">Zique Fitness Nutrition</p>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

/**
 * Send welcome email to new coach
 */
async function sendWelcomeEmail({ coach, plan, resetLink }) {
    if (!coach || !coach.email) {
        return { success: false, error: 'Coach email not available' };
    }

    if (!resetLink) {
        return { success: false, error: 'Reset link is required' };
    }

    const emailContent = generateWelcomeEmail({
        coachName: coach.name || coach.email.split('@')[0],
        plan: plan,
        resetLink: resetLink
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
    sendIntakeInvitationEmail,
    generateIntakeInvitationEmail,
    sendCancellationEmail,
    generateCancellationEmail,
    sendReactivationEmail,
    generateReactivationEmail,
    sendPaymentFailedEmail,
    generatePaymentFailedEmail,
    sendTrialEndingEmail,
    generateTrialEndingEmail,
    sendNewCoachNotification,
    sendNewPaymentNotification,
    sendCancellationNotification,
    sendWelcomeEmail,
    generateWelcomeEmail
};
