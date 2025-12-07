/**
 * Netlify Function to validate client intake tokens
 * Used by the client-intake.html form to verify the invitation is valid
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const token = event.queryStringParameters?.token;

        if (!token) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    valid: false,
                    error: 'Token is required'
                })
            };
        }

        // Initialize Supabase client with service key
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Find client with this intake token
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, email, client_name, phone, coach_id, intake_token_expires_at, user_id')
            .eq('intake_token', token)
            .single();

        if (clientError || !client) {
            console.log('Token not found or error:', clientError?.message);
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    valid: false,
                    error: 'Invalid or expired invitation link. Please contact your coach for a new invitation.'
                })
            };
        }

        // Check if client already has an account
        if (client.user_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    valid: false,
                    error: 'This invitation has already been used. Please log in to access your account.'
                })
            };
        }

        // Check if token has expired
        if (client.intake_token_expires_at) {
            const expiresAt = new Date(client.intake_token_expires_at);
            if (expiresAt < new Date()) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        valid: false,
                        error: 'This invitation has expired. Please contact your coach for a new invitation.'
                    })
                };
            }
        }

        // Get coach information
        const { data: coach, error: coachError } = await supabase
            .from('coaches')
            .select('id, full_name, email')
            .eq('id', client.coach_id)
            .single();

        if (coachError) {
            console.warn('Could not fetch coach data:', coachError.message);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                valid: true,
                client: {
                    id: client.id,
                    email: client.email,
                    client_name: client.client_name,
                    phone: client.phone
                },
                coach: coach ? {
                    full_name: coach.full_name,
                    email: coach.email
                } : null
            })
        };

    } catch (error) {
        console.error('Token validation error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                valid: false,
                error: 'An error occurred while validating your invitation. Please try again.'
            })
        };
    }
};
