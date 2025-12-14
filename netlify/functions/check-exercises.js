const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};
  const search = params.search || '';

  try {
    // Get total count
    const { count: totalCount } = await supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true });

    // If search term provided, look for it
    let searchResults = [];
    if (search) {
      const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, equipment, thumbnail_url, video_url, animation_url')
        .ilike('name', `%${search}%`)
        .limit(50);
      searchResults = data || [];
    }

    // Get exercises that start with common letters to show sample
    const { data: sampleA } = await supabase
      .from('exercises')
      .select('name')
      .ilike('name', 'a%')
      .order('name')
      .limit(20);

    const { data: sampleE } = await supabase
      .from('exercises')
      .select('name')
      .ilike('name', 'e%')
      .order('name')
      .limit(20);

    // Get exercises without thumbnails
    const { data: noThumbnails, count: noThumbCount } = await supabase
      .from('exercises')
      .select('name, video_url, animation_url', { count: 'exact' })
      .is('thumbnail_url', null)
      .limit(30);

    // Get exercises without any media
    const { data: noMedia, count: noMediaCount } = await supabase
      .from('exercises')
      .select('name', { count: 'exact' })
      .is('thumbnail_url', null)
      .is('video_url', null)
      .is('animation_url', null)
      .limit(30);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalExercises: totalCount,
        search: search ? {
          term: search,
          found: searchResults.length,
          results: searchResults
        } : null,
        samples: {
          startingWithA: sampleA?.map(e => e.name) || [],
          startingWithE: sampleE?.map(e => e.name) || []
        },
        missingThumbnails: {
          count: noThumbCount,
          sample: noThumbnails?.map(e => ({ name: e.name, hasVideo: !!(e.video_url || e.animation_url) })) || []
        },
        noMediaAtAll: {
          count: noMediaCount,
          sample: noMedia?.map(e => e.name) || []
        }
      }, null, 2)
    };

  } catch (err) {
    console.error('Check exercises error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
