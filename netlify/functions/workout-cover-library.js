// Netlify Function to list the shared workout cover-photo library.
//
// The founder curates a set of good-looking workout background photos that
// clients can pick from when creating a custom workout, and that AI-generated
// workouts pull from at random (so an AI program is never left with a blank
// cover). Those photos live in the existing public `exercise-thumbnails`
// bucket under the `workout-cover-library/` prefix — reusing that bucket
// avoids provisioning a new one and matches how workout covers are already
// stored (see upload-workout-cover.js / workout-cover-image.js).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'exercise-thumbnails';
const LIBRARY_PREFIX = 'workout-cover-library';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(LIBRARY_PREFIX, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
      console.error('Error listing cover library:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to list cover library' })
      };
    }

    // Keep only real image files — Supabase returns a `.emptyFolderPlaceholder`
    // entry for empty prefixes, and we don't want dotfiles surfacing as covers.
    const covers = (files || [])
      .filter(f => f && f.name && !f.name.startsWith('.') && /\.(jpe?g|png|webp|gif)$/i.test(f.name))
      .map(f => {
        const path = `${LIBRARY_PREFIX}/${f.name}`;
        const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
        return { name: f.name, url: data.publicUrl };
      });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ covers })
    };
  } catch (error) {
    console.error('Error in workout-cover-library:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
