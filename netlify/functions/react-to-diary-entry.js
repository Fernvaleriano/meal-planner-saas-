// Netlify Function to save a reaction to a diary entry and notify the client
const { createClient } = require('@supabase/supabase-js');
const { authenticateGymMember, trainerClientIdScope, forbiddenResponse } = require('./utils/auth');

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

      // The gym owner or one of that gym's trainers may remove the reaction.
      const delAuth = await authenticateGymMember(event, coachId);
      if (delAuth.error) return delAuth.error;

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // A trainer may only touch reactions on their assigned clients' entries.
      const delScope = await trainerClientIdScope(event, supabase, coachId, delAuth);
      if (delScope) {
        const { data: rxRow } = await supabase
          .from('diary_entry_reactions')
          .select('client_id')
          .eq('entry_id', entryId)
          .eq('coach_id', coachId)
          .maybeSingle();
        if (rxRow && rxRow.client_id != null && !delScope.map(String).includes(String(rxRow.client_id))) {
          return forbiddenResponse('Not authorized for this client');
        }
      }

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
    const { entryId, coachId, clientId, reaction, entryType } = JSON.parse(event.body);

    if (!entryId || !coachId || !clientId || !reaction) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'entryId, coachId, clientId and reaction required' }) };
    }

    // The gym owner or one of that gym's trainers may react.
    const postAuth = await authenticateGymMember(event, coachId);
    if (postAuth.error) return postAuth.error;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // A trainer may only react to their assigned clients' entries.
    const postScope = await trainerClientIdScope(event, supabase, coachId, postAuth);
    if (postScope && !postScope.map(String).includes(String(clientId))) {
      return forbiddenResponse('Not authorized for this client');
    }

    // The target client must actually belong to this coach — otherwise a coach
    // could react to a stranger's entry and inject a notification into their feed.
    const { data: reactRel } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('coach_id', coachId)
      .maybeSingle();
    if (!reactRel) return forbiddenResponse('Not authorized for this client');

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

    // Create notification and chat message for the client (only for new reactions)
    if (isNewReaction || reactionChanged) {
      try {
        let mealType = 'meal';
        let foodName = 'your meal';
        let entryDate = null;

        if (entryType === 'workout') {
          // For workout reactions, get workout name
          const { data: workoutLog } = await supabase
            .from('workout_logs')
            .select('workout_name, workout_date')
            .eq('id', entryId)
            .single();
          mealType = 'workout';
          foodName = workoutLog?.workout_name || 'workout';
          entryDate = workoutLog?.workout_date || null;
        } else {
          // Get the diary entry to include food name
          const { data: entry } = await supabase
            .from('food_diary_entries')
            .select('food_name, meal_type, entry_date')
            .eq('id', entryId)
            .single();
          mealType = entry?.meal_type || 'meal';
          foodName = entry?.food_name || 'your meal';
          entryDate = entry?.entry_date || null;
        }

        // Get the coach's name/business
        const { data: coachProfile } = await supabase
          .from('coaches')
          .select('brand_name, name')
          .eq('id', coachId)
          .single();

        const coachName = coachProfile?.brand_name || coachProfile?.name || 'Your coach';

        // Create notification for the client with entry reference
        await supabase
          .from('notifications')
          .insert({
            client_id: clientId,
            type: 'diary_reaction',
            title: `${reaction} Your coach reacted to your ${mealType}`,
            message: `Your coach reacted with ${reaction} to "${foodName}"`,
            related_entry_id: entryType === 'workout' ? null : entryId,
            metadata: {
              food_name: foodName,
              meal_type: mealType,
              reaction: reaction,
              coach_name: coachName,
              entry_date: entryDate
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
