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
      // Fetch item-specific details so notifications can reference what was actually logged
      const itemDetail = await fetchItemDetail(supabase, itemType, itemId);

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
          const subject = itemDetail.shortLabel || 'your PR';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = itemDetail.longLabel
            ? `${coachName} reacted with ${reaction} to ${itemDetail.longLabel}`
            : `${coachName} reacted with ${reaction} to your new personal record`;
          notifType = 'pr_reaction';
        } else if (itemType === 'workout') {
          const subject = itemDetail.shortLabel || 'your workout';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your completed workout'}`;
          notifType = 'workout_reaction';
        } else if (itemType === 'gym_checkin') {
          const subject = itemDetail.shortLabel || 'your gym check-in';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your gym check-in'}`;
          notifType = 'gym_checkin_reaction';
        } else if (itemType === 'checkin') {
          const subject = itemDetail.shortLabel || 'your check-in';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your weekly check-in'}`;
          notifType = 'checkin_reaction';
        } else if (itemType === 'photo') {
          const subject = itemDetail.shortLabel || 'your progress photo';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your progress photo'}`;
          notifType = 'photo_reaction';
        } else if (itemType === 'measurement') {
          const subject = itemDetail.shortLabel || 'your measurements';
          title = `${reaction} ${coachName} reacted to ${subject}!`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your logged measurements'}`;
          notifType = 'measurement_reaction';
        } else {
          const subject = itemDetail.shortLabel || 'your workout note';
          title = `${reaction} ${coachName} reacted to ${subject}`;
          message = `${coachName} reacted with ${reaction} to ${itemDetail.longLabel || 'your workout note'}`;
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
        const subject = itemDetail.shortLabel || (
          itemType === 'client_pr' ? 'your new PR'
          : itemType === 'workout' ? 'your workout'
          : itemType === 'gym_checkin' ? 'your gym check-in'
          : itemType === 'checkin' ? 'your check-in'
          : itemType === 'photo' ? 'your progress photo'
          : itemType === 'measurement' ? 'your measurements'
          : 'your workout note'
        );
        const chatMessage = `Reacted ${reaction} to ${subject}`;
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

// Format a numeric value compactly (drop trailing zeros: 230.0 -> 230, 12.50 -> 12.5)
function formatNum(n) {
  if (n == null || isNaN(n)) return null;
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
}

// Look up the item being reacted to and return short/long descriptive labels
// (e.g. "your measurement of 230 lbs"). Returns {} if nothing useful is found.
async function fetchItemDetail(supabase, itemType, itemId) {
  try {
    if (itemType === 'measurement') {
      const { data } = await supabase
        .from('client_measurements')
        .select('weight, weight_unit, body_fat_percentage, chest, waist, hips, measurement_unit')
        .eq('id', itemId)
        .maybeSingle();
      if (!data) return {};
      const parts = [];
      if (data.weight != null) {
        const unit = data.weight_unit || 'lbs';
        parts.push(`${formatNum(data.weight)} ${unit}`);
      }
      if (data.body_fat_percentage != null) {
        parts.push(`${formatNum(data.body_fat_percentage)}% body fat`);
      }
      if (data.waist != null) {
        const unit = data.measurement_unit || 'in';
        parts.push(`${formatNum(data.waist)} ${unit} waist`);
      }
      if (parts.length === 0) return {};
      const detail = parts.join(', ');
      return {
        shortLabel: `your measurement of ${detail}`,
        longLabel: `your measurement of ${detail}`
      };
    }

    if (itemType === 'checkin') {
      const { data } = await supabase
        .from('client_checkins')
        .select('weight, weight_unit, meal_plan_adherence, checkin_date')
        .eq('id', itemId)
        .maybeSingle();
      if (!data) return {};
      const parts = [];
      if (data.weight != null) {
        const unit = data.weight_unit || 'lbs';
        parts.push(`${formatNum(data.weight)} ${unit}`);
      }
      if (data.meal_plan_adherence != null) {
        parts.push(`${data.meal_plan_adherence}% adherence`);
      }
      if (parts.length === 0) return {};
      const detail = parts.join(', ');
      return {
        shortLabel: `your check-in (${detail})`,
        longLabel: `your check-in (${detail})`
      };
    }

    if (itemType === 'workout') {
      const { data } = await supabase
        .from('workout_logs')
        .select('workout_name, total_volume, workout_date')
        .eq('id', itemId)
        .maybeSingle();
      if (!data) return {};
      const name = (data.workout_name || '').trim();
      if (!name) return {};
      return {
        shortLabel: `your "${name}" workout`,
        longLabel: `your "${name}" workout`
      };
    }

    if (itemType === 'client_pr') {
      // PRs are stored as notifications; the message has the lift + numbers
      const { data } = await supabase
        .from('notifications')
        .select('message')
        .eq('id', itemId)
        .maybeSingle();
      const msg = (data?.message || '').trim();
      if (!msg) return {};
      // Try to pull out the "exercise: 100lbs x5" segment after the colon
      const colonIdx = msg.indexOf(':');
      const detail = colonIdx >= 0 ? msg.slice(colonIdx + 1).trim() : msg;
      const trimmed = detail.length > 80 ? detail.slice(0, 77) + '...' : detail;
      return {
        shortLabel: `your new PR (${trimmed})`,
        longLabel: `your new PR: ${trimmed}`
      };
    }

    if (itemType === 'photo') {
      const { data } = await supabase
        .from('progress_photos')
        .select('photo_type')
        .eq('id', itemId)
        .maybeSingle();
      const type = (data?.photo_type || '').replace(/_/g, ' ').trim();
      if (!type || type === 'progress') return {};
      return {
        shortLabel: `your ${type} photo`,
        longLabel: `your ${type} progress photo`
      };
    }

    if (itemType === 'gym_checkin') {
      const { data } = await supabase
        .from('gym_proofs')
        .select('proof_date')
        .eq('id', itemId)
        .maybeSingle();
      if (!data?.proof_date) return {};
      // proof_date is YYYY-MM-DD
      const d = new Date(data.proof_date + 'T00:00:00');
      if (isNaN(d.getTime())) return {};
      const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      return {
        shortLabel: `your ${formatted} gym check-in`,
        longLabel: `your gym check-in on ${formatted}`
      };
    }

    if (itemType === 'workout_note') {
      const { data } = await supabase
        .from('exercise_logs')
        .select('exercise_name, client_notes, client_voice_note_path')
        .eq('id', itemId)
        .maybeSingle();
      if (!data) return {};
      const exercise = (data.exercise_name || '').trim();
      const noteText = (data.client_notes || '').trim();
      const isVoice = !!data.client_voice_note_path && !noteText;
      if (!exercise && !noteText) return {};
      if (isVoice && exercise) {
        return {
          shortLabel: `your voice note on ${exercise}`,
          longLabel: `your voice note on ${exercise}`
        };
      }
      if (noteText) {
        const snippet = noteText.length > 60 ? noteText.slice(0, 57) + '...' : noteText;
        const subject = exercise
          ? `your note on ${exercise}: "${snippet}"`
          : `your note: "${snippet}"`;
        return { shortLabel: subject, longLabel: subject };
      }
      if (exercise) {
        return {
          shortLabel: `your note on ${exercise}`,
          longLabel: `your note on ${exercise}`
        };
      }
      return {};
    }

    return {};
  } catch (err) {
    console.error('Error fetching item detail for', itemType, itemId, err);
    return {};
  }
}
