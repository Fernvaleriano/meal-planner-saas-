// Netlify Function to save/remove a reaction on a priority activity item (PR or workout note)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // DELETE to remove a reaction
  if (event.httpMethod === 'DELETE') {
    try {
      const { coachId, itemType, itemId } = JSON.parse(event.body);

      if (!coachId || !itemType || !itemId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId, itemType and itemId required' }) };
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      const { error } = await supabase
        .from('activity_reactions')
        .delete()
        .eq('coach_id', coachId)
        .eq('item_type', itemType)
        .eq('item_id', String(itemId));

      if (error) {
        console.error('Error removing reaction:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, removed: true })
      };
    } catch (error) {
      console.error('Error:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { coachId, clientId, itemType, itemId, reaction } = JSON.parse(event.body);

    if (!coachId || !clientId || !itemType || !itemId || !reaction) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'coachId, clientId, itemType, itemId and reaction required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if this is a new reaction
    const { data: existing } = await supabase
      .from('activity_reactions')
      .select('id, reaction')
      .eq('coach_id', coachId)
      .eq('item_type', itemType)
      .eq('item_id', String(itemId))
      .single();

    const isNew = !existing;
    const changed = existing && existing.reaction !== reaction;

    // Upsert the reaction
    const { error } = await supabase
      .from('activity_reactions')
      .upsert({
        coach_id: coachId,
        client_id: clientId,
        item_type: itemType,
        item_id: String(itemId),
        reaction: reaction,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'coach_id,item_type,item_id'
      });

    if (error) {
      console.error('Error saving reaction:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }

    // Create notification for the client (only for new or changed reactions)
    if (isNew || changed) {
      try {
        // Get the coach's name
        const { data: coachProfile } = await supabase
          .from('coaches')
          .select('business_name')
          .eq('id', coachId)
          .single();

        const coachName = coachProfile?.business_name || 'Your coach';

        let title, message, notifType;
        if (itemType === 'client_pr') {
          title = `${reaction} ${coachName} reacted to your PR!`;
          message = `${coachName} reacted with ${reaction} to your new personal record`;
          notifType = 'pr_reaction';
        } else if (itemType === 'gym_checkin') {
          title = `${reaction} ${coachName} reacted to your gym check-in!`;
          message = `${coachName} reacted with ${reaction} to your gym check-in`;
          notifType = 'gym_checkin_reaction';
        } else if (itemType === 'checkin') {
          title = `${reaction} ${coachName} reacted to your check-in!`;
          message = `${coachName} reacted with ${reaction} to your weekly check-in`;
          notifType = 'checkin_reaction';
        } else {
          title = `${reaction} ${coachName} reacted to your workout note`;
          message = `${coachName} reacted with ${reaction} to your workout note`;
          notifType = 'note_reaction';
        }

        await supabase
          .from('notifications')
          .insert({
            client_id: clientId,
            type: notifType,
            title,
            message,
            metadata: {
              reaction,
              coach_name: coachName,
              item_type: itemType,
              item_id: itemId
            },
            is_read: false,
            created_at: new Date().toISOString()
          });
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the request if notification fails
      }

      // Send a chat message so the reaction shows in Messages
      try {
        const chatMessage = itemType === 'client_pr'
          ? `Reacted ${reaction} to your new PR!`
          : itemType === 'gym_checkin'
          ? `Reacted ${reaction} to your gym check-in!`
          : itemType === 'checkin'
          ? `Reacted ${reaction} to your check-in!`
          : `Reacted ${reaction} to your workout note`;
        await supabase
          .from('chat_messages')
          .insert({
            coach_id: coachId,
            client_id: parseInt(clientId),
            sender_type: 'coach',
            message: chatMessage
          });
      } catch (chatError) {
        console.error('Error sending reaction chat message:', chatError);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, isNew })
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
