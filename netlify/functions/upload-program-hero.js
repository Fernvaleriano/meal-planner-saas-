const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = 'program-hero-images';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

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
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = JSON.parse(event.body || '{}');
    const { programId, heroImageUrl, imageBase64, imageName } = body;

    if (!programId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'programId is required' })
      };
    }

    let finalHeroImageUrl = heroImageUrl;

    // If base64 image provided, upload to storage
    if (imageBase64 && imageName) {
      // Extract base64 data (remove data:image/xxx;base64, prefix if present)
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Determine content type from imageName
      const extension = imageName.split('.').pop().toLowerCase();
      const contentTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      const contentType = contentTypes[extension] || 'image/jpeg';

      // Create unique filename
      const timestamp = Date.now();
      const sanitizedName = imageName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `hero-images/${programId}_${timestamp}_${sanitizedName}`;

      // Try to upload to program-hero-images bucket, fall back to exercise-thumbnails if it doesn't exist
      let uploadResult;
      try {
        uploadResult = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, buffer, {
            contentType,
            upsert: true
          });

        if (uploadResult.error) {
          // Fall back to exercise-thumbnails bucket
          uploadResult = await supabase.storage
            .from('exercise-thumbnails')
            .upload(`program-heroes/${programId}_${timestamp}_${sanitizedName}`, buffer, {
              contentType,
              upsert: true
            });

          if (uploadResult.error) {
            throw new Error('Failed to upload image: ' + uploadResult.error.message);
          }

          // Get public URL from fallback bucket
          const { data: urlData } = supabase.storage
            .from('exercise-thumbnails')
            .getPublicUrl(`program-heroes/${programId}_${timestamp}_${sanitizedName}`);

          finalHeroImageUrl = urlData.publicUrl;
        } else {
          // Get public URL from main bucket
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

          finalHeroImageUrl = urlData.publicUrl;
        }
      } catch (uploadErr) {
        // Final fallback - use exercise-thumbnails bucket
        const fallbackPath = `program-heroes/${programId}_${timestamp}_${sanitizedName}`;
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('exercise-thumbnails')
          .upload(fallbackPath, buffer, {
            contentType,
            upsert: true
          });

        if (fallbackError) {
          throw new Error('Failed to upload image: ' + fallbackError.message);
        }

        const { data: urlData } = supabase.storage
          .from('exercise-thumbnails')
          .getPublicUrl(fallbackPath);

        finalHeroImageUrl = urlData.publicUrl;
      }
    }

    if (!finalHeroImageUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Either heroImageUrl or imageBase64 with imageName is required' })
      };
    }

    // First fetch current program_data
    const { data: existingProgram, error: fetchError } = await supabase
      .from('workout_programs')
      .select('program_data')
      .eq('id', programId)
      .single();

    if (fetchError) {
      throw new Error('Failed to fetch program: ' + fetchError.message);
    }

    // Update program_data with new image_url
    const updatedProgramData = {
      ...(existingProgram.program_data || {}),
      image_url: finalHeroImageUrl
    };

    const { data: program, error: updateError } = await supabase
      .from('workout_programs')
      .update({ program_data: updatedProgramData })
      .eq('id', programId)
      .select()
      .single();

    if (updateError) {
      throw new Error('Failed to update program: ' + updateError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        program: {
          id: program.id,
          name: program.name,
          hero_image_url: program.program_data?.image_url
        }
      })
    };

  } catch (err) {
    console.error('Upload hero image error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
