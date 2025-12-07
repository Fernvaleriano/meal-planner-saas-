// Netlify Function to create a new coach story
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      coachId,
      contentType, // 'image', 'quote', 'link'
      imageUrl,
      imageBase64,
      caption,
      quoteText,
      quoteAuthor,
      linkUrl,
      linkTitle,
      linkPreviewImage,
      isHighlight,
      highlightId
    } = JSON.parse(event.body);

    if (!coachId || !contentType) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId and contentType required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let finalImageUrl = imageUrl;

    // If base64 image provided, upload to storage
    if (imageBase64 && contentType === 'image') {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `story_${coachId}_${Date.now()}.jpg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('story-images')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to upload image' }) };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('story-images')
        .getPublicUrl(fileName);

      finalImageUrl = urlData.publicUrl;
    }

    // Create story record
    const storyData = {
      coach_id: coachId,
      content_type: contentType,
      image_url: finalImageUrl || null,
      caption: caption || null,
      quote_text: quoteText || null,
      quote_author: quoteAuthor || null,
      link_url: linkUrl || null,
      link_title: linkTitle || null,
      link_preview_image: linkPreviewImage || null,
      is_highlight: isHighlight || false,
      highlight_id: highlightId || null,
      created_at: new Date().toISOString()
    };

    const { data: story, error } = await supabase
      .from('coach_stories')
      .insert(storyData)
      .select()
      .single();

    if (error) {
      console.error('Error creating story:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to create story' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, story })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
