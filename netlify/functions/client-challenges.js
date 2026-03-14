// Client Challenges API - View challenges, log progress
const { createClient } = require('@supabase/supabase-js');
const { getDefaultDate } = require('./utils/timezone');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // GET - List challenges the client is participating in
    if (event.httpMethod === 'GET') {
      const { clientId, challengeId, timezone } = event.queryStringParameters || {};

      if (!clientId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId required' }) };
      }

      const today = getDefaultDate(null, timezone);

      // Single challenge detail
      if (challengeId) {
        // Verify client is a participant
        const { data: participant } = await supabase
          .from('challenge_participants')
          .select('*')
          .eq('challenge_id', challengeId)
          .eq('client_id', clientId)
          .single();

        if (!participant) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not a participant in this challenge' }) };
        }

        const { data: challenge } = await supabase
          .from('coach_challenges')
          .select('*')
          .eq('id', challengeId)
          .single();

        // Get all participants with names for leaderboard
        const { data: allParticipants } = await supabase
          .from('challenge_participants')
          .select('client_id, clients(id, client_name, profile_photo_url)')
          .eq('challenge_id', challengeId);

        // Get all progress for leaderboard
        const { data: allProgress } = await supabase
          .from('challenge_progress')
          .select('*')
          .eq('challenge_id', challengeId)
          .order('log_date', { ascending: false });

        // Get client's own progress
        const myProgress = (allProgress || []).filter(p => p.client_id === parseInt(clientId));

        // Check if already logged today
        const todayLog = myProgress.find(p => p.log_date === today);

        // Build leaderboard
        const leaderboard = buildClientLeaderboard(challenge, allParticipants || [], allProgress || [], parseInt(clientId));

        // Calculate client's streak
        const streak = calculateStreak(myProgress, today);

        // Days remaining
        const endDate = new Date(challenge.end_date);
        const todayDate = new Date(today);
        const daysRemaining = Math.max(0, Math.ceil((endDate - todayDate) / (1000 * 60 * 60 * 24)));

        // Total days in challenge
        const startDate = new Date(challenge.start_date);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const daysCompleted = myProgress.filter(p => p.completed || p.value > 0).length;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            challenge,
            myProgress,
            todayLog: todayLog || null,
            streak,
            daysRemaining,
            totalDays,
            daysCompleted,
            leaderboard
          })
        };
      }

      // List all challenges for this client
      const { data: participations } = await supabase
        .from('challenge_participants')
        .select('challenge_id, status, joined_at')
        .eq('client_id', clientId)
        .eq('status', 'active');

      if (!participations?.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ challenges: [] }) };
      }

      const challengeIds = participations.map(p => p.challenge_id);

      const { data: challenges } = await supabase
        .from('coach_challenges')
        .select('*')
        .in('id', challengeIds)
        .in('status', ['active'])
        .order('start_date', { ascending: true });

      // Get client's progress for all challenges
      const { data: myProgress } = await supabase
        .from('challenge_progress')
        .select('challenge_id, log_date, completed, value')
        .eq('client_id', clientId)
        .in('challenge_id', challengeIds);

      // Get participant counts
      const { data: allParticipants } = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .in('challenge_id', challengeIds);

      // Enrich challenges with progress info
      const enriched = (challenges || []).map(c => {
        const progress = (myProgress || []).filter(p => p.challenge_id === c.id);
        const todayLog = progress.find(p => p.log_date === today);
        const daysCompleted = progress.filter(p => p.completed || p.value > 0).length;
        const participantCount = (allParticipants || []).filter(p => p.challenge_id === c.id).length;

        const endDate = new Date(c.end_date);
        const startDate = new Date(c.start_date);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const todayDate = new Date(today);
        const daysRemaining = Math.max(0, Math.ceil((endDate - todayDate) / (1000 * 60 * 60 * 24)));

        return {
          ...c,
          logged_today: !!todayLog,
          days_completed: daysCompleted,
          total_days: totalDays,
          days_remaining: daysRemaining,
          participant_count: participantCount,
          streak: calculateStreak(progress, today)
        };
      });

      return { statusCode: 200, headers, body: JSON.stringify({ challenges: enriched }) };
    }

    // POST - Log progress for a challenge
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { clientId, challengeId, value, completed, notes, timezone } = body;

      if (!clientId || !challengeId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId and challengeId required' }) };
      }

      // Verify client is a participant
      const { data: participant } = await supabase
        .from('challenge_participants')
        .select('id')
        .eq('challenge_id', challengeId)
        .eq('client_id', clientId)
        .single();

      if (!participant) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not a participant in this challenge' }) };
      }

      const today = getDefaultDate(null, timezone);

      // Upsert progress (one entry per day per challenge per client)
      const { data, error } = await supabase
        .from('challenge_progress')
        .upsert({
          challenge_id: challengeId,
          client_id: clientId,
          log_date: today,
          value: value || null,
          completed: completed !== undefined ? completed : true,
          notes: notes || null
        }, { onConflict: 'challenge_id,client_id,log_date' })
        .select()
        .single();

      if (error) throw error;

      return { statusCode: 200, headers, body: JSON.stringify({ progress: data }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('Client challenges error:', error);
    return {
      statusCode: error.code === 'PGRST116' ? 404 : 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

function calculateStreak(progressLogs, today) {
  const completedDates = progressLogs
    .filter(p => p.completed || p.value > 0)
    .map(p => p.log_date)
    .sort()
    .reverse();

  let streak = 0;
  const todayDate = new Date(today);
  for (let i = 0; i < completedDates.length; i++) {
    const expected = new Date(todayDate);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];
    if (completedDates[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function buildClientLeaderboard(challenge, participants, progress, myClientId) {
  const stats = {};

  participants.forEach(p => {
    const client = p.clients || {};
    stats[p.client_id] = {
      clientId: p.client_id,
      clientName: p.client_id === myClientId ? 'You' : (client.client_name || 'Unknown'),
      profilePhoto: client.profile_photo_url,
      isMe: p.client_id === myClientId,
      totalDays: 0,
      totalValue: 0
    };
  });

  progress.forEach(p => {
    if (!stats[p.client_id]) return;
    if (p.completed || p.value > 0) {
      stats[p.client_id].totalDays++;
      stats[p.client_id].totalValue += (p.value || 0);
    }
  });

  const leaderboard = Object.values(stats);
  if (challenge?.challenge_type === 'weight_loss') {
    leaderboard.sort((a, b) => b.totalValue - a.totalValue);
  } else {
    leaderboard.sort((a, b) => b.totalDays - a.totalDays || b.totalValue - a.totalValue);
  }

  // Add rank
  leaderboard.forEach((entry, i) => { entry.rank = i + 1; });

  return leaderboard;
}
