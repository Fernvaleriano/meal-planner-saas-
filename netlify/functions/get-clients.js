// Netlify Function to retrieve all clients for a coach
const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const coachId = event.queryStringParameters.coachId;
    const includeArchived = event.queryStringParameters.includeArchived === 'true';
    const archivedOnly = event.queryStringParameters.archivedOnly === 'true';

    if (!coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID is required' })
      };
    }

    // ✅ SECURITY: Verify the authenticated user owns this coach account
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    // Initialize Supabase client with service key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build query
    let query = supabase
      .from('clients')
      .select('*')
      .eq('coach_id', coachId);

    // Filter by archived status
    if (archivedOnly) {
      // Only archived clients
      query = query.eq('is_archived', true);
    } else if (!includeArchived) {
      // Exclude archived clients (default behavior)
      // Handle both false and null values for backwards compatibility
      query = query.or('is_archived.eq.false,is_archived.is.null');
    }
    // If includeArchived is true, don't filter - return all clients

    // Order by name
    const { data, error } = await query.order('client_name', { ascending: true });

    if (error) {
      console.error('❌ Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to retrieve clients',
          details: error.message
        })
      };
    }

    console.log(`✅ Retrieved ${data.length} clients for coach ${coachId} (archived: ${archivedOnly ? 'only' : includeArchived ? 'included' : 'excluded'})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        clients: data
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
