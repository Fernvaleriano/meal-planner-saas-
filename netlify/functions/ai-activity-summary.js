// Netlify Function for AI-powered coach assistant
// Supports GET for client data and POST for asking questions about clients
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Handle POST requests for asking questions
  if (event.httpMethod === 'POST') {
    return handleQuestion(event);
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const coachId = event.queryStringParameters?.coachId;

    if (!coachId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID is required' })
      };
    }

    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all active clients for this coach
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, client_name, last_activity_at, user_id, created_at')
      .eq('coach_id', coachId)
      .or('is_archived.eq.false,is_archived.is.null')
      .order('client_name', { ascending: true });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    if (!clients || clients.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          summary: "You don't have any active clients yet. Add your first client to start tracking their progress!",
          stats: {
            totalClients: 0,
            activeThisWeek: 0,
            inactiveClients: 0,
            checkedInThisWeek: 0,
            missedCheckIns: 0,
            pendingDietRequests: 0
          },
          insights: [],
          needsAttention: []
        })
      };
    }

    // Fetch recent check-ins (last 7 days)
    const { data: recentCheckins, error: checkinsError } = await supabase
      .from('client_checkins')
      .select('id, client_id, checkin_date, energy_level, stress_level, sleep_quality, hunger_level, meal_plan_adherence, wins, challenges, questions, request_new_diet, diet_request_reason, created_at')
      .eq('coach_id', coachId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (checkinsError && checkinsError.code !== '42P01') {
      console.error('Error fetching check-ins:', checkinsError);
    }

    // Fetch food diary entries to check engagement
    const { data: diaryEntries, error: diaryError } = await supabase
      .from('food_diary_entries')
      .select('id, client_id, created_at')
      .in('client_id', clients.map(c => c.id))
      .gte('created_at', sevenDaysAgo.toISOString());

    if (diaryError && diaryError.code !== '42P01') {
      console.error('Error fetching diary entries:', diaryError);
    }

    // Fetch pending diet requests (check-ins with request_new_diet = true that haven't been addressed)
    const { data: dietRequests, error: dietRequestsError } = await supabase
      .from('client_checkins')
      .select('id, client_id, diet_request_reason, created_at')
      .eq('coach_id', coachId)
      .eq('request_new_diet', true)
      .order('created_at', { ascending: false });

    // Fetch activity items (both dismissed/seen and pinned)
    const { data: activityItems, error: activityError } = await supabase
      .from('dismissed_activity_items')
      .select('client_id, reason, related_checkin_id, is_pinned, pinned_at')
      .eq('coach_id', coachId);

    if (activityError && activityError.code !== '42P01') {
      console.error('Error fetching activity items:', activityError);
    }

    // Create Sets for quick lookup of dismissed and pinned items
    const dismissedSet = new Set();
    const pinnedItems = [];
    (activityItems || []).forEach(item => {
      // Key format: clientId-reason or clientId-reason-checkinId
      const key = item.related_checkin_id
        ? `${item.client_id}-${item.reason}-${item.related_checkin_id}`
        : `${item.client_id}-${item.reason}`;

      if (item.is_pinned) {
        pinnedItems.push({
          clientId: item.client_id,
          reason: item.reason,
          relatedCheckinId: item.related_checkin_id,
          pinnedAt: item.pinned_at
        });
      } else {
        dismissedSet.add(key);
      }
    });

    // Calculate stats
    const clientStats = clients.map(client => {
      const lastActivity = client.last_activity_at ? new Date(client.last_activity_at) : null;
      const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)) : null;
      const isActiveThisWeek = lastActivity && lastActivity >= sevenDaysAgo;
      const hasPortalAccess = !!client.user_id;

      const clientCheckins = (recentCheckins || []).filter(c => c.client_id === client.id);
      const hasCheckedInThisWeek = clientCheckins.length > 0;
      const latestCheckin = clientCheckins[0];

      const clientDiaryCount = (diaryEntries || []).filter(d => d.client_id === client.id).length;
      const hasDietRequest = (dietRequests || []).some(r => r.client_id === client.id);

      return {
        id: client.id,
        name: client.client_name,
        hasPortalAccess,
        isActiveThisWeek,
        daysSinceActivity,
        hasCheckedInThisWeek,
        latestCheckin,
        diaryEntriesThisWeek: clientDiaryCount,
        hasPendingDietRequest: hasDietRequest,
        dietRequestReason: hasDietRequest ? (dietRequests || []).find(r => r.client_id === client.id)?.diet_request_reason : null
      };
    });

    // Aggregate stats
    const stats = {
      totalClients: clients.length,
      activeThisWeek: clientStats.filter(c => c.isActiveThisWeek).length,
      inactiveClients: clientStats.filter(c => c.hasPortalAccess && !c.isActiveThisWeek).length,
      clientsWithoutPortal: clientStats.filter(c => !c.hasPortalAccess).length,
      checkedInThisWeek: clientStats.filter(c => c.hasCheckedInThisWeek).length,
      missedCheckIns: clientStats.filter(c => c.hasPortalAccess && !c.hasCheckedInThisWeek).length,
      pendingDietRequests: clientStats.filter(c => c.hasPendingDietRequest).length,
      loggingFood: clientStats.filter(c => c.diaryEntriesThisWeek > 0).length
    };

    // Helper function to check if an item is dismissed
    const isDismissed = (clientId, reason, checkinId = null) => {
      const keyWithCheckin = `${clientId}-${reason}-${checkinId}`;
      const keyWithoutCheckin = `${clientId}-${reason}`;
      return dismissedSet.has(keyWithCheckin) || dismissedSet.has(keyWithoutCheckin);
    };

    // Identify clients needing attention
    const needsAttention = [];

    // Priority 1: Pending diet requests
    clientStats.filter(c => c.hasPendingDietRequest).forEach(c => {
      const dietRequest = (dietRequests || []).find(r => r.client_id === c.id);
      const checkinId = dietRequest?.id;

      // Skip if dismissed
      if (isDismissed(c.id, 'diet_request', checkinId)) return;

      needsAttention.push({
        clientId: c.id,
        clientName: c.name,
        priority: 'high',
        reason: 'diet_request',
        relatedCheckinId: checkinId,
        message: `Requested a new meal plan${c.dietRequestReason ? `: "${c.dietRequestReason}"` : ''}`
      });
    });

    // Priority 2: Low check-in scores (high stress, low energy, low adherence)
    clientStats.filter(c => c.latestCheckin).forEach(c => {
      const checkin = c.latestCheckin;
      const checkinId = checkin.id;

      if (checkin.stress_level >= 8 && !isDismissed(c.id, 'high_stress', checkinId)) {
        needsAttention.push({
          clientId: c.id,
          clientName: c.name,
          priority: 'high',
          reason: 'high_stress',
          relatedCheckinId: checkinId,
          message: `Reported high stress level (${checkin.stress_level}/10)`
        });
      }
      if (checkin.energy_level <= 3 && !isDismissed(c.id, 'low_energy', checkinId)) {
        needsAttention.push({
          clientId: c.id,
          clientName: c.name,
          priority: 'medium',
          reason: 'low_energy',
          relatedCheckinId: checkinId,
          message: `Reported low energy (${checkin.energy_level}/10)`
        });
      }
      if (checkin.meal_plan_adherence <= 40 && !isDismissed(c.id, 'low_adherence', checkinId)) {
        needsAttention.push({
          clientId: c.id,
          clientName: c.name,
          priority: 'medium',
          reason: 'low_adherence',
          relatedCheckinId: checkinId,
          message: `Low meal plan adherence (${checkin.meal_plan_adherence}%)`
        });
      }
    });

    // Priority 3: Inactive clients with portal access
    clientStats.filter(c => c.hasPortalAccess && c.daysSinceActivity > 14).forEach(c => {
      // Skip if dismissed
      if (isDismissed(c.id, 'inactive')) return;

      needsAttention.push({
        clientId: c.id,
        clientName: c.name,
        priority: 'low',
        reason: 'inactive',
        message: `No activity in ${c.daysSinceActivity} days`
      });
    });

    // Categorize items into briefing sections
    const actionRequired = needsAttention.filter(n => n.reason === 'diet_request');
    const checkInOn = needsAttention.filter(n => ['high_stress', 'low_energy', 'low_adherence', 'inactive'].includes(n.reason));

    // Build "Doing Well" section - clients with good engagement
    const doingWell = [];
    clientStats.filter(c => c.isActiveThisWeek && c.hasCheckedInThisWeek).forEach(c => {
      const adherence = c.latestCheckin?.meal_plan_adherence;
      if (adherence >= 80) {
        doingWell.push({
          clientId: c.id,
          clientName: c.name,
          message: `${adherence}% meal plan adherence this week`,
          reason: 'high_adherence'
        });
      } else if (c.diaryEntriesThisWeek >= 5) {
        doingWell.push({
          clientId: c.id,
          clientName: c.name,
          message: `Logging meals consistently (${c.diaryEntriesThisWeek} entries this week)`,
          reason: 'consistent_logging'
        });
      }
    });

    // Add pinned items with full client info
    const pinnedWithDetails = pinnedItems.map(pin => {
      const client = clientStats.find(c => c.id === pin.clientId);
      return {
        ...pin,
        clientName: client?.name || 'Unknown Client',
        message: getPinnedItemMessage(pin, client)
      };
    }).filter(p => p.clientName !== 'Unknown Client');

    // Generate AI briefing using Gemini REST API
    let briefing = {
      actionRequired: { items: actionRequired, narrative: '' },
      checkInOn: { items: checkInOn, narrative: '' },
      doingWell: { items: doingWell.slice(0, 5), narrative: '' },
      pinned: pinnedWithDetails
    };

    if (GEMINI_API_KEY) {
      try {
        const prompt = `You are a coaching assistant providing a quick daily briefing for a fitness/nutrition coach. Generate SHORT narrative summaries for each section (1-2 sentences max each, use specific client names).

DATA:
Action Required (${actionRequired.length} items):
${actionRequired.map(n => `- ${n.clientName}: ${n.message}`).join('\n') || 'None'}

Check In On (${checkInOn.length} items):
${checkInOn.map(n => `- ${n.clientName}: ${n.message}`).join('\n') || 'None'}

Doing Well (${doingWell.length} clients):
${doingWell.slice(0, 5).map(n => `- ${n.clientName}: ${n.message}`).join('\n') || 'All clients maintaining baseline'}

Overall Stats: ${stats.activeThisWeek}/${stats.totalClients} active this week, ${stats.checkedInThisWeek} check-ins submitted.

Return ONLY a JSON object with this exact structure (no markdown, no code blocks):
{"actionRequired":"brief narrative or empty string if none","checkInOn":"brief narrative or empty string if none","doingWell":"brief positive narrative"}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 400
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          try {
            // Clean up the response - remove markdown code blocks if present
            const cleanedText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const narratives = JSON.parse(cleanedText);
            briefing.actionRequired.narrative = narratives.actionRequired || '';
            briefing.checkInOn.narrative = narratives.checkInOn || '';
            briefing.doingWell.narrative = narratives.doingWell || '';
          } catch (parseError) {
            console.error('Failed to parse AI narratives:', parseError);
            // Use fallback narratives
            briefing = generateFallbackBriefing(briefing, stats);
          }
        } else {
          console.error('Gemini API error:', response.status);
          briefing = generateFallbackBriefing(briefing, stats);
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError);
        briefing = generateFallbackBriefing(briefing, stats);
      }
    } else {
      briefing = generateFallbackBriefing(briefing, stats);
    }

    // Build categorized client lists for the UI
    const activeClients = clientStats.filter(c => c.isActiveThisWeek).map(c => ({
      id: c.id,
      name: c.name,
      lastActive: c.daysSinceActivity === 0 ? 'Today' : c.daysSinceActivity === 1 ? 'Yesterday' : `${c.daysSinceActivity} days ago`
    }));

    const inactiveClients = clientStats.filter(c => c.hasPortalAccess && !c.isActiveThisWeek).map(c => ({
      id: c.id,
      name: c.name,
      daysSinceActivity: c.daysSinceActivity
    }));

    const checkedInClients = clientStats.filter(c => c.hasCheckedInThisWeek).map(c => ({
      id: c.id,
      name: c.name,
      adherence: c.latestCheckin?.meal_plan_adherence
    }));

    const missedCheckInClients = clientStats.filter(c => c.hasPortalAccess && !c.hasCheckedInThisWeek).map(c => ({
      id: c.id,
      name: c.name
    }));

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        briefing,
        stats,
        // Legacy fields for backwards compatibility
        summary: briefing.actionRequired.narrative || briefing.checkInOn.narrative || briefing.doingWell.narrative,
        needsAttention: needsAttention.slice(0, 10),
        activeClients,
        inactiveClients,
        checkedInClients,
        missedCheckInClients,
        generatedAt: now.toISOString()
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to generate activity summary',
        message: error.message
      })
    };
  }
};

// Helper function to get message for pinned items
function getPinnedItemMessage(pin, client) {
  switch (pin.reason) {
    case 'diet_request':
      return 'Requested a new meal plan';
    case 'high_stress':
      return `Reported high stress level`;
    case 'low_energy':
      return `Reported low energy`;
    case 'low_adherence':
      return `Low meal plan adherence`;
    case 'inactive':
      return `No recent activity`;
    default:
      return 'Needs attention';
  }
}

// Generate fallback briefing when AI is unavailable
function generateFallbackBriefing(briefing, stats) {
  // Action Required narrative
  if (briefing.actionRequired.items.length > 0) {
    const names = briefing.actionRequired.items.map(i => i.clientName).slice(0, 3);
    const extra = briefing.actionRequired.items.length > 3 ? ` and ${briefing.actionRequired.items.length - 3} more` : '';
    briefing.actionRequired.narrative = `${names.join(', ')}${extra} requested new meal plans.`;
  }

  // Check In On narrative
  if (briefing.checkInOn.items.length > 0) {
    const stressItems = briefing.checkInOn.items.filter(i => i.reason === 'high_stress');
    const inactiveItems = briefing.checkInOn.items.filter(i => i.reason === 'inactive');
    const parts = [];

    if (stressItems.length > 0) {
      parts.push(`${stressItems.map(i => i.clientName).join(', ')} reported high stress`);
    }
    if (inactiveItems.length > 0) {
      parts.push(`${inactiveItems.map(i => i.clientName).slice(0, 2).join(', ')} haven't logged in recently`);
    }
    briefing.checkInOn.narrative = parts.join('. ') + '.';
  }

  // Doing Well narrative
  if (briefing.doingWell.items.length > 0) {
    const names = briefing.doingWell.items.map(i => i.clientName).slice(0, 3);
    briefing.doingWell.narrative = `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} showing strong engagement this week.`;
  } else if (stats.activeThisWeek > 0) {
    briefing.doingWell.narrative = `${stats.activeThisWeek} of ${stats.totalClients} clients active this week.`;
  } else {
    briefing.doingWell.narrative = 'Waiting for client activity this week.';
  }

  return briefing;
}

// Legacy function for backwards compatibility
function generateFallbackSummary(stats, needsAttention) {
  const parts = [];

  if (stats.totalClients === 0) {
    return "You don't have any active clients yet. Add your first client to get started!";
  }

  if (stats.activeThisWeek > 0) {
    const percentage = Math.round((stats.activeThisWeek / stats.totalClients) * 100);
    parts.push(`${stats.activeThisWeek} of ${stats.totalClients} clients (${percentage}%) have been active this week`);
  }

  if (stats.checkedInThisWeek > 0) {
    parts.push(`${stats.checkedInThisWeek} client${stats.checkedInThisWeek > 1 ? 's' : ''} submitted check-ins`);
  }

  const highPriority = needsAttention.filter(n => n.priority === 'high');
  if (highPriority.length > 0) {
    if (highPriority.some(n => n.reason === 'diet_request')) {
      const count = highPriority.filter(n => n.reason === 'diet_request').length;
      parts.push(`${count} diet request${count > 1 ? 's' : ''} pending`);
    }
    if (highPriority.some(n => n.reason === 'high_stress')) {
      const count = highPriority.filter(n => n.reason === 'high_stress').length;
      parts.push(`${count} client${count > 1 ? 's' : ''} reported high stress`);
    }
  }

  if (stats.missedCheckIns > 0 && stats.missedCheckIns > stats.checkedInThisWeek) {
    parts.push(`${stats.missedCheckIns} client${stats.missedCheckIns > 1 ? 's' : ''} haven't checked in yet`);
  }

  return parts.join('. ') + '.';
}

// Handle POST requests for coach questions about their clients
async function handleQuestion(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { coachId, question } = body;

    if (!coachId || !question) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Coach ID and question are required' })
      };
    }

    if (!SUPABASE_SERVICE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'AI not configured' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all client data for this coach
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, client_name, last_activity_at, user_id, created_at, unit_preference, diet_type, allergies, disliked_foods, preferred_foods')
      .eq('coach_id', coachId)
      .or('is_archived.eq.false,is_archived.is.null')
      .order('client_name', { ascending: true });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    if (!clients || clients.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          response: "You don't have any active clients yet. Add your first client to start tracking their progress."
        })
      };
    }

    const clientIds = clients.map(c => c.id);

    // Fetch coach's own data (coach may also track their own fitness)
    // coachId is the user's auth ID from the coaches table
    let coachSelfData = null;
    try {
      // Check if coach has a client record (self-tracking) or weight logs
      const [coachClientResult, coachWeightResult, coachMeasurementsResult, coachNameResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, client_name, last_activity_at, unit_preference')
          .eq('user_id', coachId)
          .maybeSingle(),
        supabase
          .from('weight_logs')
          .select('weight, unit, created_at')
          .eq('client_id', coachId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('client_measurements')
          .select('weight, weight_unit, body_fat_percentage, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, measurement_unit, created_at')
          .eq('client_id', coachId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('coaches')
          .select('name, business_name')
          .eq('id', coachId)
          .maybeSingle()
      ]);

      const coachClient = coachClientResult.data;
      const coachWeights = coachWeightResult.data || [];
      const coachMeasurements = coachMeasurementsResult.data || [];
      const coachInfo = coachNameResult.data;

      // If coach has a client record, also fetch weight logs by that client ID
      let coachClientWeights = [];
      let coachClientMeasurements = [];
      if (coachClient) {
        const [cwResult, cmResult] = await Promise.all([
          supabase
            .from('weight_logs')
            .select('weight, unit, created_at')
            .eq('client_id', coachClient.id)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('client_measurements')
            .select('weight, weight_unit, body_fat_percentage, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, measurement_unit, created_at')
            .eq('client_id', coachClient.id)
            .order('created_at', { ascending: false })
            .limit(5)
        ]);
        coachClientWeights = cwResult.data || [];
        coachClientMeasurements = cmResult.data || [];
      }

      // Merge all coach weight data (dedup by picking whichever has more data)
      let allCoachWeights = coachClientWeights.length > coachWeights.length ? coachClientWeights : coachWeights;
      const allCoachMeasurements = coachClientMeasurements.length > coachMeasurements.length ? coachClientMeasurements : coachMeasurements;

      // Fall back to client_measurements.weight if weight_logs is empty
      // (client portal stores weight in client_measurements, not weight_logs)
      if (allCoachWeights.length === 0) {
        const measWithWeight = allCoachMeasurements.filter(m => m.weight != null);
        if (measWithWeight.length > 0) {
          allCoachWeights = measWithWeight.map(m => ({
            weight: m.weight,
            unit: m.weight_unit || coachClient?.unit_preference || 'kg',
            created_at: m.created_at
          }));
        }
      }

      if (allCoachWeights.length > 0 || allCoachMeasurements.length > 0 || coachClient) {
        coachSelfData = {
          name: coachInfo?.name || coachClient?.client_name || 'Coach',
          businessName: coachInfo?.business_name || null,
          latestWeight: allCoachWeights[0] || null,
          weightHistory: allCoachWeights.slice(0, 5),
          latestMeasurement: allCoachMeasurements[0] || null
        };
      }
    } catch (e) {
      console.warn('Could not fetch coach self data:', e);
    }

    // Fetch all data sources in parallel for comprehensive context
    const [
      checkinsResult,
      diaryResult,
      diaryEntriesResult,
      workoutLogsResult,
      exerciseLogsResult,
      workoutAssignmentsResult,
      mealPlansResult,
      measurementsResult,
      weightLogsResult,
      supplementIntakeResult,
      protocolsResult,
      goalsResult
    ] = await Promise.all([
      // Check-ins (14 days)
      supabase
        .from('client_checkins')
        .select('id, client_id, checkin_date, energy_level, stress_level, sleep_quality, hunger_level, meal_plan_adherence, wins, challenges, questions, request_new_diet, diet_request_reason, created_at')
        .eq('coach_id', coachId)
        .gte('created_at', fourteenDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      // Food diary entry counts (7 days)
      supabase
        .from('food_diary_entries')
        .select('id, client_id, created_at')
        .in('client_id', clientIds)
        .gte('created_at', sevenDaysAgo.toISOString()),
      // Food diary entries with macros (7 days)
      supabase
        .from('food_diary_entries')
        .select('id, client_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
        .in('client_id', clientIds)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500),
      // Workout logs (30 days)
      supabase
        .from('workout_logs')
        .select('id, client_id, workout_name, completed_at, duration_minutes, created_at')
        .in('client_id', clientIds)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500),
      // Exercise logs with sets/reps/weight via workout_logs join (30 days)
      supabase
        .from('exercise_logs')
        .select('id, workout_log_id, exercise_name, sets_data, total_sets, total_reps, total_volume, max_weight, is_pr, notes, created_at, workout_logs!inner(client_id)')
        .in('workout_logs.client_id', clientIds)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000),
      // Active workout assignments
      supabase
        .from('client_workout_assignments')
        .select('id, client_id, workout_data, is_active, start_date, end_date, name, created_at')
        .in('client_id', clientIds)
        .eq('is_active', true),
      // Meal plans (active/recent)
      supabase
        .from('coach_meal_plans')
        .select('id, client_id, plan_name, status, daily_calories, start_date, end_date, created_at')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(200),
      // Body measurements - most recent per client (no time limit) + 30-day history for trends
      supabase
        .from('client_measurements')
        .select('id, client_id, weight, weight_unit, body_fat_percentage, chest, waist, hips, left_arm, right_arm, left_thigh, right_thigh, measurement_unit, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(500),
      // Weight logs - most recent per client (no time limit) + history for trends
      supabase
        .from('weight_logs')
        .select('id, client_id, weight, unit, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(500),
      // Supplement intake (7 days) - join with protocols to get supplement name
      supabase
        .from('supplement_intake')
        .select('id, client_id, protocol_id, date, taken_at, created_at, client_protocols(name)')
        .in('client_id', clientIds)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0]),
      // Supplement protocols (name, timing, dose per protocol)
      supabase
        .from('client_protocols')
        .select('id, client_id, name, timing, dose')
        .in('client_id', clientIds),
      // Calorie/macro goals
      supabase
        .from('calorie_goals')
        .select('client_id, calorie_goal, protein_goal, carbs_goal, fat_goal')
        .in('client_id', clientIds)
    ]);

    // Safe data extraction (some tables might not exist)
    const recentCheckins = checkinsResult.data || [];
    const diaryEntries = diaryResult.data || [];
    const foodEntries = diaryEntriesResult.data || [];
    const workoutLogs = workoutLogsResult.data || [];
    const exerciseLogsRaw = exerciseLogsResult.data || [];
    // Flatten client_id from joined workout_logs
    const exerciseLogs = exerciseLogsRaw.map(e => ({
      ...e,
      client_id: e.workout_logs?.client_id || null
    }));
    const workoutAssignments = workoutAssignmentsResult.data || [];
    const mealPlans = mealPlansResult.data || [];
    const measurements = measurementsResult.data || [];
    const weightLogs = weightLogsResult.data || [];
    const supplementIntake = supplementIntakeResult.data || [];
    const protocols = protocolsResult.data || [];
    const goals = goalsResult.data || [];

    // Build comprehensive client data
    const clientData = clients.map(client => {
      const lastActivity = client.last_activity_at ? new Date(client.last_activity_at) : null;
      const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)) : null;
      const isActiveThisWeek = lastActivity && lastActivity >= sevenDaysAgo;
      const hasPortalAccess = !!client.user_id;

      const clientCheckins = recentCheckins.filter(c => c.client_id === client.id);
      const latestCheckin = clientCheckins[0];
      const diaryCount = diaryEntries.filter(d => d.client_id === client.id).length;

      // Nutrition data
      const clientFoodEntries = foodEntries.filter(f => f.client_id === client.id);
      const avgCalories = clientFoodEntries.length > 0
        ? Math.round(clientFoodEntries.reduce((sum, f) => sum + (f.calories || 0), 0) / Math.max(1, new Set(clientFoodEntries.map(f => f.created_at?.split('T')[0])).size))
        : null;
      const avgProtein = clientFoodEntries.length > 0
        ? Math.round(clientFoodEntries.reduce((sum, f) => sum + (f.protein || 0), 0) / Math.max(1, new Set(clientFoodEntries.map(f => f.created_at?.split('T')[0])).size))
        : null;

      // Goals
      const clientGoals = goals.find(g => g.client_id === client.id);

      // Workout data
      const clientWorkoutLogs = workoutLogs.filter(w => w.client_id === client.id);
      const clientExerciseLogs = exerciseLogs.filter(e => e.client_id === client.id);
      const clientAssignment = workoutAssignments.find(a => a.client_id === client.id);

      // Find PRs (heaviest weight per exercise)
      // Use the client's unit preference, fallback to sets_data unit, then 'lbs'
      const clientUnitPref = client.unit_preference === 'metric' ? 'kg' : 'lbs';
      const prsByExercise = {};
      const newPrsThisWeek = []; // NEW: Capture actual new PRs from this week

      clientExerciseLogs.forEach(log => {
        if (log.max_weight && log.exercise_name) {
          const key = log.exercise_name;
          // Get reps and unit from the specific set that achieved max weight
          const setsData = Array.isArray(log.sets_data) ? log.sets_data : [];
          const bestSet = setsData.find(s => Number(s.weight) === Number(log.max_weight));
          const repsAtMaxWeight = bestSet ? (Number(bestSet.reps) || 0) : (Number(log.total_reps) || 0);
          const unitFromSet = bestSet?.weightUnit || setsData[0]?.weightUnit || clientUnitPref;

          // Track all-time best per exercise
          if (!prsByExercise[key] || log.max_weight > prsByExercise[key].weight) {
            prsByExercise[key] = { weight: log.max_weight, reps: repsAtMaxWeight, unit: unitFromSet, date: log.created_at, isPr: log.is_pr };
          }

          // NEW: Capture actual new PRs achieved this week (where is_pr = true)
          const logDate = new Date(log.created_at);
          if (log.is_pr && logDate >= sevenDaysAgo) {
            newPrsThisWeek.push({
              exercise: log.exercise_name,
              weight: log.max_weight,
              reps: repsAtMaxWeight,
              unit: unitFromSet,
              date: log.created_at
            });
          }
        }
      });

      // Measurements & weight
      // Client portal stores weight in client_measurements (NOT weight_logs)
      // weight_logs is a legacy table - check both and prefer whichever has data
      const clientMeasurements = measurements.filter(m => m.client_id === client.id);
      const latestMeasurement = clientMeasurements[0];
      const clientWeightLogs = weightLogs.filter(w => w.client_id === client.id);

      // Get weight from weight_logs first, fall back to client_measurements.weight
      const measurementsWithWeight = clientMeasurements.filter(m => m.weight != null);
      let latestWeight, earliestWeight;
      if (clientWeightLogs.length > 0) {
        latestWeight = clientWeightLogs[0];
        earliestWeight = clientWeightLogs[clientWeightLogs.length - 1];
      } else if (measurementsWithWeight.length > 0) {
        // Use weight from client_measurements table
        latestWeight = {
          weight: measurementsWithWeight[0].weight,
          unit: measurementsWithWeight[0].weight_unit || client.unit_preference || 'kg',
          created_at: measurementsWithWeight[0].created_at
        };
        const earliest = measurementsWithWeight[measurementsWithWeight.length - 1];
        earliestWeight = {
          weight: earliest.weight,
          unit: earliest.weight_unit || client.unit_preference || 'kg',
          created_at: earliest.created_at
        };
      } else {
        latestWeight = null;
        earliestWeight = null;
      }

      // Meal plans
      const clientMealPlans = mealPlans.filter(p => p.client_id === client.id);
      const activePlan = clientMealPlans.find(p => p.status === 'published' || p.status === 'active');

      // Supplements
      const clientProtocols = protocols.filter(p => p.client_id === client.id);
      const clientSupplementIntake = supplementIntake.filter(s => s.client_id === client.id);

      return {
        name: client.client_name,
        hasPortalAccess,
        isActive: isActiveThisWeek,
        daysSinceActivity: daysSinceActivity !== null ? daysSinceActivity : 'never logged in',
        lastActivityAt: client.last_activity_at || null,
        joinedAt: client.created_at || null,
        dietType: client.diet_type || null,
        allergies: client.allergies || null,
        dislikedFoods: client.disliked_foods || null,
        preferredFoods: client.preferred_foods || null,
        hasCheckedInThisWeek: clientCheckins.some(c => new Date(c.created_at) >= sevenDaysAgo),
        latestCheckin: latestCheckin ? {
          date: latestCheckin.checkin_date,
          energy: latestCheckin.energy_level,
          stress: latestCheckin.stress_level,
          sleep: latestCheckin.sleep_quality,
          hunger: latestCheckin.hunger_level,
          adherence: latestCheckin.meal_plan_adherence,
          wins: latestCheckin.wins,
          challenges: latestCheckin.challenges,
          questions: latestCheckin.questions,
          requestedDiet: latestCheckin.request_new_diet,
          dietReason: latestCheckin.diet_request_reason
        } : null,
        diaryEntriesThisWeek: diaryCount,
        nutrition: {
          avgDailyCalories: avgCalories,
          avgDailyProtein: avgProtein,
          goals: clientGoals ? { calories: clientGoals.calorie_goal, protein: clientGoals.protein_goal, carbs: clientGoals.carbs_goal, fat: clientGoals.fat_goal } : null,
          // Recent food entries grouped by day (last 3 days, up to 30 entries)
          recentFoods: (() => {
            const sorted = clientFoodEntries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
            const byDay = {};
            sorted.forEach(f => {
              const day = f.created_at?.split('T')[0] || 'unknown';
              if (!byDay[day]) byDay[day] = [];
              byDay[day].push({ name: f.food_name, meal: f.meal_type, cal: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
            });
            return Object.entries(byDay).slice(0, 3).map(([date, foods]) => ({ date, foods }));
          })()
        },
        workouts: {
          totalThisMonth: clientWorkoutLogs.length,
          recentWorkouts: clientWorkoutLogs.slice(0, 5).map(w => ({ name: w.workout_name, date: w.completed_at || w.created_at, duration: w.duration_minutes })),
          recentExercises: clientExerciseLogs.slice(0, 10).map(e => {
            const eSetsData = Array.isArray(e.sets_data) ? e.sets_data : [];
            const eUnit = eSetsData[0]?.weightUnit || clientUnitPref;
            return { name: e.exercise_name, sets: e.total_sets, reps: Number(e.total_reps) || 0, weight: e.max_weight, unit: eUnit, volume: e.total_volume, isPr: e.is_pr };
          }),
          prs: Object.entries(prsByExercise).slice(0, 10).map(([exercise, data]) => ({ exercise, weight: data.weight, reps: data.reps, unit: data.unit, date: data.date })),
          newPrsThisWeek: newPrsThisWeek.slice(0, 10), // NEW: Actual new PRs achieved this week
          currentProgram: clientAssignment?.workout_data?.name || null
        },
        body: {
          latestWeight: latestWeight ? { value: latestWeight.weight, unit: latestWeight.unit, date: latestWeight.created_at } : null,
          weightChange: (latestWeight && earliestWeight && latestWeight !== earliestWeight)
            ? { change: Math.round((latestWeight.weight - earliestWeight.weight) * 10) / 10, unit: latestWeight.unit, period: '30 days' }
            : null,
          latestMeasurement: latestMeasurement ? {
            date: latestMeasurement.created_at,
            bodyFat: latestMeasurement.body_fat_percentage,
            waist: latestMeasurement.waist,
            chest: latestMeasurement.chest,
            hips: latestMeasurement.hips,
            leftArm: latestMeasurement.left_arm,
            rightArm: latestMeasurement.right_arm,
            leftThigh: latestMeasurement.left_thigh,
            rightThigh: latestMeasurement.right_thigh,
            measurementUnit: latestMeasurement.measurement_unit || 'in'
          } : null
        },
        mealPlan: activePlan ? { name: activePlan.plan_name, calories: activePlan.daily_calories, endDate: activePlan.end_date } : null,
        supplements: {
          protocolCount: clientProtocols.length,
          protocolNames: clientProtocols.map(p => p.name).filter(Boolean),
          takenThisWeek: clientSupplementIntake.length,
          totalExpectedThisWeek: clientProtocols.length * 7
        }
      };
    });

    // Helper: convert date to relative time string (timezone-agnostic)
    function timeAgo(date) {
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
      const diffMonths = Math.floor(diffDays / 30);
      return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    }

    // Build context string for AI
    const clientContext = clientData.map(c => {
      let parts = [];

      // Activity status with relative time (avoids timezone issues)
      if (c.lastActivityAt) {
        const actDate = new Date(c.lastActivityAt);
        parts.push(`last online: ${timeAgo(actDate)}`);
        if (c.isActive) parts.push('active this week');
        else parts.push(`inactive for ${c.daysSinceActivity} days`);
      } else {
        parts.push('never logged in');
      }
      if (c.joinedAt) {
        const joinDate = new Date(c.joinedAt);
        parts.push(`client since: ${joinDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
      }

      if (c.hasCheckedInThisWeek) parts.push('checked in');

      // Dietary preferences & restrictions
      if (c.dietType && c.dietType !== 'no_preference' && c.dietType !== 'standard') parts.push(`diet: ${c.dietType}`);
      if (c.allergies && c.allergies !== 'none') parts.push(`allergies: ${c.allergies}`);
      if (c.dislikedFoods) parts.push(`dislikes: ${c.dislikedFoods}`);
      if (c.preferredFoods) parts.push(`prefers: ${c.preferredFoods}`);

      // Check-in data
      if (c.latestCheckin) {
        const checkinDate = c.latestCheckin.date ? new Date(c.latestCheckin.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        let checkinParts = [];
        if (c.latestCheckin.energy) checkinParts.push(`energy: ${c.latestCheckin.energy}/5`);
        if (c.latestCheckin.stress) checkinParts.push(`stress: ${c.latestCheckin.stress}/5`);
        if (c.latestCheckin.sleep) checkinParts.push(`sleep: ${c.latestCheckin.sleep}/5`);
        if (c.latestCheckin.hunger) checkinParts.push(`hunger: ${c.latestCheckin.hunger}/5`);
        if (c.latestCheckin.adherence) checkinParts.push(`meal adherence: ${c.latestCheckin.adherence}%`);
        if (checkinParts.length > 0) parts.push(`check-in (${checkinDate}): ${checkinParts.join(', ')}`);
        if (c.latestCheckin.wins) parts.push(`wins: "${c.latestCheckin.wins}"`);
        if (c.latestCheckin.challenges) parts.push(`challenges: "${c.latestCheckin.challenges}"`);
        if (c.latestCheckin.questions) parts.push(`questions: "${c.latestCheckin.questions}"`);
        if (c.latestCheckin.requestedDiet) parts.push(`requested new diet${c.latestCheckin.dietReason ? ': ' + c.latestCheckin.dietReason : ''}`);
      }

      // Nutrition
      if (c.nutrition.avgDailyCalories) {
        let nutritionStr = `avg ${c.nutrition.avgDailyCalories} cal/day`;
        if (c.nutrition.avgDailyProtein) nutritionStr += `, ${c.nutrition.avgDailyProtein}g protein`;
        if (c.nutrition.goals) nutritionStr += ` (goal: ${c.nutrition.goals.calories} cal, ${c.nutrition.goals.protein}g protein)`;
        parts.push(nutritionStr);
      }
      if (c.diaryEntriesThisWeek > 0) parts.push(`${c.diaryEntriesThisWeek} food diary entries`);
      // Recent food details by day
      if (c.nutrition.recentFoods && c.nutrition.recentFoods.length > 0) {
        c.nutrition.recentFoods.forEach(day => {
          const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const foodList = day.foods.map(f => `${f.name || 'unknown'}(${f.cal || 0}cal)`).join(', ');
          parts.push(`${dayLabel} foods: ${foodList}`);
        });
      }

      // Workouts
      if (c.workouts.totalThisMonth > 0) {
        parts.push(`${c.workouts.totalThisMonth} workouts this month`);
        if (c.workouts.currentProgram) parts.push(`program: ${c.workouts.currentProgram}`);
        if (c.workouts.recentExercises.length > 0) {
          const exerciseStrs = c.workouts.recentExercises.slice(0, 5).map(e => {
            let str = e.name;
            if (e.weight) str += ` ${e.weight}${e.unit || 'lbs'}`;
            if (e.sets && e.reps) str += ` ${e.sets}x${e.reps}`;
            return str;
          });
          parts.push(`recent exercises: ${exerciseStrs.join(', ')}`);
        }
        if (c.workouts.prs.length > 0) {
          const prStrs = c.workouts.prs.slice(0, 3).map(p => `${p.exercise}: ${p.weight}${p.unit} for ${p.reps} reps`);
          parts.push(`all-time PRs: ${prStrs.join(', ')}`);
        }
        // NEW: Highlight new PRs achieved THIS WEEK specifically
        if (c.workouts.newPrsThisWeek && c.workouts.newPrsThisWeek.length > 0) {
          const newPrStrs = c.workouts.newPrsThisWeek.map(p => `${p.exercise}: ${p.weight}${p.unit} x ${p.reps} reps`);
          parts.push(`NEW PRs THIS WEEK: ${newPrStrs.join(', ')}`);
        }
      }

      // Body/weight with dates
      if (c.body.latestWeight) {
        const wDate = c.body.latestWeight.date ? new Date(c.body.latestWeight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        let weightStr = `weight: ${c.body.latestWeight.value}${c.body.latestWeight.unit}`;
        if (wDate) weightStr += ` (logged ${wDate})`;
        if (c.body.weightChange) {
          const sign = c.body.weightChange.change > 0 ? '+' : '';
          weightStr += ` ${sign}${c.body.weightChange.change}${c.body.weightChange.unit} change`;
        }
        parts.push(weightStr);
      }
      if (c.body.latestMeasurement) {
        const mDate = c.body.latestMeasurement.date ? new Date(c.body.latestMeasurement.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const mUnit = c.body.latestMeasurement.measurementUnit || 'in';
        let mParts = [];
        if (c.body.latestMeasurement.bodyFat) mParts.push(`body fat: ${c.body.latestMeasurement.bodyFat}%`);
        if (c.body.latestMeasurement.waist) mParts.push(`waist: ${c.body.latestMeasurement.waist}${mUnit}`);
        if (c.body.latestMeasurement.chest) mParts.push(`chest: ${c.body.latestMeasurement.chest}${mUnit}`);
        if (c.body.latestMeasurement.hips) mParts.push(`hips: ${c.body.latestMeasurement.hips}${mUnit}`);
        if (c.body.latestMeasurement.leftArm) mParts.push(`L arm: ${c.body.latestMeasurement.leftArm}${mUnit}`);
        if (c.body.latestMeasurement.rightArm) mParts.push(`R arm: ${c.body.latestMeasurement.rightArm}${mUnit}`);
        if (c.body.latestMeasurement.leftThigh) mParts.push(`L thigh: ${c.body.latestMeasurement.leftThigh}${mUnit}`);
        if (c.body.latestMeasurement.rightThigh) mParts.push(`R thigh: ${c.body.latestMeasurement.rightThigh}${mUnit}`);
        if (mParts.length > 0) {
          parts.push(`measurements${mDate ? ` (${mDate})` : ''}: ${mParts.join(', ')}`);
        }
      }

      // Meal plan
      if (c.mealPlan) {
        parts.push(`meal plan: "${c.mealPlan.name}" (${c.mealPlan.calories} cal${c.mealPlan.endDate ? ', ends ' + c.mealPlan.endDate : ''})`);
      }

      // Supplements
      if (c.supplements.protocolCount > 0) {
        parts.push(`supplements (${c.supplements.protocolNames.join(', ')}): ${c.supplements.takenThisWeek}/${c.supplements.totalExpectedThisWeek} taken this week`);
      }

      return `- ${c.name}: ${parts.join(', ')}`;
    }).join('\n');

    // Calculate summary stats
    const activeCount = clientData.filter(c => c.isActive).length;
    const checkedInCount = clientData.filter(c => c.hasCheckedInThisWeek).length;
    const inactiveOver7Days = clientData.filter(c => typeof c.daysSinceActivity === 'number' && c.daysSinceActivity > 7).length;
    const dietRequests = clientData.filter(c => c.latestCheckin?.requestedDiet).length;
    const highStress = clientData.filter(c => c.latestCheckin?.stress >= 8).length;
    const totalWorkouts = clientData.reduce((sum, c) => sum + c.workouts.totalThisMonth, 0);
    const clientsWithNewPrs = clientData.filter(c => c.workouts.newPrsThisWeek && c.workouts.newPrsThisWeek.length > 0);
    const totalNewPrsThisWeek = clientData.reduce((sum, c) => sum + (c.workouts.newPrsThisWeek?.length || 0), 0);

    // Build coach self-data context if available
    let coachSelfContext = '';
    if (coachSelfData) {
      const parts = [];
      parts.push(`Name: ${coachSelfData.name}`);
      if (coachSelfData.businessName) parts.push(`Business: ${coachSelfData.businessName}`);
      if (coachSelfData.latestWeight) {
        const w = coachSelfData.latestWeight;
        const wDate = new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        parts.push(`Current weight: ${w.weight}${w.unit} (logged ${wDate})`);
        if (coachSelfData.weightHistory.length >= 2) {
          const oldest = coachSelfData.weightHistory[coachSelfData.weightHistory.length - 1];
          const change = Math.round((w.weight - oldest.weight) * 10) / 10;
          const sign = change > 0 ? '+' : '';
          const oldDate = new Date(oldest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          parts.push(`Weight change: ${sign}${change}${w.unit} since ${oldDate}`);
        }
      }
      if (coachSelfData.latestMeasurement) {
        const m = coachSelfData.latestMeasurement;
        const mDate = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const mUnit = m.measurement_unit || 'in';
        let mParts = [`Measurements (${mDate}):`];
        if (m.body_fat_percentage) mParts.push(`body fat ${m.body_fat_percentage}%`);
        if (m.chest) mParts.push(`chest ${m.chest}${mUnit}`);
        if (m.waist) mParts.push(`waist ${m.waist}${mUnit}`);
        if (m.hips) mParts.push(`hips ${m.hips}${mUnit}`);
        if (m.left_arm) mParts.push(`L arm ${m.left_arm}${mUnit}`);
        if (m.right_arm) mParts.push(`R arm ${m.right_arm}${mUnit}`);
        if (m.left_thigh) mParts.push(`L thigh ${m.left_thigh}${mUnit}`);
        if (m.right_thigh) mParts.push(`R thigh ${m.right_thigh}${mUnit}`);
        parts.push(mParts.join(', '));
      }
      coachSelfContext = `\nYOUR DATA (the coach asking this question):
${parts.join('\n')}
`;
    }

    const prompt = `You are an AI assistant helping a fitness/nutrition coach manage their clients. You have access to comprehensive data including workouts, exercises, personal records, nutrition, body measurements, meal plans, supplements, check-ins, and more. You also have access to the coach's own personal fitness data when available. Answer the coach's question thoroughly based on the data below. When the coach says "my" or "me", they are referring to themselves (the coach), not a client.

SUMMARY:
- Total clients: ${clients.length}
- Active this week: ${activeCount}
- Checked in this week: ${checkedInCount}
- Inactive over 7 days: ${inactiveOver7Days}
- Pending diet requests: ${dietRequests}
- Reporting high stress: ${highStress}
- Total workouts logged (30 days): ${totalWorkouts}
- Clients who hit NEW PRs this week: ${clientsWithNewPrs.length}${clientsWithNewPrs.length > 0 ? ` (${clientsWithNewPrs.map(c => c.name).join(', ')})` : ''}
- Total new PRs achieved this week: ${totalNewPrsThisWeek}
${coachSelfContext}
CLIENT DETAILS:
${clientContext}

COACH'S QUESTION: "${question}"

RESPONSE FORMAT:
You MUST organize your response into sections using this exact format. Each section starts with a header on its own line wrapped in square brackets. Only include sections that are relevant to the question - skip sections with no useful info.

Available sections (use only what applies):
[Action Needed] - Urgent items needing immediate coach action (diet requests, high stress, etc.)
[Check-ins & Wellness] - Energy, stress, adherence, and general wellbeing data
[Nutrition] - Diet tracking, calorie/macro data, meal plan adherence
[Training & PRs] - Workouts, exercises, personal records, program progress
[Body Composition] - Weight changes, measurements, trends
[Highlights] - Positive progress, wins, and clients doing well
[Your Info] - Use when coach asks about their own data (weight, measurements, etc.)
[Summary] - General overview when the question is broad

Example format:
[Action Needed]
Sarah requested a new meal plan due to digestive issues. Mike reported stress at 9/10 - consider reaching out.

[Training & PRs]
3 clients hit new PRs this week. John bench pressed 225lbs x 5 (up from 215lbs). Lisa squatted 185lbs x 3.

IMPORTANT RULES:
1. Write in plain text only - no special characters, no emojis, no asterisks, no markdown formatting
2. Use specific client names when relevant
3. Be concise within each section - short, scannable sentences
4. If listing clients, use simple numbered lists (1. 2. 3.) or just commas
5. For workout/exercise questions, include specific weights, sets, reps, and PRs when available
6. For nutrition questions, compare actual intake vs goals when both are available
7. For body composition questions, mention weight changes and trends
8. If the data needed to answer is not available, say so honestly rather than guessing
9. Provide a thorough response - use as many words as needed to fully answer the question without cutting short
10. IMPORTANT: Always use the exact weight units provided in the data (kg or lbs). Never convert or assume units - use exactly what is shown in the client data
11. You MUST use the [Section Name] format for headers. Do not skip this formatting.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'AI request failed' })
      };
    }

    const data = await response.json();
    let aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up any markdown that slipped through
    aiResponse = aiResponse
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`/g, '')
      .trim();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ response: aiResponse })
    };

  } catch (error) {
    console.error('Question handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to process question', message: error.message })
    };
  }
}
