// Netlify Function to generate AI-powered client briefing for coaches
// Provides a clean, narrative-style summary with specific client names and actionable insights
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
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
      .select('id, client_id, checkin_date, energy_level, stress_level, meal_plan_adherence, request_new_diet, diet_request_reason, created_at')
      .eq('coach_id', coachId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (checkinsError && checkinsError.code !== '42P01') {
      console.error('Error fetching check-ins:', checkinsError);
    }

    // Fetch food diary entries to check engagement
    const { data: diaryEntries, error: diaryError } = await supabase
      .from('food_diary')
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
