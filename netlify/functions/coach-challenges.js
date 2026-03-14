// Coach Challenges API - CRUD for challenges, manage participants, view progress
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

// Valid challenge types
const CHALLENGE_TYPES = ['gym_checkin', 'weight_loss', 'consistency', 'water_intake', 'steps', 'custom'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - List challenges for a coach (with participant counts and progress)
    if (event.httpMethod === 'GET') {
      const { coachId, challengeId, status: filterStatus } = event.queryStringParameters || {};

      if (!coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId required' }) };
      }

      // Single challenge detail with full participants + progress
      if (challengeId) {
        const { data: challenge, error } = await supabase
          .from('coach_challenges')
          .select('*')
          .eq('id', challengeId)
          .eq('coach_id', coachId)
          .single();

        if (error) throw error;

        // Get participants with client info
        const { data: participants } = await supabase
          .from('challenge_participants')
          .select('*, clients(id, client_name, profile_photo_url)')
          .eq('challenge_id', challengeId)
          .order('joined_at', { ascending: true });

        // Get all progress for this challenge
        const { data: progress } = await supabase
          .from('challenge_progress')
          .select('*')
          .eq('challenge_id', challengeId)
          .order('log_date', { ascending: false });

        // Build leaderboard
        const leaderboard = buildLeaderboard(challenge, participants || [], progress || []);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ challenge, participants: participants || [], progress: progress || [], leaderboard })
        };
      }

      // List all challenges
      let query = supabase
        .from('coach_challenges')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false });

      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }

      const { data: challenges, error } = await query;
      if (error) throw error;

      // Get participant counts for each challenge
      const challengeIds = (challenges || []).map(c => c.id);
      let participantCounts = {};
      if (challengeIds.length > 0) {
        const { data: counts } = await supabase
          .from('challenge_participants')
          .select('challenge_id')
          .in('challenge_id', challengeIds);

        (counts || []).forEach(p => {
          participantCounts[p.challenge_id] = (participantCounts[p.challenge_id] || 0) + 1;
        });
      }

      const enriched = (challenges || []).map(c => ({
        ...c,
        participant_count: participantCounts[c.id] || 0
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ challenges: enriched })
      };
    }

    // POST - Create challenge or add participants
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { action } = body;

      if (action === 'add_participants') {
        const { challengeId, clientIds } = body;
        if (!challengeId || !clientIds?.length) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'challengeId and clientIds required' }) };
        }

        const rows = clientIds.map(clientId => ({
          challenge_id: challengeId,
          client_id: clientId,
          status: 'active'
        }));

        const { data, error } = await supabase
          .from('challenge_participants')
          .upsert(rows, { onConflict: 'challenge_id,client_id' })
          .select();

        if (error) throw error;

        // Send notification to each client
        for (const clientId of clientIds) {
          try {
            // Get challenge title for notification
            const { data: challenge } = await supabase
              .from('coach_challenges')
              .select('title')
              .eq('id', challengeId)
              .single();

            await supabase.from('notifications').insert({
              client_id: clientId,
              type: 'challenge_assigned',
              title: 'New Challenge!',
              message: `You've been added to: ${challenge?.title || 'a new challenge'}`,
              data: { challengeId },
              is_read: false
            });
          } catch (e) {
            console.error('Error sending challenge notification:', e);
          }
        }

        return { statusCode: 200, headers, body: JSON.stringify({ participants: data }) };
      }

      // Create new challenge
      const { coachId, title, description, challengeType, targetValue, targetUnit, frequency, startDate, endDate, assignTo, clientIds } = body;

      if (!coachId || !title || !startDate || !endDate) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'coachId, title, startDate, endDate required' }) };
      }

      if (challengeType && !CHALLENGE_TYPES.includes(challengeType)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid challenge type. Must be one of: ${CHALLENGE_TYPES.join(', ')}` }) };
      }

      const { data: challenge, error } = await supabase
        .from('coach_challenges')
        .insert({
          coach_id: coachId,
          title,
          description: description || null,
          challenge_type: challengeType || 'custom',
          target_value: targetValue || null,
          target_unit: targetUnit || null,
          frequency: frequency || 'daily',
          start_date: startDate,
          end_date: endDate,
          assign_to: assignTo || 'all',
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      // If assigning to all clients, fetch them and add as participants
      if (assignTo === 'all' || !clientIds?.length) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id')
          .eq('coach_id', coachId)
          .is('archived_at', null);

        if (clients?.length) {
          const rows = clients.map(c => ({
            challenge_id: challenge.id,
            client_id: c.id,
            status: 'active'
          }));
          await supabase.from('challenge_participants').insert(rows);

          // Notify all clients
          const notifications = clients.map(c => ({
            client_id: c.id,
            type: 'challenge_assigned',
            title: 'New Challenge!',
            message: `You've been added to: ${title}`,
            data: { challengeId: challenge.id },
            is_read: false
          }));
          await supabase.from('notifications').insert(notifications).catch(e => console.error('Notification error:', e));
        }
      } else if (clientIds?.length) {
        const rows = clientIds.map(id => ({
          challenge_id: challenge.id,
          client_id: id,
          status: 'active'
        }));
        await supabase.from('challenge_participants').insert(rows);

        const notifications = clientIds.map(id => ({
          client_id: id,
          type: 'challenge_assigned',
          title: 'New Challenge!',
          message: `You've been added to: ${title}`,
          data: { challengeId: challenge.id },
          is_read: false
        }));
        await supabase.from('notifications').insert(notifications).catch(e => console.error('Notification error:', e));
      }

      return { statusCode: 200, headers, body: JSON.stringify({ challenge }) };
    }

    // PUT - Update challenge status
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const { challengeId, coachId, status: newStatus, title, description, endDate } = body;

      if (!challengeId || !coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'challengeId and coachId required' }) };
      }

      const updates = { updated_at: new Date().toISOString() };
      if (newStatus) updates.status = newStatus;
      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (endDate) updates.end_date = endDate;

      const { data, error } = await supabase
        .from('coach_challenges')
        .update(updates)
        .eq('id', challengeId)
        .eq('coach_id', coachId)
        .select()
        .single();

      if (error) throw error;

      return { statusCode: 200, headers, body: JSON.stringify({ challenge: data }) };
    }

    // DELETE - Remove challenge
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body);
      const { challengeId, coachId } = body;

      if (!challengeId || !coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'challengeId and coachId required' }) };
      }

      const { error } = await supabase
        .from('coach_challenges')
        .delete()
        .eq('id', challengeId)
        .eq('coach_id', coachId);

      if (error) throw error;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('Coach challenges error:', error);
    return {
      statusCode: error.code === 'PGRST116' ? 404 : 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

// Build leaderboard from progress data
function buildLeaderboard(challenge, participants, progress) {
  const clientProgress = {};

  // Initialize each participant
  participants.forEach(p => {
    const client = p.clients || {};
    clientProgress[p.client_id] = {
      clientId: p.client_id,
      clientName: client.client_name || 'Unknown',
      profilePhoto: client.profile_photo_url || null,
      totalDays: 0,
      totalValue: 0,
      currentStreak: 0,
      bestValue: null,
      latestValue: null
    };
  });

  // Group progress by client
  const byClient = {};
  progress.forEach(p => {
    if (!byClient[p.client_id]) byClient[p.client_id] = [];
    byClient[p.client_id].push(p);
  });

  // Calculate stats per client
  Object.entries(byClient).forEach(([clientId, logs]) => {
    if (!clientProgress[clientId]) return;

    const completedLogs = logs.filter(l => l.completed || l.value > 0);
    clientProgress[clientId].totalDays = completedLogs.length;

    if (challenge.challenge_type === 'weight_loss') {
      // For weight loss, track the most recent value and total change
      const sorted = [...logs].sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
      if (sorted.length > 0) {
        clientProgress[clientId].latestValue = sorted[sorted.length - 1].value;
        if (sorted.length > 1) {
          clientProgress[clientId].totalValue = sorted[0].value - sorted[sorted.length - 1].value;
        }
      }
    } else {
      // For other types, sum up values or count completed days
      clientProgress[clientId].totalValue = completedLogs.reduce((sum, l) => sum + (l.value || 0), 0);
    }

    // Calculate streak (consecutive days)
    const dates = completedLogs.map(l => l.log_date).sort().reverse();
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];
      if (dates[i] === expectedStr) {
        streak++;
      } else {
        break;
      }
    }
    clientProgress[clientId].currentStreak = streak;
  });

  // Sort leaderboard
  const leaderboard = Object.values(clientProgress);
  if (challenge.challenge_type === 'weight_loss') {
    leaderboard.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
  } else if (challenge.challenge_type === 'consistency') {
    leaderboard.sort((a, b) => b.currentStreak - a.currentStreak || b.totalDays - a.totalDays);
  } else {
    leaderboard.sort((a, b) => b.totalDays - a.totalDays || b.totalValue - a.totalValue);
  }

  return leaderboard;
}
