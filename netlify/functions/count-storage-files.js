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
  const bucketName = event.queryStringParameters?.bucket || 'exercise-thumbnails';

  try {
    const filesByFolder = {};
    let totalFiles = 0;
    let totalSize = 0;

    async function listFilesRecursive(prefix = '') {
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .list(prefix, {
            limit: limit,
            offset: offset,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error('Error listing files:', error);
          return;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of data) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

          if (item.id === null) {
            // It's a folder - recurse into it
            await listFilesRecursive(itemPath);
          } else {
            // It's a file
            totalFiles++;
            totalSize += item.metadata?.size || 0;

            const folder = prefix || 'root';
            if (!filesByFolder[folder]) {
              filesByFolder[folder] = { count: 0, files: [] };
            }
            filesByFolder[folder].count++;
            if (filesByFolder[folder].files.length < 10) {
              filesByFolder[folder].files.push(item.name);
            }
          }
        }

        offset += data.length;
        hasMore = data.length === limit;
      }
    }

    await listFilesRecursive();

    // Format size
    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        bucket: bucketName,
        totalFiles: totalFiles,
        totalSize: formatSize(totalSize),
        totalSizeBytes: totalSize,
        folders: Object.entries(filesByFolder).map(([folder, data]) => ({
          folder,
          fileCount: data.count,
          sampleFiles: data.files
        }))
      }, null, 2)
    };

  } catch (err) {
    console.error('Count files error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
