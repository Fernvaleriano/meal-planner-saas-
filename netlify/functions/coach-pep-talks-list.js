// Netlify Function: returns the coach's own Pep Talks with view stats so the
// dashboard widget can render the manage list (active + archived).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { coachId, includeArchived } = event.queryStringParameters || {};

    if (!coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase
      .from('pep_talks')
      .select('id, title, body, video_url, video_duration_seconds, recipient_type, archived, archived_at, created_at')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });

    if (includeArchived !== 'true') {
      query = query.eq('archived', false);
    }

    const { data: pepTalks, error } = await query;

    if (error) {
      console.error('Error fetching pep talks:', error);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pepTalks: [] }) };
    }

    if (!pepTalks || pepTalks.length === 0) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ pepTalks: [] }) };
    }

    const pepTalkIds = pepTalks.map(p => p.id);

    // Total recipients per pep talk: for 'all' it's the coach's full client
    // count; for 'specific' it's the count of pep_talk_recipients rows.
    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId);

    const { data: recipientRows } = await supabase
      .from('pep_talk_recipients')
      .select('pep_talk_id')
      .in('pep_talk_id', pepTalkIds);

    const specificCounts = {};
    (recipientRows || []).forEach(r => {
      specificCounts[r.pep_talk_id] = (specificCounts[r.pep_talk_id] || 0) + 1;
    });

    // Viewed counts per pep talk.
    const { data: viewRows } = await supabase
      .from('pep_talk_views')
      .select('pep_talk_id, viewed_at')
      .in('pep_talk_id', pepTalkIds);

    const viewedCounts = {};
    (viewRows || []).forEach(v => {
      if (v.viewed_at) {
        viewedCounts[v.pep_talk_id] = (viewedCounts[v.pep_talk_id] || 0) + 1;
      }
    });

    const formatted = pepTalks.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      videoUrl: p.video_url,
      videoDurationSeconds: p.video_duration_seconds,
      recipientType: p.recipient_type,
      archived: p.archived,
      archivedAt: p.archived_at,
      createdAt: p.created_at,
      totalRecipients: p.recipient_type === 'all' ? (totalClients || 0) : (specificCounts[p.id] || 0),
      viewedCount: viewedCounts[p.id] || 0
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ pepTalks: formatted })
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
