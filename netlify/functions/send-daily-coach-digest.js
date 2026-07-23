/**
 * Send Daily Coach Digest
 *
 * Runs every morning and emails each coach a short triage list:
 *   - SLIPPING: clients who went inactive, have an unanswered check-in,
 *     or an unread message — each with a one-tap "Message" link.
 *   - WINNING: clients with new PRs or a strong workout week — so the
 *     coach can send praise, not just nudges.
 *
 * Uses the exact same signals as ai-daily-briefing.js (dashboard/command
 * center), but PUSHES them to the coach's inbox instead of waiting for a
 * page visit. Only sends when there is at least one item to show — a
 * quiet day means no email.
 *
 * Opt-out: reads coach_digest_settings (migration 025). No row (or no
 * table yet) = enabled, matching how other notification settings default.
 */

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_SLIPPING = 5;
const MAX_WINNING = 3;
const INACTIVE_DAYS_THRESHOLD = 5;
const STRONG_WEEK_WORKOUTS = 3;

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        let body = {};
        if (event.body) {
            try { body = JSON.parse(event.body); } catch (e) { /* not JSON */ }
        }

        // Simple ping test
        if (body.ping) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'pong' })
            };
        }

        // Scheduled runs come from Netlify's scheduler. Any other (manual HTTP)
        // trigger must be the master/admin account — otherwise this is an open
        // endpoint anyone could POST to and blast coach emails (send abuse/cost).
        const isScheduled = context?.clientContext?.custom?.scheduled === true ||
                           event.headers?.['x-netlify-scheduled'] === 'true';
        if (!isScheduled) {
            const { authenticateMaster } = require('./utils/auth');
            const { error: authError } = await authenticateMaster(event);
            if (authError) return authError;
        }

        const { createClient } = require('@supabase/supabase-js');
        const { sendEmail } = require('./utils/email-service');

        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qewqcjzlfqamqwbccapr.supabase.co';
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

        if (!SUPABASE_SERVICE_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_KEY not configured' })
            };
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Optional test mode: POST { coachId } sends only that coach's digest
        // (even on a quiet day this still runs the full pipeline for them).
        const onlyCoachId = body.coachId || null;

        const stats = {
            coachesChecked: 0,
            digestsSent: 0,
            skippedQuietDay: 0,
            skippedOptOut: 0,
            skippedNoEmail: 0,
            errors: 0
        };

        let coachQuery = supabase
            .from('coaches')
            .select('id, name, email, is_gym, brand_slug, brand_primary_color, brand_name, brand_logo_url, brand_email_logo_url');
        if (onlyCoachId) coachQuery = coachQuery.eq('id', onlyCoachId);

        const { data: coaches, error: coachError } = await coachQuery;
        if (coachError) {
            console.error('Error fetching coaches:', coachError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'Failed to fetch coaches' })
            };
        }

        // Opt-out settings — table may not exist yet; default is enabled.
        const digestSettings = {};
        try {
            const { data: settingsRows } = await supabase
                .from('coach_digest_settings')
                .select('coach_id, enabled');
            for (const s of (settingsRows || [])) digestSettings[s.coach_id] = s;
        } catch (e) {
            console.warn('coach_digest_settings not readable (defaulting to enabled):', e.message);
        }

        for (const coach of (coaches || [])) {
            const setting = digestSettings[coach.id];
            if (setting && setting.enabled === false) {
                stats.skippedOptOut++;
                continue;
            }
            if (!coach.email) {
                stats.skippedNoEmail++;
                continue;
            }

            try {
                stats.coachesChecked++;
                const digest = await buildDigest(supabase, coach.id);
                if (!digest) continue; // no clients

                if (digest.slipping.length === 0 && digest.winning.length === 0) {
                    stats.skippedQuietDay++;
                    continue;
                }

                const coachName = coach.name || coach.brand_name || 'Coach';
                const subject = digestSubject(digest);
                const { text, html } = renderDigestEmail({
                    coach,
                    coachName,
                    digest,
                    primaryColor: coach.brand_primary_color || '#2cb5a5',
                    brandName: coach.brand_name || 'Ziquecoach',
                    logoUrl: coach.brand_email_logo_url || coach.brand_logo_url
                });

                const result = await sendEmail({ to: coach.email, subject, text, html });
                if (result.success) {
                    stats.digestsSent++;
                } else {
                    console.error(`Digest send failed for coach ${coach.id}:`, result.error);
                    stats.errors++;
                }
            } catch (err) {
                console.error(`Digest error for coach ${coach.id}:`, err);
                stats.errors++;
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Daily coach digests processed',
                stats,
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message || 'Unknown error' })
        };
    }
};

/**
 * Build the slipping/winning lists for one coach.
 * Signal definitions intentionally mirror ai-daily-briefing.js so the email
 * and the command center never disagree about who needs attention.
 */
async function buildDigest(supabase, coachId) {
    const since7 = isoDaysAgo(7);
    const since14 = isoDaysAgo(14);
    const since3 = isoDaysAgo(3);

    const { data: clients } = await supabase
        .from('clients')
        .select('id, client_name, last_activity_at')
        .eq('coach_id', coachId)
        .eq('is_archived', false);

    const ids = (clients || []).map((c) => c.id);
    if (!ids.length) return null;

    const [checkinRes, workoutRes, prRes, msgRes] = await Promise.all([
        supabase.from('client_checkins').select('client_id, checkin_date, coach_responded_at').in('client_id', ids).gte('checkin_date', since7).order('checkin_date', { ascending: false }),
        supabase.from('workout_logs').select('client_id, workout_date').in('client_id', ids).gte('workout_date', since14),
        supabase.from('personal_records').select('client_id, exercise_name, record_type, record_value, achieved_date').in('client_id', ids).gte('achieved_date', since7),
        supabase.from('chat_messages').select('client_id, sender_type, is_read').eq('coach_id', coachId).gte('created_at', since3)
    ]);

    const checkins = checkinRes.data || [];
    const workouts = workoutRes.data || [];
    const prs = prRes.data || [];
    const msgs = msgRes.data || [];

    const activity = {};
    for (const c of clients) {
        activity[c.id] = { client: c, workoutsLast7: 0, workoutsLast14: 0, lastCheckin: null, pr: null, unreadMessage: false };
    }
    for (const w of workouts) {
        const a = activity[w.client_id]; if (!a) continue;
        if (w.workout_date >= since7) a.workoutsLast7 += 1;
        a.workoutsLast14 += 1;
    }
    for (const ci of checkins) {
        const a = activity[ci.client_id];
        if (a && (!a.lastCheckin || ci.checkin_date > a.lastCheckin.checkin_date)) a.lastCheckin = ci;
    }
    for (const p of prs) {
        const a = activity[p.client_id];
        if (a && (!a.pr || p.achieved_date > a.pr.achieved_date)) a.pr = p;
    }
    for (const m of msgs) {
        if (m.sender_type === 'client' && !m.is_read) {
            const a = activity[m.client_id]; if (a) a.unreadMessage = true;
        }
    }

    // One row per client; reasons combined; sorted worst-first.
    const slipping = [];
    const winning = [];

    for (const a of Object.values(activity)) {
        const c = a.client;
        const reasons = [];
        let severity = 0;

        if (a.workoutsLast14 === 0 && c.last_activity_at) {
            const inactiveDays = Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / 86400000);
            if (inactiveDays >= INACTIVE_DAYS_THRESHOLD) {
                reasons.push(`${inactiveDays} days inactive — no workouts logged`);
                severity = Math.max(severity, inactiveDays >= 10 ? 3 : 2);
            }
        }
        if (a.lastCheckin && a.lastCheckin.coach_responded_at == null) {
            reasons.push('check-in waiting for your reply');
            severity = Math.max(severity, 1);
        }
        if (a.unreadMessage) {
            reasons.push('unread message from them');
            severity = Math.max(severity, 2);
        }

        if (reasons.length) {
            slipping.push({ clientId: c.id, clientName: c.client_name || 'Client', reason: capitalize(reasons.join(' · ')), severity });
        }

        // Winning side — PR beats a strong week if both apply.
        if (a.pr) {
            const p = a.pr;
            winning.push({
                clientId: c.id,
                clientName: c.client_name || 'Client',
                fact: `New PR — ${p.exercise_name}: ${p.record_value}${p.record_type ? ' ' + p.record_type : ''}`,
                score: 2
            });
        } else if (a.workoutsLast7 >= STRONG_WEEK_WORKOUTS) {
            winning.push({
                clientId: c.id,
                clientName: c.client_name || 'Client',
                fact: `${a.workoutsLast7} workouts in the last 7 days — on a roll`,
                score: 1
            });
        }
    }

    slipping.sort((x, y) => y.severity - x.severity);
    winning.sort((x, y) => y.score - x.score);

    return {
        slipping: slipping.slice(0, MAX_SLIPPING),
        slippingTotal: slipping.length,
        winning: winning.slice(0, MAX_WINNING),
        winningTotal: winning.length,
        activeClients: clients.length
    };
}

function digestSubject(digest) {
    const s = digest.slippingTotal;
    const w = digest.winningTotal;
    if (s > 0 && w > 0) return `Morning check: ${s} client${s === 1 ? '' : 's'} slipping, ${w} winning`;
    if (s > 0) return `Morning check: ${s} client${s === 1 ? '' : 's'} need${s === 1 ? 's' : ''} you today`;
    return `Morning check: ${w} client${w === 1 ? '' : 's'} worth a shout-out`;
}

function renderDigestEmail({ coach, coachName, digest, primaryColor, brandName, logoUrl }) {
    const { coachUrl, coachHomeUrl } = require('./utils/coach-links');
    // Message + "full picture" buttons resolve to this coach/gym's own branded
    // web address, and the home button to their own dashboard (gym owners →
    // gym-dashboard, coaches → command center).
    const messageLink = (clientId) => coachUrl(coach, `coach-messages.html?clientId=${encodeURIComponent(clientId)}`);
    const homeLink = coachHomeUrl(coach);

    // Plain-text version
    const textLines = [`Hi ${coachName},`, '', 'Your morning check:'];
    if (digest.slipping.length) {
        textLines.push('', 'NEEDS YOU:');
        for (const s of digest.slipping) textLines.push(`- ${s.clientName}: ${s.reason} → ${messageLink(s.clientId)}`);
        if (digest.slippingTotal > digest.slipping.length) textLines.push(`  (+${digest.slippingTotal - digest.slipping.length} more on your dashboard)`);
    }
    if (digest.winning.length) {
        textLines.push('', 'WINNING (send some praise):');
        for (const w of digest.winning) textLines.push(`- ${w.clientName}: ${w.fact} → ${messageLink(w.clientId)}`);
    }
    textLines.push('', `Full picture: ${homeLink}`, '', brandName);
    const text = textLines.join('\n');

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${brandName}" style="max-width: 150px; height: auto; margin-bottom: 12px;">`
        : '';

    const row = (name, detail, clientId, accentColor) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border: 1px solid #e2e8f0; border-left: 4px solid ${accentColor}; border-radius: 10px; margin-bottom: 10px; background: #ffffff;">
            <div style="padding-right: 12px;">
                <div style="font-weight: 600; color: #1e293b; font-size: 15px;">${escapeHtml(name)}</div>
                <div style="color: #64748b; font-size: 13px; margin-top: 2px;">${escapeHtml(detail)}</div>
            </div>
            <a href="${messageLink(clientId)}" style="flex-shrink: 0; display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; white-space: nowrap;">Message →</a>
        </div>`;

    const slippingSection = digest.slipping.length
        ? `<h2 style="font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase; color: #dc2626; margin: 24px 0 12px;">Needs you</h2>
           ${digest.slipping.map((s) => row(s.clientName, s.reason, s.clientId, s.severity >= 3 ? '#dc2626' : '#f59e0b')).join('')}
           ${digest.slippingTotal > digest.slipping.length ? `<p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">+${digest.slippingTotal - digest.slipping.length} more on your dashboard</p>` : ''}`
        : '';

    const winningSection = digest.winning.length
        ? `<h2 style="font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase; color: #16a34a; margin: 24px 0 12px;">Winning — send some praise</h2>
           ${digest.winning.map((w) => row(w.clientName, w.fact, w.clientId, '#16a34a')).join('')}`
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background-color: ${primaryColor}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        ${logoHtml}
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Your Morning Check</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${digest.activeClients} active client${digest.activeClients === 1 ? '' : 's'}</p>
    </div>

    <div style="background: #f8fafc; padding: 24px 30px 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 15px; margin: 0;">Hi <strong>${escapeHtml(coachName)}</strong>, here's who to reach out to today:</p>
        ${slippingSection}
        ${winningSection}
        <div style="text-align: center; margin: 28px 0 8px;">
            <a href="${homeLink}" style="display: inline-block; color: ${primaryColor}; text-decoration: none; font-weight: 600; font-size: 14px;">See the full picture →</a>
        </div>
        <p style="margin-top: 24px; color: #94a3b8; font-size: 12px; text-align: center;">
            You get this each morning only when a client needs attention or deserves a shout-out.
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
        <p>${escapeHtml(brandName)}</p>
    </div>
</body>
</html>`;

    return { text, html };
}

function isoDaysAgo(d) { return new Date(Date.now() - d * 86400000).toISOString().split('T')[0]; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Scheduled function config — runs once daily at 12:00 UTC (morning in the US)
exports.config = {
    schedule: "0 12 * * *"
};
