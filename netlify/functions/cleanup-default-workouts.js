const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// All default template names that were seeded (current + legacy with en-dashes)
const DEFAULT_TEMPLATE_NAMES = [
  // Current names (hyphens)
  'Full Body Strength - Beginner',
  'Athletic Performance - Power & Speed',
  'Home Workout - Dumbbells Only',
  'HIIT & Conditioning - 3 Day',
  'Glute & Lower Body Focus',
  'Push / Pull / Legs - 6 Day',
  'Upper / Lower Split - Intermediate',
  'Classic Body Part Split - 5 Day',
  // Legacy names (en-dashes)
  'Full Body Strength \u2013 Beginner',
  'Upper / Lower Split \u2013 Intermediate',
  'Push / Pull / Legs \u2013 6 Day',
  'Home Workout \u2013 Dumbbells Only',
  'Athletic Performance \u2013 Power & Speed',
  'Classic Body Part Split \u2013 5 Day',
  'HIIT & Conditioning \u2013 3 Day'
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Delete all seeded default templates across all coaches
    const { data, error, count } = await supabase
      .from('workout_programs')
      .delete({ count: 'exact' })
      .eq('is_template', true)
      .in('name', DEFAULT_TEMPLATE_NAMES);

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Deleted ${count || 0} default workout templates from all coaches.`,
        deletedCount: count || 0
      })
    };
  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Cleanup failed' })
    };
  }
};
