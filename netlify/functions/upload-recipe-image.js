const { createClient } = require('@supabase/supabase-js');
const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'recipe-images';

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

async function ensureBucketExists(supabase) {
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

        if (!bucketExists) {
            await supabase.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: 5242880 // 5MB
            });
        }
        return true;
    } catch (error) {
        console.error('Error ensuring bucket exists:', error);
        return false;
    }
}

exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        if (!SUPABASE_SERVICE_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        const { coachId, imageData, fileName } = JSON.parse(event.body);

        if (!coachId || !imageData) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'coachId and imageData are required' })
            };
        }

        const { user, error: authError } = await authenticateCoach(event, coachId);
        if (authError) return authError;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const bucketReady = await ensureBucketExists(supabase);
        if (!bucketReady) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Storage not available' })
            };
        }

        // Extract base64 data
        const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!base64Match) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid image data format' })
            };
        }

        const imageType = base64Match[1];
        const base64Data = base64Match[2];
        const buffer = Buffer.from(base64Data, 'base64');

        const timestamp = Date.now();
        const storagePath = `${coachId}/recipe_${timestamp}.${imageType}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, buffer, {
                contentType: `image/${imageType}`,
                upsert: false
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to upload image: ' + uploadError.message })
            };
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(storagePath);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                imageUrl: urlData.publicUrl,
                storagePath
            })
        };

    } catch (error) {
        console.error('Error in upload-recipe-image:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error: ' + error.message })
        };
    }
};
