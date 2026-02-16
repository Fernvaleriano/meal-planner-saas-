// Netlify Function to save client measurements
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

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
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check if service key is configured
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_KEY environment variable is not set');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error: Missing service key' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      clientId,
      coachId,
      measuredDate,
      weight,
      weightUnit,
      bodyFatPercentage,
      chest,
      waist,
      hips,
      leftArm,
      rightArm,
      leftThigh,
      rightThigh,
      measurementUnit,
      notes,
      timezone
    } = body;

    // Validate required fields with detailed error messages
    if (!clientId) {
      console.error('Missing clientId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Client ID is required. Please refresh the page and try again.' })
      };
    }

    if (!coachId) {
      console.error('Missing coachId in request');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Coach ID is required. Please refresh the page and try again.' })
      };
    }

    console.log('Saving measurement for client:', clientId, 'coach:', coachId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('client_measurements')
      .insert([{
        client_id: clientId,
        coach_id: coachId,
        measured_date: getDefaultDate(measuredDate, timezone),
        weight: weight || null,
        weight_unit: weightUnit || 'lbs',
        body_fat_percentage: bodyFatPercentage || null,
        chest: chest || null,
        waist: waist || null,
        hips: hips || null,
        left_arm: leftArm || null,
        right_arm: rightArm || null,
        left_thigh: leftThigh || null,
        right_thigh: rightThigh || null,
        measurement_unit: measurementUnit || 'in',
        notes: notes || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to save measurement: ' + error.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, measurement: data })
    };

  } catch (error) {
    console.error('Error saving measurement:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
