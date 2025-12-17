// Netlify Function to backfill missing coach_id values in food_diary_entries
// This fixes entries where coach_id was not set due to timing issues or missing data
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { coachId, dryRun = true } = body;

    if (!coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'coachId is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Step 1: Get all clients for this coach
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, client_name, email')
      .eq('coach_id', coachId);

    if (clientsError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: clientsError.message })
      };
    }

    if (!clients || clients.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No clients found for this coach', updated: 0 })
      };
    }

    const clientIds = clients.map(c => c.id);
    const clientMap = {};
    clients.forEach(c => {
      clientMap[c.id] = c.client_name || c.email || c.id;
    });

    // Step 2: Find all food diary entries for these clients that have NULL coach_id
    const { data: entriesWithNullCoach, error: entriesError } = await supabase
      .from('food_diary_entries')
      .select('id, client_id, food_name, entry_date, coach_id')
      .in('client_id', clientIds)
      .is('coach_id', null);

    if (entriesError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: entriesError.message })
      };
    }

    const entriesToFix = entriesWithNullCoach || [];

    // Group entries by client for reporting
    const entriesByClient = {};
    entriesToFix.forEach(entry => {
      const clientName = clientMap[entry.client_id] || entry.client_id;
      if (!entriesByClient[clientName]) {
        entriesByClient[clientName] = [];
      }
      entriesByClient[clientName].push({
        id: entry.id,
        foodName: entry.food_name,
        date: entry.entry_date
      });
    });

    if (dryRun) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          dryRun: true,
          message: `Found ${entriesToFix.length} entries with missing coach_id`,
          totalEntries: entriesToFix.length,
          entriesByClient,
          instruction: 'Set dryRun: false to apply the fix'
        })
      };
    }

    // Step 3: Update all entries to set the coach_id
    if (entriesToFix.length > 0) {
      const entryIds = entriesToFix.map(e => e.id);

      const { error: updateError } = await supabase
        .from('food_diary_entries')
        .update({ coach_id: coachId })
        .in('id', entryIds);

      if (updateError) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: updateError.message })
        };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: `Updated ${entriesToFix.length} entries with coach_id`,
        totalUpdated: entriesToFix.length,
        entriesByClient
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
