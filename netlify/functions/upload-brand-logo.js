/**
 * Upload Brand Logo
 *
 * Handles uploading of brand logos (logo, favicon, email logo) for coaches.
 * Requires Professional tier subscription.
 *
 * Supports three logo types:
 * - logo: Main brand logo displayed in header
 * - favicon: Browser tab icon
 * - email_logo: Logo displayed in email headers
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BUCKET_NAME = 'brand-assets';
const MAX_FILE_SIZE = 1024000; // 1MB for logos
const FAVICON_MAX_SIZE = 102400; // 100KB for favicons

const LOGO_TYPES = {
    logo: {
        field: 'brand_logo_url',
        maxSize: MAX_FILE_SIZE,
        folder: 'logos'
    },
    favicon: {
        field: 'brand_favicon_url',
        maxSize: FAVICON_MAX_SIZE,
        folder: 'favicons'
    },
    email_logo: {
        field: 'brand_email_logo_url',
        maxSize: MAX_FILE_SIZE,
        folder: 'email-logos'
    }
};

// Helper function to ensure bucket exists
async function ensureBucketExists(supabase) {
    try {
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();

        if (listError) {
            console.error('Error listing buckets:', listError);
            return { success: false, error: listError.message };
        }

        const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

        if (!bucketExists) {
            console.log(`Creating bucket: ${BUCKET_NAME}`);
            const { data, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: MAX_FILE_SIZE
            });

            if (createError) {
                console.error('Error creating bucket:', createError);
                return { success: false, error: createError.message };
            }
            console.log('Bucket created successfully');
        }

        return { success: true };
    } catch (error) {
        console.error('Error ensuring bucket exists:', error);
        return { success: false, error: error.message };
    }
}

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
            },
            body: ''
        };
    }

    if (!SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    // Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            statusCode: 401,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Authentication required' })
        };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return {
            statusCode: 401,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Invalid token' })
        };
    }

    // Check coach exists and has branding access
    const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id, subscription_tier, brand_logo_url, brand_favicon_url, brand_email_logo_url')
        .eq('id', user.id)
        .single();

    if (coachError || !coach) {
        return {
            statusCode: 404,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Coach not found' })
        };
    }

    // Check subscription tier
    const hasBrandingAccess = ['professional', 'branded'].includes(coach.subscription_tier);
    if (!hasBrandingAccess) {
        return {
            statusCode: 403,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                error: 'Branding features require Professional tier',
                upgrade_required: true
            })
        };
    }

    // Handle DELETE request (remove logo)
    if (event.httpMethod === 'DELETE') {
        try {
            const { logoType } = JSON.parse(event.body || '{}');

            if (!logoType || !LOGO_TYPES[logoType]) {
                return {
                    statusCode: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Invalid logo type. Use: logo, favicon, or email_logo' })
                };
            }

            const logoConfig = LOGO_TYPES[logoType];
            const currentUrl = coach[logoConfig.field];

            // Delete from storage if exists
            if (currentUrl) {
                const urlParts = currentUrl.split(`${BUCKET_NAME}/`);
                if (urlParts.length > 1) {
                    await supabase.storage.from(BUCKET_NAME).remove([urlParts[1]]);
                }
            }

            // Update database
            const { error: updateError } = await supabase
                .from('coaches')
                .update({
                    [logoConfig.field]: null,
                    branding_updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (updateError) {
                throw updateError;
            }

            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    message: `${logoType} removed successfully`
                })
            };

        } catch (error) {
            console.error('Error removing logo:', error);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to remove logo' })
            };
        }
    }

    // Handle POST request (upload logo)
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { logoType, imageData } = body;

        // Validate logo type
        if (!logoType || !LOGO_TYPES[logoType]) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid logo type. Use: logo, favicon, or email_logo' })
            };
        }

        if (!imageData) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Image data is required' })
            };
        }

        const logoConfig = LOGO_TYPES[logoType];

        // Ensure bucket exists
        const bucketResult = await ensureBucketExists(supabase);
        if (!bucketResult.success) {
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to initialize storage' })
            };
        }

        // Decode base64 image
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Check file size
        if (buffer.length > logoConfig.maxSize) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    error: `File too large. Maximum size for ${logoType} is ${logoConfig.maxSize / 1024}KB`
                })
            };
        }

        // Determine file extension
        const mimeMatch = imageData.match(/^data:image\/(\w+);base64,/);
        let extension = mimeMatch ? mimeMatch[1] : 'png';

        // Normalize extension
        if (extension === 'jpeg') extension = 'jpg';

        // Validate file type
        const allowedTypes = logoType === 'favicon'
            ? ['png', 'ico', 'jpg']
            : ['png', 'jpg', 'svg+xml', 'svg'];

        // Handle SVG mime type
        if (extension === 'svg+xml') extension = 'svg';

        if (!allowedTypes.includes(extension.toLowerCase())) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`
                })
            };
        }

        // Generate filename
        const timestamp = Date.now();
        const filename = `${logoConfig.folder}/${user.id}/${timestamp}.${extension}`;

        // Delete old logo if exists
        const currentUrl = coach[logoConfig.field];
        if (currentUrl) {
            const urlParts = currentUrl.split(`${BUCKET_NAME}/`);
            if (urlParts.length > 1) {
                console.log('Deleting old logo:', urlParts[1]);
                await supabase.storage.from(BUCKET_NAME).remove([urlParts[1]]);
            }
        }

        // Upload to storage
        const contentType = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filename, buffer, {
                contentType,
                upsert: true
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to upload logo' })
            };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filename);

        const logoUrl = urlData.publicUrl;

        // Update database
        const { error: updateError } = await supabase
            .from('coaches')
            .update({
                [logoConfig.field]: logoUrl,
                branding_updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            // Clean up uploaded file
            await supabase.storage.from(BUCKET_NAME).remove([filename]);
            throw updateError;
        }

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                logoUrl,
                logoType,
                message: `${logoType} uploaded successfully`
            })
        };

    } catch (error) {
        console.error('Error uploading logo:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
