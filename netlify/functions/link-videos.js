const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'exercise-videos';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  try {
    // List all files in the bucket (recursively)
    const allFiles = [];

    async function listFilesRecursive(prefix = '') {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, { limit: 1000 });

      if (error) {
        console.error('Error listing files:', error);
        return;
      }

      for (const item of data || []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder, recurse
          await listFilesRecursive(itemPath);
        } else if (item.name.toLowerCase().endsWith('.mp4')) {
          allFiles.push({
            name: item.name,
            path: itemPath
          });
        }
      }
    }

    await listFilesRecursive();

    console.log(`Found ${allFiles.length} MP4 files in storage`);

    if (allFiles.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No MP4 files found in storage bucket',
          matched: 0,
          unmatched: 0
        })
      };
    }

    // Link each video to exercises
    let matched = 0;
    let unmatched = 0;
    const matchedExercises = [];
    const unmatchedFiles = [];

    for (const file of allFiles) {
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(file.path);

      const videoUrl = urlData.publicUrl;

      // Extract exercise name from filename (remove .mp4)
      const exerciseName = file.name.replace(/\.mp4$/i, '');

      // Try to match with exercise in database (case-insensitive)
      const { data, error } = await supabase
        .from('exercises')
        .update({ video_url: videoUrl, animation_url: videoUrl })
        .ilike('name', exerciseName)
        .select('id, name');

      if (!error && data && data.length > 0) {
        matched++;
        matchedExercises.push({ file: file.name, exercise: data[0].name });
      } else {
        unmatched++;
        unmatchedFiles.push(file.name);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        totalFiles: allFiles.length,
        matched,
        unmatched,
        matchedExercises: matchedExercises.slice(0, 20), // Show first 20
        unmatchedFiles: unmatchedFiles.slice(0, 20) // Show first 20
      })
    };

  } catch (err) {
    console.error('Link videos error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
