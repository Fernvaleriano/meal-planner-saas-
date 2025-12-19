const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./utils/email-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Notification email for form submissions (your email)
const NOTIFICATION_EMAIL = process.env.FORM_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || 'contact@ziquefitness.com';

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

        // Send notification email
        const notificationTo = template?.notification_email || NOTIFICATION_EMAIL;

        try {
            await sendFormNotificationEmail({
                to: notificationTo,
                formName: template?.name || 'Application Form',
                responseData: response_data,
                metadata: metadata,
                responseId: responseRecord.id
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
async function sendFormNotificationEmail({ to, formName, responseData, metadata, responseId }) {
    const APP_URL = process.env.URL || 'https://ziquefitnessnutrition.com';

    // Extract key info from response
    const name = responseData.name || 'Unknown';
    const email = responseData.email || 'Not provided';
    const goal = responseData.goal || 'Not specified';
    const commitment = responseData.commitment || 'Not specified';

    const subject = `New Application: ${name}`;

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

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Application!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${formName}</p>
    </div>

    <div style="background: white; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <!-- Quick Summary -->
        <div style="background: #f0fdfa; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #0d9488;">
            <p style="margin: 0 0 8px 0; color: #0f766e;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 0 0 8px 0; color: #0f766e;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #0d9488;">${email}</a></p>
            <p style="margin: 0 0 8px 0; color: #0f766e;"><strong>Goal:</strong> ${goal}</p>
            <p style="margin: 0; color: #0f766e;"><strong>Commitment:</strong> ${commitment}</p>
        </div>

        <h3 style="color: #334155; margin: 0 0 16px 0; font-size: 16px;">Full Response</h3>

        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
            ${responseRows}
        </table>

        <!-- Metadata -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
            <p style="margin: 4px 0;">Source: ${metadata?.utm_source || 'Direct'} ${metadata?.utm_medium ? `/ ${metadata.utm_medium}` : ''}</p>
            <p style="margin: 4px 0;">Submitted: ${new Date(metadata?.submitted_at || Date.now()).toLocaleString()}</p>
            <p style="margin: 4px 0;">Response ID: ${responseId}</p>
        </div>
    </div>

    <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <a href="${APP_URL}/form-responses.html" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">View All Responses</a>
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
