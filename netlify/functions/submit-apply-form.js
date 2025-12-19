const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Notification emails for form submissions
const NOTIFICATION_EMAIL = process.env.FORM_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || 'contact@ziquefitness.com';
const FITFORSHIFT_NOTIFICATION_EMAIL = process.env.FITFORSHIFT_NOTIFICATION_EMAIL;

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const body = JSON.parse(event.body);

        const { form_slug, response_data, metadata } = body;

        if (!form_slug || !response_data) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing form_slug or response_data' })
            };
        }

        // For the owner's personal apply form, we don't need to look up a template
        // We'll store it directly with a special flag
        let formTemplateId = null;

        // Try to find existing form template by slug
        const { data: template } = await supabase
            .from('form_templates')
            .select('id, notification_email, name')
            .eq('slug', form_slug)
            .eq('is_active', true)
            .single();

        if (template) {
            formTemplateId = template.id;
        }

        // Insert the form response
        const { data: responseRecord, error: insertError } = await supabase
            .from('form_responses')
            .insert([{
                form_template_id: formTemplateId,
                response_data: response_data,
                metadata: {
                    ...metadata,
                    form_slug: form_slug, // Store slug in metadata for non-template forms
                    ip: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown',
                    user_agent: event.headers['user-agent'] || 'unknown'
                }
            }])
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting form response:', insertError);
            throw insertError;
        }

        // Determine notification email based on form type
        const isFirstResponderForm = form_slug === 'first-responder-verification' ||
                                      metadata?.form_type === 'first_responder_verification';

        let notificationTo = template?.notification_email || NOTIFICATION_EMAIL;
        let formName = template?.name || 'Application Form';

        // Use FitForShift email for first responder forms if configured
        if (isFirstResponderForm && FITFORSHIFT_NOTIFICATION_EMAIL) {
            notificationTo = FITFORSHIFT_NOTIFICATION_EMAIL;
            formName = 'First Responder Verification';
        }

        try {
            await sendFormNotificationEmail({
                to: notificationTo,
                formName: formName,
                responseData: response_data,
                metadata: metadata,
                responseId: responseRecord.id,
                isFirstResponder: isFirstResponderForm
            });
        } catch (emailError) {
            // Don't fail the submission if email fails
            console.error('Failed to send notification email:', emailError);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                response_id: responseRecord.id
            })
        };

    } catch (err) {
        console.error('Form submission error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};

/**
 * Send notification email for new form submission
 */
async function sendFormNotificationEmail({ to, formName, responseData, metadata, responseId, isFirstResponder }) {
    const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

    // Extract key info from response
    const name = responseData.name || (responseData.first_name && responseData.last_name ?
                 `${responseData.first_name} ${responseData.last_name}` : 'Unknown');
    const email = responseData.email || 'Not provided';

    // Different fields based on form type
    let goal, commitment, subject;
    if (isFirstResponder) {
        goal = responseData.agency_name || 'Not specified';
        commitment = 'First Responder Verification';
        subject = `New First Responder Verification: ${name}`;
    } else {
        goal = responseData.goal || 'Not specified';
        commitment = responseData.commitment || 'Not specified';
        subject = `New Application: ${name}`;
    }

    // Build response summary
    const responseLines = Object.entries(responseData)
        .filter(([key, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            return `${label}: ${displayValue}`;
        })
        .join('\n');

    const textBody = `New application received!

Name: ${name}
Email: ${email}
Goal: ${goal}
Commitment Level: ${commitment}

---

Full Response:
${responseLines}

---

UTM Source: ${metadata?.utm_source || 'Direct'}
Submitted: ${metadata?.submitted_at || new Date().toISOString()}

View all responses:
${APP_URL}/form-responses.html
`;

    // Build HTML response table
    const responseRows = Object.entries(responseData)
        .filter(([key, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            return `<tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 35%;">${label}</td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;"><strong>${displayValue}</strong></td>
            </tr>`;
        })
        .join('');

    // Build ID photo section for first responder emails
    let idPhotoSection = '';
    if (isFirstResponder && responseData.id_photo_url) {
        const isImage = responseData.id_photo_url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        idPhotoSection = `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <h3 style="color: #334155; margin: 0 0 16px 0; font-size: 16px;">ID Badge Photo</h3>
            ${isImage ? `<img src="${responseData.id_photo_url}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" alt="ID Badge" />` : '<p style="color: #64748b;">PDF document attached</p>'}
            <p style="margin-top: 8px;"><a href="${responseData.id_photo_url}" style="color: #0d9488;">View Full Image</a></p>
        </div>`;
    }

    // Different header styling for first responder vs application forms
    const headerGradient = isFirstResponder
        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
        : 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)';

    const headerTitle = isFirstResponder ? 'New First Responder Verification!' : 'New Application!';

    // Different summary labels for first responder forms
    const summaryLabel3 = isFirstResponder ? 'Agency' : 'Goal';
    const summaryLabel4 = isFirstResponder ? 'Type' : 'Commitment';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: ${headerGradient}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${headerTitle}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${formName}</p>
    </div>

    <div style="background: white; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <!-- Quick Summary -->
        <div style="background: ${isFirstResponder ? '#fffbeb' : '#f0fdfa'}; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid ${isFirstResponder ? '#f59e0b' : '#0d9488'};">
            <p style="margin: 0 0 8px 0; color: ${isFirstResponder ? '#92400e' : '#0f766e'};"><strong>Name:</strong> ${name}</p>
            <p style="margin: 0 0 8px 0; color: ${isFirstResponder ? '#92400e' : '#0f766e'};"><strong>Email:</strong> <a href="mailto:${email}" style="color: ${isFirstResponder ? '#d97706' : '#0d9488'};">${email}</a></p>
            <p style="margin: 0 0 8px 0; color: ${isFirstResponder ? '#92400e' : '#0f766e'};"><strong>${summaryLabel3}:</strong> ${goal}</p>
            <p style="margin: 0; color: ${isFirstResponder ? '#92400e' : '#0f766e'};"><strong>${summaryLabel4}:</strong> ${commitment}</p>
        </div>

        <h3 style="color: #334155; margin: 0 0 16px 0; font-size: 16px;">Full Response</h3>

        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
            ${responseRows}
        </table>

        ${idPhotoSection}

        <!-- Metadata -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
            <p style="margin: 4px 0;">Source: ${metadata?.utm_source || 'Direct'} ${metadata?.utm_medium ? `/ ${metadata.utm_medium}` : ''}</p>
            <p style="margin: 4px 0;">Submitted: ${new Date(metadata?.submitted_at || Date.now()).toLocaleString()}</p>
            <p style="margin: 4px 0;">Response ID: ${responseId}</p>
        </div>
    </div>

    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <a href="${APP_URL}/form-responses.html" style="display: inline-block; background: ${headerGradient}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">View All Responses</a>
    </div>
</body>
</html>`;

    return sendEmail({
        to,
        subject,
        text: textBody,
        html: htmlBody
    });
}
