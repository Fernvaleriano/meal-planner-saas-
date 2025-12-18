// Netlify Function to save a reaction to a diary entry and notify the client
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
      const { entryId, coachId } = JSON.parse(event.body);

      if (!entryId || !coachId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'entryId and coachId required' }) };
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      const { error } = await supabase
        .from('diary_entry_reactions')
        .delete()
        .eq('entry_id', entryId)
        .eq('coach_id', coachId);

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
    const { entryId, coachId, clientId, reaction } = JSON.parse(event.body);

    if (!entryId || !coachId || !clientId || !reaction) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'entryId, coachId, clientId and reaction required' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if this is a new reaction (not an update)
    const { data: existingReaction } = await supabase
      .from('diary_entry_reactions')
      .select('id, reaction')
      .eq('entry_id', entryId)
      .eq('coach_id', coachId)
      .single();

    const isNewReaction = !existingReaction;
    const reactionChanged = existingReaction && existingReaction.reaction !== reaction;

    // Insert or update reaction
    const { error } = await supabase
      .from('diary_entry_reactions')
      .upsert({
        entry_id: entryId,
        coach_id: coachId,
        client_id: clientId,
        reaction: reaction,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'entry_id,coach_id'
      });

    if (error) {
      console.error('Error saving reaction:', error);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) };
    }

    // Create notification for the client (only for new reactions)
    if (isNewReaction || reactionChanged) {
      try {
        // Get the diary entry to include food name
        const { data: entry } = await supabase
          .from('food_diary_entries')
          .select('food_name, meal_type, entry_date')
          .eq('id', entryId)
          .single();

        // Get the coach's name/business
        const { data: coachProfile } = await supabase
          .from('coaches')
          .select('business_name')
          .eq('id', coachId)
          .single();

        const coachName = coachProfile?.business_name || 'Your coach';
        const foodName = entry?.food_name || 'your meal';
        const mealType = entry?.meal_type || 'meal';

        // Create notification for the client with entry reference
        await supabase
          .from('notifications')
          .insert({
            client_id: clientId,
            type: 'diary_reaction',
            title: `${reaction} Your coach reacted to your ${mealType}`,
            message: `Your coach reacted with ${reaction} to "${foodName}"`,
            related_entry_id: entryId,
            metadata: {
              food_name: entry?.food_name,
              meal_type: entry?.meal_type,
              entry_date: entry?.entry_date,
              reaction: reaction,
              coach_name: coachName
            },
            is_read: false,
            created_at: new Date().toISOString()
          });
      } catch (notifError) {
        console.error('Error creating notification:', notifError);
        // Don't fail the request if notification fails
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, isNew: isNewReaction })
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
