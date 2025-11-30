/**
 * Email Service for Check-in Reminders
 *
 * Supports multiple email providers via environment configuration:
 * - Resend (recommended): Set RESEND_API_KEY
 * - SendGrid: Set SENDGRID_API_KEY
 * - Mailgun: Set MAILGUN_API_KEY and MAILGUN_DOMAIN
 *
 * Falls back to logging if no provider is configured (dev mode)
 */

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ziquefitness.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Zique Fitness Nutrition';
const APP_URL = process.env.URL || 'https://cute-jalebi-b0f423.netlify.app';

/**
 * Send an email using the configured provider
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, subject, text, html }) {
    // Validate inputs
    if (!to || !subject || !text) {
        return { success: false, error: 'Missing required fields: to, subject, text' };
    }

    // Try providers in order of preference
    if (process.env.RESEND_API_KEY) {
        return sendWithResend({ to, subject, text, html });
    }

    if (process.env.SENDGRID_API_KEY) {
        return sendWithSendGrid({ to, subject, text, html });
    }

    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
        return sendWithMailgun({ to, subject, text, html });
    }

    // Development fallback - just log the email
    console.log('=== EMAIL (Dev Mode - No provider configured) ===');
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
async function sendWithResend({ to, subject, text, html }) {
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
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
async function sendWithSendGrid({ to, subject, text, html }) {
    try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
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
async function sendWithMailgun({ to, subject, text, html }) {
    try {
        const domain = process.env.MAILGUN_DOMAIN;
        const formData = new URLSearchParams();
        formData.append('from', `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`);
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
 * @returns {Object} - { subject, text, html }
 */
function generateReminderEmail({
    clientName,
    clientEmail,
    coachName = 'Your Coach',
    clientId,
    customSubject,
    customMessage,
    isFollowup = false
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
Zique Fitness Nutrition
${APP_URL}`;

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
        <p>Zique Fitness Nutrition</p>
        <p><a href="${APP_URL}" style="color: #0d9488;">Visit Dashboard</a></p>
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

    const emailContent = generateReminderEmail({
        clientName: client.client_name || 'there',
        clientEmail: client.email,
        coachName: coach?.full_name || coach?.email || 'Your Coach',
        clientId: client.id,
        customSubject: settings.email_subject,
        customMessage: settings.email_message,
        isFollowup
    });

    return sendEmail({
        to: client.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
    });
}

module.exports = {
    sendEmail,
    sendCheckinReminder,
    generateReminderEmail
};
