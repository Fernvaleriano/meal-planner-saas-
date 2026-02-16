// Netlify Function to get client measurements
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { clientId, limit } = event.queryStringParameters || {};

    if (!clientId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase
      .from('client_measurements')
      .select('*')
      .eq('client_id', clientId)
      .order('measured_date', { ascending: false });

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to fetch measurements: ' + error.message })
      };
    }

    // Calculate progress stats
    let stats = null;
    if (data && data.length >= 2) {
      const latest = data[0];
      const oldest = data[data.length - 1];

      stats = {
        weightChange: latest.weight && oldest.weight ?
          parseFloat((latest.weight - oldest.weight).toFixed(1)) : null,
        waistChange: latest.waist && oldest.waist ?
          parseFloat((latest.waist - oldest.waist).toFixed(1)) : null,
        totalEntries: data.length,
        dateRange: {
          start: oldest.measured_date,
          end: latest.measured_date
        }
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        measurements: data || [],
        stats: stats
      })
    };

  } catch (error) {
    console.error('Error fetching measurements:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
