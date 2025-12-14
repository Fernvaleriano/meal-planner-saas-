const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VIDEO_BUCKET = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Clean exercise name from filename for comparison
function cleanName(filename) {
  return filename
    .replace(/\.(mp4|mov|avi|webm|gif|jpg|jpeg|png|webp)$/i, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .trim();
}

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
  const showStorage = params.storage === 'true';

  try {
    // Get total exercise count in database
    const { count: totalCount } = await supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true });

    // If search term provided, look for it in database
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

    // Build base response
    const response = {
      totalExercisesInDatabase: totalCount,
      search: search ? {
        term: search,
        found: searchResults.length,
        results: searchResults,
        notFound: searchResults.length === 0 ?
          `"${search}" not found in database. Try: /.netlify/functions/check-exercises?search=${search}&storage=true to search storage files.` : null
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
    };

    // If showStorage, also check video storage bucket
    if (showStorage) {
      const allVideos = [];

      async function listFilesRecursive(prefix = '') {
        const { data, error } = await supabase.storage
          .from(VIDEO_BUCKET)
          .list(prefix, { limit: 1000 });

        if (error) return;

        for (const item of data || []) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) {
            await listFilesRecursive(itemPath);
          } else if (/\.(mp4|mov|avi|webm|gif)$/i.test(item.name)) {
            allVideos.push({
              filename: item.name,
              path: itemPath,
              folder: prefix
            });
          }
        }
      }

      await listFilesRecursive();

      // Get all exercise names for comparison
      const { data: allExercises } = await supabase
        .from('exercises')
        .select('name');

      const exerciseNames = new Set((allExercises || []).map(e => cleanName(e.name)));

      // Find videos without matching exercises
      const unmatchedVideos = [];
      const matchedVideos = [];

      for (const video of allVideos) {
        const cleanedName = cleanName(video.filename);
        const hasMatch = exerciseNames.has(cleanedName) ||
          [...exerciseNames].some(name =>
            name.includes(cleanedName) || cleanedName.includes(name)
          );

        if (hasMatch) {
          matchedVideos.push(video.filename);
        } else {
          unmatchedVideos.push({
            filename: video.filename,
            folder: video.folder,
            cleanedName: cleanedName
          });
        }
      }

      // If search term, filter to videos matching search
      let storageSearchResults = [];
      if (search) {
        const searchLower = search.toLowerCase();
        storageSearchResults = allVideos
          .filter(v => v.filename.toLowerCase().includes(searchLower))
          .map(v => ({
            filename: v.filename,
            folder: v.folder,
            inDatabase: exerciseNames.has(cleanName(v.filename)) ||
              [...exerciseNames].some(name =>
                name.includes(cleanName(v.filename)) || cleanName(v.filename).includes(name)
              )
          }));
      }

      response.storage = {
        totalVideosInBucket: allVideos.length,
        matchedToExercises: matchedVideos.length,
        notMatchedToExercises: unmatchedVideos.length,
        searchInStorage: search ? {
          term: search,
          found: storageSearchResults.length,
          results: storageSearchResults.slice(0, 30)
        } : null,
        unmatchedSample: unmatchedVideos.slice(0, 30),
        hint: unmatchedVideos.length > 0 ?
          'Run /.netlify/functions/sync-exercises-from-videos?dryRun=true to see what would be imported' : null
      };
    } else {
      response.hint = 'Add ?storage=true to also check video files in storage bucket';
    }

    response.syncTools = {
      checkDryRun: '/.netlify/functions/sync-exercises-from-videos?dryRun=true',
      runSync: '/.netlify/functions/sync-exercises-from-videos',
      addMissing: '/.netlify/functions/add-missing-exercises'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
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
