/**
 * Validates a coach's signup code and returns coach info
 * v1.1 - Added logging for debugging
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
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const code = event.queryStringParameters?.code;
        console.log('Validating signup code:', code);

        if (!code) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ valid: false, error: 'No signup code provided' })
            };
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        console.log('Supabase client created, searching for code:', code.trim());

        // Find coach by signup code (case-insensitive)
        const { data: coach, error } = await supabase
            .from('coaches')
            .select('id, full_name, email, signup_code_enabled, subscription_status, brand_name')
            .ilike('signup_code', code.trim())
            .single();

        if (error || !coach) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ valid: false, error: 'Invalid signup code. Please check with your coach.' })
            };
        }

        if (coach.signup_code_enabled === false) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ valid: false, error: 'This signup code is currently disabled.' })
            };
        }

        // Check subscription status
        if (coach.subscription_status && !['active', 'trialing'].includes(coach.subscription_status)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ valid: false, error: 'Your coach\'s account is not active.' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                valid: true,
                coach: {
                    id: coach.id,
                    name: coach.full_name,
                    brandName: coach.brand_name
                }
            })
        };

    } catch (error) {
        console.error('Validate signup code error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ valid: false, error: 'An error occurred. Please try again.' })
        };
    }
};
