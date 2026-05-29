// Netlify Function to create a new CLIENT story (Instagram-style, 24h).
// Mirrors create-story.js (coach stories) but the author is a client, and the
// story is scoped to that client's coach so the coach + that coach's other
// clients (the "group") can see it. See migration 017_client_stories.sql.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Cap how many active (last-24h) stories a single client can have, to keep one
// client from flooding the whole group's stories bar.
const MAX_ACTIVE_STORIES_PER_CLIENT = 20;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      clientId,
      contentType, // 'image' | 'quote'
      imageUrl,
      imageBase64,
      caption,
      quoteText,
      quoteAuthor,
      visibility // 'group' | 'coach'
    } = JSON.parse(event.body || '{}');

    if (!clientId || !contentType) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'clientId and contentType required' }) };
    }
    if (!['image', 'quote'].includes(contentType)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid contentType' }) };
    }
    const shareWith = visibility === 'coach' ? 'coach' : 'group';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Resolve the client's coach. This both authorizes the post (client must
    // exist + have a coach) and gives us the group scope for the new story.
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, coach_id')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client || !client.coach_id) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Client not found or has no coach' }) };
    }
    const coachId = client.coach_id;

    // Validate content payload.
    if (contentType === 'quote' && !(quoteText && quoteText.trim())) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'quoteText required for quote stories' }) };
    }
    if (contentType === 'image' && !imageBase64 && !imageUrl) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'image required for image stories' }) };
    }

    // Anti-spam: cap active stories per client.
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: activeCount } = await supabase
      .from('client_stories')
      .select('id', { count: 'exact', head: true })
      .eq('author_client_id', clientId)
      .gt('created_at', twentyFourHoursAgo);
    if ((activeCount || 0) >= MAX_ACTIVE_STORIES_PER_CLIENT) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ error: "You've reached the limit of active stories. Try again later." })
      };
    }

    let finalImageUrl = imageUrl || null;

    if (imageBase64 && contentType === 'image') {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `client_story_${clientId}_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('story-images')
        .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to upload image' }) };
      }

      const { data: urlData } = supabase.storage.from('story-images').getPublicUrl(fileName);
      finalImageUrl = urlData.publicUrl;
    }

    const storyData = {
      author_client_id: clientId,
      coach_id: coachId,
      content_type: contentType,
      image_url: finalImageUrl,
      caption: caption ? String(caption).slice(0, 500) : null,
      quote_text: quoteText ? String(quoteText).slice(0, 500) : null,
      quote_author: quoteAuthor ? String(quoteAuthor).slice(0, 120) : null,
      visibility: shareWith,
      created_at: new Date().toISOString()
    };

    const { data: story, error } = await supabase
      .from('client_stories')
      .insert(storyData)
      .select()
      .single();

    if (error) {
      console.error('Error creating client story:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to create story' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, story }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
