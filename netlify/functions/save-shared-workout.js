// Netlify Function to save a shared workout program to Supabase
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_EXPIRY_DAYS = [1, 7, 30];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { programData, coachProgramId, coachId, expiresInDays, ctaUrl, ctaLabel } = JSON.parse(event.body);

    if (!programData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Program data is required' })
      };
    }

    let expiresAt = null;
    if (expiresInDays !== null && expiresInDays !== undefined && expiresInDays !== 'never') {
      const days = Number(expiresInDays);
      if (!ALLOWED_EXPIRY_DAYS.includes(days)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'expiresInDays must be 1, 7, 30, or "never"' })
        };
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const shareId = Math.random().toString(36).substring(2, 10);

    const insertData = {
      share_id: shareId,
      program_data: programData,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    };
    if (coachProgramId) insertData.coach_program_id = coachProgramId;
    if (coachId) insertData.coach_id = coachId;

    if (ctaUrl && typeof ctaUrl === 'string') {
      const trimmed = ctaUrl.trim();
      if (trimmed) {
        if (!/^https?:\/\//i.test(trimmed)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'ctaUrl must start with http:// or https://' })
          };
        }
        insertData.cta_url = trimmed.slice(0, 2048);
      }
    }
    if (ctaLabel && typeof ctaLabel === 'string') {
      insertData.cta_label = ctaLabel.trim().slice(0, 60);
    }

    const { error } = await supabase
      .from('shared_workout_programs')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save shared workout',
          details: error.message
        })
      };
    }

    const origin = event.headers.origin || `https://${event.headers.host || 'localhost'}`;
    const shareUrl = `${origin}/view-workout.html?share=${shareId}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        shareId,
        shareUrl,
        expiresAt,
        message: 'Workout saved successfully'
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
