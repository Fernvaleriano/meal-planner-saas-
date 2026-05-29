// Netlify Function to fetch CLIENT stories for a "group" (one coach + that
// coach's clients), grouped by author for an Instagram-style stories bar.
//
// Two viewer modes:
//   • Client viewer  (?clientId=&coachId=): sees group-visible stories from
//     teammates + the coach, PLUS their own stories (incl. coach-only ones).
//   • Coach viewer   (?coachId= only): sees ALL their clients' stories
//     (every visibility), so they can review and delete.
//
// 24h expiry is enforced here at query time (same approach as coach stories).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const empty = () => ({ statusCode: 200, headers: corsHeaders, body: JSON.stringify({ groups: [] }) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { clientId, coachId } = event.queryStringParameters || {};
    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }
    const viewerClientId = clientId ? Number(clientId) : null;
    const isCoachViewer = !viewerClientId;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stories, error } = await supabase
      .from('client_stories')
      .select('id, author_client_id, content_type, image_url, caption, quote_text, quote_author, visibility, created_at')
      .eq('coach_id', coachId)
      .gt('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching client stories:', error);
      return empty();
    }
    if (!stories || stories.length === 0) return empty();

    // Visibility filter for a client viewer: group stories from anyone, plus
    // any of the viewer's own stories (even coach-only ones). A coach viewer
    // sees everything.
    const visible = isCoachViewer
      ? stories
      : stories.filter(s => s.visibility === 'group' || s.author_client_id === viewerClientId);
    if (visible.length === 0) return empty();

    // Author profiles.
    const authorIds = [...new Set(visible.map(s => s.author_client_id))];
    const { data: authors } = await supabase
      .from('clients')
      .select('id, client_name, profile_photo_url, avatar_url')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map(a => [a.id, a]));

    // Which of these stories has the client viewer already seen?
    let viewedIds = new Set();
    if (!isCoachViewer) {
      const { data: views } = await supabase
        .from('client_story_views')
        .select('story_id')
        .eq('viewer_client_id', viewerClientId)
        .in('story_id', visible.map(s => s.id));
      viewedIds = new Set((views || []).map(v => v.story_id));
    }

    // Group by author.
    const groups = new Map();
    for (const s of visible) {
      const isSelf = !isCoachViewer && s.author_client_id === viewerClientId;
      const author = authorMap.get(s.author_client_id) || {};
      const authorName = author.client_name || 'Member';
      const authorAvatar = author.profile_photo_url || author.avatar_url || null;
      // Self stories don't need an "unseen" ring for their own author.
      const viewed = isSelf ? true : viewedIds.has(s.id);

      if (!groups.has(s.author_client_id)) {
        groups.set(s.author_client_id, {
          authorClientId: s.author_client_id,
          authorName,
          authorAvatar,
          isSelf,
          hasUnseen: false,
          stories: []
        });
      }
      const g = groups.get(s.author_client_id);
      if (!viewed) g.hasUnseen = true;
      g.stories.push({
        id: s.id,
        type: s.content_type,
        imageUrl: s.image_url,
        caption: s.caption,
        quoteText: s.quote_text,
        quoteAuthor: s.quote_author,
        visibility: s.visibility,
        createdAt: s.created_at,
        viewed,
        authorClientId: s.author_client_id,
        authorName,
        authorAvatar,
        // A client may delete their own stories; a coach may delete any.
        canDelete: isCoachViewer || isSelf
      });
    }

    // Order: the viewer's own group first, then groups with unseen stories,
    // then the rest — newest activity first within each band.
    const lastAt = g => g.stories[g.stories.length - 1]?.createdAt || '';
    const ordered = [...groups.values()].sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return lastAt(b).localeCompare(lastAt(a));
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ groups: ordered }) };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
  }
};
