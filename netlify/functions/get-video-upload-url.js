const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Signed URL expiry: 7 days (in seconds)
const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60;

// Video storage quotas by subscription tier (in bytes)
const STORAGE_QUOTAS = {
  starter: 5 * 1024 * 1024 * 1024,       // 5 GB
  growth: 25 * 1024 * 1024 * 1024,        // 25 GB
  scale: 50 * 1024 * 1024 * 1024,         // 50 GB
  'pro-agency': 100 * 1024 * 1024 * 1024, // 100 GB
  // Legacy tier mappings
  basic: 5 * 1024 * 1024 * 1024,          // 5 GB (maps to Starter)
  professional: 100 * 1024 * 1024 * 1024, // 100 GB (maps to Pro/Agency)
  branded: 100 * 1024 * 1024 * 1024       // 100 GB (maps to Pro/Agency)
};

const DEFAULT_QUOTA = 5 * 1024 * 1024 * 1024; // 5 GB fallback

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error - SUPABASE_SERVICE_KEY not set' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { coachId, fileName, contentType, folder } = JSON.parse(event.body || '{}');

    if (!coachId || !fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'coachId and fileName are required' })
      };
    }

    // Determine folder (exercise-videos, voice-notes, or meal-voice-notes)
    const folderMap = {
      'voice-notes': 'voice-notes',
      'meal-voice-notes': 'meal-voice-notes'
    };
    const folderPath = folderMap[folder] || 'exercise-videos';
    const filePath = `${folderPath}/${coachId}/${fileName}`;

    // Check storage quota for exercise video uploads
    if (folderPath === 'exercise-videos') {
      // Get coach's subscription tier
      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('subscription_tier')
        .eq('id', coachId)
        .single();

      const tier = coach?.subscription_tier || 'starter';
      const quota = STORAGE_QUOTAS[tier] || DEFAULT_QUOTA;

      // Calculate current storage usage
      const videoFolder = `exercise-videos/${coachId}`;
      const { data: existingFiles, error: listError } = await supabase.storage
        .from('workout-assets')
        .list(videoFolder, { limit: 1000 });

      if (!listError && existingFiles) {
        const totalUsed = existingFiles
          .filter(f => !f.id?.endsWith('/'))
          .reduce((sum, f) => sum + (f.metadata?.size || 0), 0);

        if (totalUsed >= quota) {
          const usedGB = (totalUsed / (1024 * 1024 * 1024)).toFixed(1);
          const quotaGB = (quota / (1024 * 1024 * 1024)).toFixed(0);
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: `Video storage full. You've used ${usedGB} GB of your ${quotaGB} GB limit. Upgrade your plan for more storage.`,
              storageUsed: totalUsed,
              storageQuota: quota,
              tierName: tier
            })
          };
        }
      }
    }

    // Create a signed upload URL
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workout-assets')
      .createSignedUploadUrl(filePath);

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError);

      // Check if bucket doesn't exist
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Storage not configured. Please create the "workout-assets" bucket in Supabase (keep it PRIVATE).',
            details: uploadError.message
          })
        };
      }

      throw uploadError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        filePath: filePath,
        contentType: contentType || 'video/webm'
      })
    };

  } catch (err) {
    console.error('Get video upload URL error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
