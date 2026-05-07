// Netlify Function to retrieve a shared workout program from Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const shareId = event.queryStringParameters && event.queryStringParameters.shareId;

    if (!shareId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Share ID is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('shared_workout_programs')
      .select('program_data, created_at, expires_at, coach_id')
      .eq('share_id', shareId)
      .single();

    if (error || !data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Shared workout not found' })
      };
    }

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return {
        statusCode: 410,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'expired',
          message: 'This workout link has expired.',
          expiredAt: data.expires_at
        })
      };
    }

    let coachBranding = null;
    if (data.coach_id) {
      try {
        const { data: branding } = await supabase
          .from('coaches')
          .select('brand_name, brand_logo_url, brand_primary_color, brand_secondary_color')
          .eq('id', data.coach_id)
          .maybeSingle();
        if (branding) {
          coachBranding = {
            displayName: branding.brand_name || null,
            logoUrl: branding.brand_logo_url || null,
            primaryColor: branding.brand_primary_color || null,
            secondaryColor: branding.brand_secondary_color || null
          };
        }
      } catch (_e) { /* branding lookup is best-effort */ }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        programData: data.program_data,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        coachBranding
      })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
