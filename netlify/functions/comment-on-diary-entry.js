// Netlify Function to add/manage comments on diary entries
const { createClient } = require('@supabase/supabase-js');
const { authenticateRequest, authenticateClientAccess, forbiddenResponse } = require('./utils/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Every comment operation requires a logged-in user. Identity comes from the
  // verified token, NOT a client-supplied userId (previously spoofable to
  // impersonate the comment's owner or post as a coach).
  const { user: authUser, error: authErr } = await authenticateRequest(event);
  if (authErr) return authErr;

  // DELETE a comment
  if (event.httpMethod === 'DELETE') {
    try {
      const { commentId } = JSON.parse(event.body);
      const userId = authUser.id;

      if (!commentId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'commentId required' }) };
      }

      // Verify the user owns this comment (either as coach or client who wrote it)
      const { data: comment } = await supabase
        .from('diary_entry_comments')
        .select('coach_id, client_id, author_type')
        .eq('id', commentId)
        .single();

      if (!comment) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Comment not found' }) };
      }

      // Check if user is authorized to delete
      const isCoachAuthor = comment.author_type === 'coach' && comment.coach_id === userId;

      // For client authors, we need to check if the userId matches the client's user_id
      let isClientAuthor = false;
      if (comment.author_type === 'client') {
        const { data: client } = await supabase
          .from('clients')
          .select('user_id')
          .eq('id', comment.client_id)
          .single();
        isClientAuthor = client?.user_id === userId;
      }

      if (!isCoachAuthor && !isClientAuthor) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not authorized to delete this comment' }) };
      }

      const { error } = await supabase
        .from('diary_entry_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('Error deleting comment:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, deleted: true })
      };
    } catch (error) {
      console.error('Error:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
  }

  // PUT to update a comment
  if (event.httpMethod === 'PUT') {
    try {
      const { commentId, comment } = JSON.parse(event.body);
      const userId = authUser.id;

      if (!commentId || !comment) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'commentId and comment required' }) };
      }

      // Verify the user owns this comment
      const { data: existing } = await supabase
        .from('diary_entry_comments')
        .select('coach_id, client_id, author_type')
        .eq('id', commentId)
        .single();

      if (!existing) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Comment not found' }) };
      }

      const isCoachAuthor = existing.author_type === 'coach' && existing.coach_id === userId;
      let isClientAuthor = false;
      if (existing.author_type === 'client') {
        const { data: client } = await supabase
          .from('clients')
          .select('user_id')
          .eq('id', existing.client_id)
          .single();
        isClientAuthor = client?.user_id === userId;
      }

      if (!isCoachAuthor && !isClientAuthor) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Not authorized to edit this comment' }) };
      }

      const { data, error } = await supabase
        .from('diary_entry_comments')
        .update({
          comment: comment.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating comment:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, comment: data })
      };
    } catch (error) {
      console.error('Error:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
  }

  // POST to add a new comment
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { entryId, coachId, clientId, comment, authorType = 'coach', parentCommentId } = JSON.parse(event.body);

    if (!entryId || !clientId || !comment) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'entryId, clientId and comment required' }) };
    }

    // For coach comments, coachId is required
    if (authorType === 'coach' && !coachId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId required for coach comments' }) };
    }

    // Verify the claimed author identity against the token: a coach comment
    // must come from that coach; a client reply from that client.
    if (authorType === 'coach') {
      if (authUser.id !== coachId) return forbiddenResponse('Not authorized');
      // ...and the target client must belong to this coach.
      const { data: rel } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle();
      if (!rel) return forbiddenResponse('Not authorized for this client');
    } else {
      const ca = await authenticateClientAccess(event, clientId);
      if (ca.error) return ca.error;
      // ...and the entry being replied to must belong to this client.
      const { data: entryRow } = await supabase
        .from('food_diary_entries')
        .select('client_id')
        .eq('id', entryId)
        .maybeSingle();
      if (!entryRow || String(entryRow.client_id) !== String(clientId)) {
        return forbiddenResponse('Not authorized for this entry');
      }
    }

    // Get the coach_id from the entry if not provided (for client replies)
    let effectiveCoachId = coachId;
    if (authorType === 'client' && !coachId) {
      const { data: entry } = await supabase
        .from('food_diary_entries')
        .select('coach_id')
        .eq('id', entryId)
        .single();
      effectiveCoachId = entry?.coach_id;
    }

    // Insert the comment
    const { data, error } = await supabase
      .from('diary_entry_comments')
      .insert({
        entry_id: entryId,
        coach_id: effectiveCoachId,
        client_id: clientId,
        comment: comment.trim(),
        author_type: authorType,
        parent_comment_id: parentCommentId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving comment:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }

    // Create notification
    try {
      // Get the diary entry info
      const { data: entry } = await supabase
        .from('food_diary_entries')
        .select('food_name, meal_type, entry_date')
        .eq('id', entryId)
        .single();

      const foodName = entry?.food_name || 'your meal';
      const mealType = entry?.meal_type || 'meal';

      if (authorType === 'coach') {
        // Notify the client about coach comment
        const { data: coachProfile } = await supabase
          .from('coaches')
          .select('brand_name, name')
          .eq('id', effectiveCoachId)
          .single();

        const coachName = coachProfile?.brand_name || coachProfile?.name || 'Your coach';

        await supabase
          .from('notifications')
          .insert({
            client_id: clientId,
            type: 'diary_comment',
            title: `💬 Your coach commented on your ${mealType}`,
            message: `"${comment.trim()}"`,
            related_entry_id: entryId,
            metadata: {
              food_name: foodName,
              meal_type: mealType,
              entry_date: entry?.entry_date,
              comment_preview: comment.substring(0, 100),
              full_comment: comment.trim(),
              coach_name: coachName,
              comment_id: data.id
            },
            is_read: false,
            created_at: new Date().toISOString()
          });
      } else {
        // Notify the coach about client reply
        const { data: client } = await supabase
          .from('clients')
          .select('client_name')
          .eq('id', clientId)
          .single();

        const clientName = client?.client_name || 'Your client';

        await supabase
          .from('notifications')
          .insert({
            user_id: effectiveCoachId,
            type: 'diary_comment_reply',
            title: `💬 ${clientName} replied to your comment`,
            message: `"${comment.substring(0, 100)}${comment.length > 100 ? '...' : ''}"`,
            related_client_id: clientId,
            // Remember which diary post this reply belongs to so the dashboard
            // can deep-link the coach straight to the comment thread (not just
            // the client's profile).
            related_entry_id: entryId,
            metadata: {
              food_name: foodName,
              meal_type: mealType,
              entry_date: entry?.entry_date,
              comment_preview: comment.substring(0, 100),
              full_comment: comment.trim(),
              client_name: clientName,
              comment_id: data.id
            },
            is_read: false,
            created_at: new Date().toISOString()
          });
      }
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, comment: data })
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
