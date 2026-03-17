/**
 * Voice Commander v2 — Siri-like voice agent for coaches
 *
 * Drop <link rel="stylesheet" href="/css/voice-commander.css"> and
 * <script src="/js/voice-commander.js"></script> on any coach page.
 * Self-contained: injects the FAB + overlay and handles all logic.
 *
 * v2 Features:
 *   - Chained commands: "Go to Fernando's account and check his workouts"
 *   - Data queries: "Did Fernando finish today's workout?", "Any new messages?"
 *   - Context awareness: "Message this client", "Check their workouts"
 *   - Navigation, theme toggle, search, quick actions
 */
(function () {
    'use strict';

    // ── Check browser support ──
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // ── Icons ──
    var ICONS = {
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
        x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
        check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        alertCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };

    // ── Navigation map ──
    var NAV_ROUTES = [
        { keywords: ['dashboard', 'home', 'main'],                      url: '/dashboard.html',            label: 'Dashboard' },
        { keywords: ['client', 'clients', 'manage client'],             url: '/manage-clients.html',       label: 'Clients' },
        { keywords: ['client feed', 'feed', 'activity'],                url: '/client-feed.html',          label: 'Client Feed' },
        { keywords: ['message', 'messages', 'chat', 'messaging'],       url: '/coach-messages.html',       label: 'Messages' },
        { keywords: ['recipe', 'recipes', 'manage recipe'],             url: '/manage-recipes.html',       label: 'Recipes' },
        { keywords: ['planner', 'meal plan', 'nutrition', 'meal'],       url: '/planner.html',              label: 'Nutrition Planner' },
        { keywords: ['workout', 'workouts', 'exercise'],                url: '/coach-workouts.html',       label: 'Workouts' },
        { keywords: ['workout plan', 'workout plans'],                  url: '/coach-workout-plans.html',  label: 'Workout Plans' },
        { keywords: ['challenge', 'challenges'],                        url: '/coach-challenges.html',     label: 'Challenges' },
        { keywords: ['profile', 'my profile'],                          url: '/coach-profile.html',        label: 'My Profile' },
        { keywords: ['supplement', 'supplements', 'protocol'],          url: '/supplement-protocols.html',  label: 'Supplements' },
        { keywords: ['reminder', 'reminders'],                          url: '/reminder-settings.html',    label: 'Reminders' },
        { keywords: ['billing', 'subscription', 'payment'],             url: '/coach-billing.html',        label: 'Billing' },
        { keywords: ['branding', 'brand', 'customize', 'white label'],  url: '/branding-settings.html',    label: 'Branding' },
        { keywords: ['stat', 'stats', 'analytics', 'statistics'],       url: '/coach-stats.html',          label: 'Stats' },
        { keywords: ['form', 'forms', 'form response', 'intake'],       url: '/form-responses.html',       label: 'Form Responses' },
    ];

    // ── Context: track which client we're viewing ──
    var context = {
        clientId: null,
        clientName: null
    };

    function detectContext() {
        // Get client ID from URL params
        var params = new URLSearchParams(window.location.search);
        var id = params.get('clientId') || params.get('client_id') || params.get('id');
        if (id) context.clientId = id;

        // Try to get client name from page
        var nameEl = document.querySelector('.client-name, .profile-name, [data-client-name]');
        if (nameEl) {
            context.clientName = nameEl.textContent.trim();
        }
        // Also try the page title
        if (!context.clientName && document.title) {
            var titleMatch = document.title.match(/^(.+?)[\s\-–—|]/);
            if (titleMatch && window.location.pathname.includes('client')) {
                context.clientName = titleMatch[1].trim();
            }
        }
    }

    // ── Supabase helper ──
    function getSupabase() {
        return window.supabaseClient || null;
    }

    async function getCoachId() {
        var sb = getSupabase();
        if (!sb) return null;
        try {
            var result = await sb.auth.getSession();
            return result.data.session ? result.data.session.user.id : null;
        } catch (_) { return null; }
    }

    // ── Find a client by name (fuzzy match) ──
    async function findClientByName(name) {
        var sb = getSupabase();
        var coachId = await getCoachId();
        if (!sb || !coachId) return null;

        var searchName = name.toLowerCase().trim();
        var { data } = await sb
            .from('clients')
            .select('id, client_name, email')
            .eq('coach_id', coachId)
            .ilike('client_name', '%' + searchName + '%')
            .limit(5);

        if (!data || data.length === 0) return null;
        // Best match: exact start, then contains
        var best = data.find(function (c) {
            return c.client_name.toLowerCase().startsWith(searchName);
        }) || data[0];
        return best;
    }

    // ── Resolve "this client" / "him" / "her" / "them" or a name ──
    async function resolveClient(nameOrPronoun) {
        var lower = nameOrPronoun.toLowerCase().trim();
        // Pronouns refer to current context
        if (/^(this client|them|him|her|this person|their|he|she)$/.test(lower)) {
            if (context.clientId) {
                return { id: context.clientId, client_name: context.clientName || 'this client' };
            }
            return null;
        }
        // Otherwise search by name
        return await findClientByName(nameOrPronoun);
    }

    // ═══════════════════════════════════════════════
    // ── COMMANDS (sync + async)
    // ═══════════════════════════════════════════════

    // Each command returns either a result object OR a Promise<result>
    var COMMANDS = [
        // ── Navigation ──
        {
            match: function (t) { return /^(go to|open|show me|show|navigate to|take me to|switch to)\s+/i.test(t); },
            action: function (t) {
                var target = t.replace(/^(go to|open|show me|show|navigate to|take me to|switch to)\s+/i, '').trim();
                // Check if they said a client name: "go to Fernando's account"
                var clientMatch = target.match(/^(.+?)(?:'s)?\s*(account|profile|page)$/i);
                if (clientMatch) {
                    var clientName = clientMatch[1];
                    return findClientByName(clientName).then(function (client) {
                        if (client) {
                            context.clientId = client.id;
                            context.clientName = client.client_name;
                            window.location.href = '/client-profile.html?clientId=' + client.id;
                            return { message: 'Opening ' + client.client_name + "'s profile...", type: 'success' };
                        }
                        return { message: 'Could not find a client named "' + clientName + '"', type: 'error' };
                    });
                }
                return navigateTo(target.toLowerCase());
            }
        },
        // Direct page name
        {
            match: function (t) {
                var lower = t.toLowerCase().trim();
                return NAV_ROUTES.some(function (r) {
                    return r.keywords.some(function (k) { return lower === k || lower === k + 's'; });
                });
            },
            action: function (t) { return navigateTo(t.trim().toLowerCase()); }
        },

        // ── Data: "Did [client] finish today's workout?" ──
        {
            match: function (t) { return /\b(did|has|finish|complete|done)\b.+\b(workout|training|session)\b/i.test(t); },
            action: async function (t) {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                // Extract client name
                var nameMatch = t.match(/(?:did|has)\s+(.+?)\s+(?:finish|complete|done|do)/i);
                var clientRef = nameMatch ? nameMatch[1] : null;
                if (!clientRef) {
                    // Maybe: "check if [name] finished..."
                    nameMatch = t.match(/(?:check|see)\s+(?:if\s+)?(.+?)\s+(?:finish|complete|done|has)/i);
                    clientRef = nameMatch ? nameMatch[1] : null;
                }
                var client = clientRef ? await resolveClient(clientRef) : null;

                if (!client && context.clientId) {
                    // Use current context
                    client = { id: context.clientId, client_name: context.clientName || 'this client' };
                }
                if (!client) return { message: "Which client? Try: \"Did Fernando finish today's workout?\"", type: 'error' };

                // Query today's workout logs
                var today = new Date();
                today.setHours(0, 0, 0, 0);
                var { data: logs } = await sb
                    .from('workout_logs')
                    .select('id, workout_name, status, workout_date')
                    .eq('client_id', client.id)
                    .gte('created_at', today.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (!logs || logs.length === 0) {
                    return { message: client.client_name + ' has no workout logged for today', type: 'success' };
                }
                var completed = logs.filter(function (l) { return l.status === 'completed'; });
                if (completed.length > 0) {
                    var names = completed.map(function (l) { return l.workout_name || 'Workout'; }).join(', ');
                    return { message: 'Yes! ' + client.client_name + ' completed: ' + names + ' today', type: 'success' };
                }
                var inProgress = logs[0].workout_name || 'a workout';
                return { message: client.client_name + ' has ' + inProgress + ' logged but not marked complete yet', type: 'success' };
            }
        },

        // ── Data: "Any PRs?" / "Check for PRs" / "personal records" ──
        {
            match: function (t) { return /\b(pr|prs|personal record|personal records|new record)\b/i.test(t); },
            action: async function (t) {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                // Check if asking about a specific client
                var nameMatch = t.match(/(?:for|from|by)\s+(.+?)(?:\s*$|\s+(?:today|this week|recently))/i);
                var clientRef = nameMatch ? nameMatch[1] : null;
                var clientFilter = null;

                if (clientRef) {
                    clientFilter = await resolveClient(clientRef);
                } else if (context.clientId) {
                    clientFilter = { id: context.clientId, client_name: context.clientName || 'this client' };
                }

                // Check notifications for PRs
                var weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                var query = sb
                    .from('notifications')
                    .select('id, title, message, created_at, related_client_id')
                    .eq('user_id', coachId)
                    .eq('type', 'client_pr')
                    .gte('created_at', weekAgo.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(10);

                var { data: prs } = await query;

                if (!prs || prs.length === 0) {
                    var scope = clientFilter ? clientFilter.client_name : 'any client';
                    return { message: 'No new PRs from ' + scope + ' this week', type: 'success' };
                }

                // If filtering by client
                if (clientFilter) {
                    prs = prs.filter(function (p) { return String(p.related_client_id) === String(clientFilter.id); });
                    if (prs.length === 0) {
                        return { message: 'No new PRs from ' + clientFilter.client_name + ' this week', type: 'success' };
                    }
                }

                var count = prs.length;
                var latest = prs[0].title || prs[0].message || 'New PR';
                if (count === 1) {
                    return { message: '1 new PR this week: ' + latest, type: 'success' };
                }
                return { message: count + ' new PRs this week. Latest: ' + latest, type: 'success' };
            }
        },

        // ── Data: "How many clients do I have?" ──
        {
            match: function (t) { return /how many client/i.test(t); },
            action: async function () {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                var { count } = await sb
                    .from('clients')
                    .select('*', { count: 'exact', head: true })
                    .eq('coach_id', coachId);

                return { message: 'You have ' + (count || 0) + ' clients', type: 'success' };
            }
        },

        // ── Data: "Any new messages?" / "Unread messages" / "Any messages?" ──
        {
            match: function (t) { return /\b(unread|new)\s*(message|msg)/i.test(t) || /any\s*(new\s*)?(message|msg)/i.test(t); },
            action: async function () {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                var { count } = await sb
                    .from('chat_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('coach_id', coachId)
                    .eq('sender_type', 'client')
                    .or('is_read.eq.false,is_read.is.null');

                if (count === 0) {
                    return { message: "You're all caught up — no unread messages", type: 'success' };
                }
                return { message: 'You have ' + count + ' unread message' + (count === 1 ? '' : 's'), type: 'success' };
            }
        },

        // ── Data: "Any pending check-ins?" ──
        {
            match: function (t) { return /\b(pending|unanswered|unreviewed)\b.+\b(check.?in|checkin)/i.test(t) || /\b(check.?in|checkin).+\b(pending|unanswered|waiting)/i.test(t) || /any.+check.?in/i.test(t); },
            action: async function () {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                var { count } = await sb
                    .from('client_checkins')
                    .select('*', { count: 'exact', head: true })
                    .eq('coach_id', coachId)
                    .is('coach_responded_at', null);

                if (count === 0) {
                    return { message: 'No pending check-ins — all responded to', type: 'success' };
                }
                return { message: count + ' pending check-in' + (count === 1 ? '' : 's') + ' waiting for your response', type: 'success' };
            }
        },

        // ── Data: "How is [client] doing?" — quick health summary ──
        {
            match: function (t) { return /how\s+is\s+.+\s+(doing|feeling|going)/i.test(t); },
            action: async function (t) {
                var sb = getSupabase();
                var coachId = await getCoachId();
                if (!sb || !coachId) return { message: 'Cannot connect to database', type: 'error' };

                var nameMatch = t.match(/how\s+is\s+(.+?)\s+(doing|feeling|going)/i);
                var clientRef = nameMatch ? nameMatch[1] : null;
                var client = clientRef ? await resolveClient(clientRef) : null;

                if (!client && context.clientId) {
                    client = { id: context.clientId, client_name: context.clientName || 'this client' };
                }
                if (!client) return { message: 'Which client? Try: "How is Fernando doing?"', type: 'error' };

                // Get latest check-in
                var { data: checkins } = await sb
                    .from('client_checkins')
                    .select('energy_level, stress_level, sleep_quality, meal_plan_adherence, created_at')
                    .eq('client_id', client.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!checkins || checkins.length === 0) {
                    return { message: client.client_name + " hasn't submitted any check-ins yet", type: 'success' };
                }

                var c = checkins[0];
                var parts = [];
                if (c.energy_level) parts.push('energy ' + c.energy_level + '/5');
                if (c.stress_level) parts.push('stress ' + c.stress_level + '/5');
                if (c.sleep_quality) parts.push('sleep ' + c.sleep_quality + '/5');
                if (c.meal_plan_adherence != null) parts.push('diet adherence ' + c.meal_plan_adherence + '%');

                var daysAgo = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
                var when = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';

                return {
                    message: client.client_name + "'s latest check-in (" + when + '): ' + parts.join(', '),
                    type: 'success'
                };
            }
        },

        // ── Theme toggle ──
        {
            match: function (t) { return /\b(dark mode|light mode|toggle theme|switch theme|night mode|day mode)\b/i.test(t); },
            action: function (t) {
                var wantDark = /dark|night/i.test(t);
                var wantLight = /light|day/i.test(t);
                if (window.ZiqueTheme) {
                    if (wantDark) window.ZiqueTheme.set('dark');
                    else if (wantLight) window.ZiqueTheme.set('light');
                    else window.ZiqueTheme.toggle();
                    return { message: 'Switched to ' + window.ZiqueTheme.get() + ' mode', type: 'success' };
                }
                return { message: 'Theme control not available', type: 'error' };
            }
        },

        // ── Search clients ──
        {
            match: function (t) { return /^(find|search|look up|lookup)\s+(client|for client|for)\s+/i.test(t); },
            action: function (t) {
                var name = t.replace(/^(find|search|look up|lookup)\s+(client|for client|for)\s+/i, '').trim();
                if (!name) return { message: 'Who should I search for?', type: 'error' };
                window.location.href = '/manage-clients.html?search=' + encodeURIComponent(name);
                return { message: 'Searching for client "' + name + '"...', type: 'success' };
            }
        },

        // ── Search recipes ──
        {
            match: function (t) { return /^(search|find)\s+(recipe|recipes)\s+/i.test(t); },
            action: function (t) {
                var query = t.replace(/^(search|find)\s+(recipe|recipes)\s+/i, '').trim();
                window.location.href = '/manage-recipes.html?search=' + encodeURIComponent(query);
                return { message: 'Searching recipes for "' + query + '"...', type: 'success' };
            }
        },

        // ── Quick create actions ──
        {
            match: function (t) { return /^(create|new|add|make)\s+(a\s+)?(workout|exercise)/i.test(t); },
            action: function () {
                window.location.href = '/coach-workouts.html';
                return { message: 'Opening Workout Builder...', type: 'success' };
            }
        },
        {
            match: function (t) { return /^(create|new|add|make)\s+(a\s+)?(recipe)/i.test(t); },
            action: function () {
                window.location.href = '/manage-recipes.html?action=new';
                return { message: 'Opening recipe creator...', type: 'success' };
            }
        },
        {
            match: function (t) { return /^(create|new|add|make)\s+(a\s+)?(client)/i.test(t); },
            action: function () {
                window.location.href = '/manage-clients.html?action=add';
                return { message: 'Opening add client...', type: 'success' };
            }
        },
        {
            match: function (t) { return /^(create|new|add|make)\s+(a\s+)?(meal plan|meal|plan)/i.test(t); },
            action: function () {
                window.location.href = '/planner.html';
                return { message: 'Opening Nutrition Planner...', type: 'success' };
            }
        },
        {
            match: function (t) { return /^(create|new|add|make)\s+(a\s+)?(challenge)/i.test(t); },
            action: function () {
                window.location.href = '/coach-challenges.html?action=new';
                return { message: 'Opening challenge creator...', type: 'success' };
            }
        },

        // ── Send message (with context support) ──
        {
            match: function (t) { return /^(send|write)\s+(a\s+)?message/i.test(t) || /^message\s+(this client|him|her|them|\w+)/i.test(t); },
            action: async function (t) {
                var nameMatch = t.match(/(?:message|to)\s+(.+?)$/i);
                var target = nameMatch ? nameMatch[1].trim() : null;

                if (target) {
                    var client = await resolveClient(target);
                    if (client) {
                        context.clientId = client.id;
                        context.clientName = client.client_name;
                        window.location.href = '/coach-messages.html?to=' + encodeURIComponent(client.client_name);
                        return { message: 'Opening messages for ' + client.client_name + '...', type: 'success' };
                    }
                    // Fall back to text-based search
                    window.location.href = '/coach-messages.html?to=' + encodeURIComponent(target);
                    return { message: 'Opening messages for "' + target + '"...', type: 'success' };
                }
                window.location.href = '/coach-messages.html';
                return { message: 'Opening Messages...', type: 'success' };
            }
        },

        // ── What page am I on ──
        {
            match: function (t) { return /\b(what page|where am i|current page)\b/i.test(t); },
            action: function () {
                var page = document.title || window.location.pathname;
                return { message: "You're on: " + page, type: 'success' };
            }
        },

        // ── Scroll ──
        {
            match: function (t) { return /^(scroll|go)\s+(to\s+)?(top|bottom|up|down)/i.test(t); },
            action: function (t) {
                var dir = /top|up/i.test(t) ? 'top' : 'bottom';
                window.scrollTo({ top: dir === 'top' ? 0 : document.body.scrollHeight, behavior: 'smooth' });
                return { message: 'Scrolled to ' + dir, type: 'success' };
            }
        },

        // ── Reload ──
        {
            match: function (t) { return /^(reload|refresh)\s*(page|this)?$/i.test(t); },
            action: function () {
                setTimeout(function () { window.location.reload(); }, 600);
                return { message: 'Refreshing page...', type: 'success' };
            }
        },

        // ── Log out ──
        {
            match: function (t) { return /^(log out|logout|sign out|signout)$/i.test(t); },
            action: function () {
                var btn = document.getElementById('logoutBtn') ||
                          document.getElementById('logoutLink') ||
                          document.getElementById('mobileLogoutBtn');
                if (btn) {
                    setTimeout(function () { btn.click(); }, 600);
                    return { message: 'Logging out...', type: 'success' };
                }
                return { message: 'Logout button not found on this page', type: 'error' };
            }
        },

        // ── Help ──
        {
            match: function (t) { return /^(help|commands|what can you do|what do you do)/i.test(t); },
            action: function () {
                return {
                    message: 'Try: "Go to Fernando\'s account and check his workouts", "Any new messages?", "How many clients?", "Any PRs this week?", "How is Sarah doing?", "Dark mode"',
                    type: 'success'
                };
            }
        },
    ];

    // ── Navigation helper ──
    function navigateTo(target) {
        target = target.replace(/[.!?,]+$/, '').trim();
        for (var i = 0; i < NAV_ROUTES.length; i++) {
            var route = NAV_ROUTES[i];
            for (var j = 0; j < route.keywords.length; j++) {
                if (target.includes(route.keywords[j]) || route.keywords[j].includes(target)) {
                    if (window.location.pathname === route.url) {
                        return { message: "You're already on " + route.label, type: 'success' };
                    }
                    window.location.href = route.url;
                    return { message: 'Going to ' + route.label + '...', type: 'success' };
                }
            }
        }
        return { message: 'I don\'t know where "' + target + '" is. Try "help" for commands.', type: 'error' };
    }

    // ── Text-to-Speech ──
    function speak(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        var utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.pitch = 1;
        utter.volume = 0.8;
        window.speechSynthesis.speak(utter);
    }

    // ═══════════════════════════════════════════════
    // ── CHAIN PARSER — split multi-command sentences
    // ═══════════════════════════════════════════════

    function splitChainedCommands(text) {
        // Split on: "and", "and also", "also", "then", "plus"
        // But NOT "and check" becoming ["", "check"] — keep meaningful parts
        var parts = text.split(/\s+(?:and\s+also|and\s+then|and\s+|also\s+|then\s+|plus\s+)/i);
        // Filter empties and trim
        return parts.map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
    }

    // ── Process a single command ──
    function processSingleCommand(text) {
        if (!text) return Promise.resolve({ message: "I didn't catch that. Try again.", type: 'error' });

        var trimmed = text.trim();

        for (var i = 0; i < COMMANDS.length; i++) {
            if (COMMANDS[i].match(trimmed)) {
                var result = COMMANDS[i].action(trimmed);
                // Normalize to Promise
                return Promise.resolve(result);
            }
        }

        // Fallback: check if text contains a nav keyword
        var lowerText = trimmed.toLowerCase();
        for (var r = 0; r < NAV_ROUTES.length; r++) {
            var route = NAV_ROUTES[r];
            for (var k = 0; k < route.keywords.length; k++) {
                if (lowerText.includes(route.keywords[k])) {
                    if (window.location.pathname === route.url) {
                        return Promise.resolve({ message: "You're already on " + route.label, type: 'success' });
                    }
                    window.location.href = route.url;
                    return Promise.resolve({ message: 'Going to ' + route.label + '...', type: 'success' });
                }
            }
        }

        return Promise.resolve({
            message: 'I didn\'t understand "' + trimmed + '". Say "help" for a list of commands.',
            type: 'error'
        });
    }

    // ── Process chained commands ──
    async function processCommand(text) {
        if (!text) return { message: "I didn't catch that. Try again.", type: 'error' };

        var parts = splitChainedCommands(text);

        if (parts.length <= 1) {
            return await processSingleCommand(text.trim());
        }

        // Multiple commands — run them sequentially, collect results
        var results = [];
        var hasNavigation = false;

        for (var i = 0; i < parts.length; i++) {
            var result = await processSingleCommand(parts[i]);
            results.push(result);

            // If a command triggered navigation, we can't run more commands on this page
            // But we still want to report what we planned to do
            if (result.message && result.message.includes('...') && result.type === 'success') {
                hasNavigation = true;
                // Add remaining commands as "queued" info
                if (i < parts.length - 1) {
                    var remaining = parts.slice(i + 1).join(', then ');
                    results.push({ message: 'Then: ' + remaining, type: 'success' });
                }
                break;
            }

            // Update context if we found a client
            updateContextFromResult(parts[i]);
        }

        // Combine messages
        var messages = results.map(function (r) { return r.message; });
        var hasError = results.some(function (r) { return r.type === 'error'; });

        return {
            message: messages.join(' → '),
            type: hasError ? 'error' : 'success'
        };
    }

    // When a command references a client, save to context for pronouns in chained commands
    function updateContextFromResult(commandText) {
        // Check if a client name was mentioned — set context
        var namePatterns = [
            /(?:go to|open)\s+(.+?)(?:'s)/i,
            /(?:find|search)\s+(?:client\s+)?(.+)/i,
            /(?:did|has)\s+(.+?)\s+(?:finish|complete)/i,
            /how\s+is\s+(.+?)\s+(?:doing|feeling)/i,
        ];
        for (var i = 0; i < namePatterns.length; i++) {
            var m = commandText.match(namePatterns[i]);
            if (m && m[1]) {
                var name = m[1].trim();
                // Don't overwrite with pronouns
                if (!/^(this client|him|her|them|their)$/i.test(name)) {
                    context.clientName = name;
                }
                break;
            }
        }
    }

    // ═══════════════════════════════════════════════
    // ── UI
    // ═══════════════════════════════════════════════

    var overlayEl = null;
    var recognition = null;
    var isListening = false;

    function showToast(message, type) {
        var existing = document.querySelector('.vc-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'vc-toast' + (type ? ' vc-toast-' + type : '');
        var icon = type === 'success' ? ICONS.check : ICONS.alertCircle;
        toast.innerHTML = icon + '<span>' + escapeHTML(message) + '</span>';
        document.body.appendChild(toast);

        setTimeout(function () {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(function () { toast.remove(); }, 300);
        }, 4000);
    }

    function openOverlay() {
        if (overlayEl) return;

        if (window.VoiceToText && window.VoiceToText.stopActive) {
            window.VoiceToText.stopActive();
        }

        // Detect current page context
        detectContext();

        overlayEl = document.createElement('div');
        overlayEl.className = 'vc-overlay';

        var contextHint = '';
        if (context.clientName) {
            contextHint = ' (viewing ' + escapeHTML(context.clientName) + ')';
        }

        var hints = [
            '"Go to Fernando\'s account"',
            '"Did he finish today\'s workout?"',
            '"Any new messages?"',
            '"How many clients?"',
            '"Any PRs this week?"',
            '"Help"'
        ];
        var hintsHTML = hints.map(function (h) { return '<button class="vc-hint">' + h + '</button>'; }).join('');

        overlayEl.innerHTML =
            '<button class="vc-close" id="vcClose">' + ICONS.x + '</button>' +
            '<div class="vc-orb vc-idle" id="vcOrb">' + ICONS.mic + '</div>' +
            '<div class="vc-transcript" id="vcTranscript">Tap the orb and speak' + contextHint + '</div>' +
            '<div class="vc-status" id="vcStatus">Try chaining: "Go to Fernando\'s account and check his workouts"</div>' +
            '<div class="vc-hints" id="vcHints">' + hintsHTML + '</div>';

        document.body.appendChild(overlayEl);

        document.getElementById('vcClose').addEventListener('click', closeOverlay);
        document.getElementById('vcOrb').addEventListener('click', toggleListening);

        overlayEl.querySelectorAll('.vc-hint').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var text = btn.textContent.replace(/^"|"$/g, '');
                handleFinalTranscript(text);
            });
        });

        overlayEl._keyHandler = function (e) {
            if (e.key === 'Escape') closeOverlay();
        };
        document.addEventListener('keydown', overlayEl._keyHandler);

        setTimeout(startListening, 400);
    }

    function closeOverlay() {
        stopListening();
        if (overlayEl) {
            if (overlayEl._keyHandler) {
                document.removeEventListener('keydown', overlayEl._keyHandler);
            }
            overlayEl.remove();
            overlayEl = null;
        }
    }

    // ── Speech Recognition ──
    function startListening() {
        if (isListening || !overlayEl) return;

        var orb = document.getElementById('vcOrb');
        var transcript = document.getElementById('vcTranscript');
        var status = document.getElementById('vcStatus');
        var hintsEl = document.getElementById('vcHints');

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = function () {
            isListening = true;
            if (orb) orb.className = 'vc-orb vc-listening';
            if (transcript) {
                transcript.textContent = 'Listening...';
                transcript.className = 'vc-transcript vc-interim';
            }
            if (status) status.textContent = 'Speak a command — you can chain multiple with "and"';
            if (hintsEl) hintsEl.style.opacity = '0.4';
        };

        recognition.onresult = function (event) {
            var finalText = '';
            var interimText = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                var t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += t;
                } else {
                    interimText += t;
                }
            }
            if (finalText) {
                if (transcript) {
                    transcript.textContent = finalText;
                    transcript.className = 'vc-transcript';
                }
                handleFinalTranscript(finalText);
            } else if (interimText && transcript) {
                transcript.textContent = interimText;
                transcript.className = 'vc-transcript vc-interim';
            }
        };

        recognition.onerror = function (event) {
            isListening = false;
            if (orb) orb.className = 'vc-orb vc-error';
            if (event.error === 'not-allowed') {
                if (transcript) transcript.textContent = 'Microphone access denied';
                if (status) status.textContent = 'Please allow microphone access in your browser settings';
            } else if (event.error === 'no-speech') {
                if (transcript) transcript.textContent = "I didn't hear anything";
                if (status) status.textContent = 'Tap the orb to try again';
                if (orb) orb.className = 'vc-orb vc-idle';
            } else {
                if (transcript) transcript.textContent = 'Something went wrong';
                if (status) status.textContent = 'Tap the orb to try again';
            }
            setTimeout(function () {
                if (orb && overlayEl) orb.className = 'vc-orb vc-idle';
            }, 2000);
        };

        recognition.onend = function () {
            isListening = false;
            if (orb && orb.classList.contains('vc-listening')) {
                orb.className = 'vc-orb vc-idle';
            }
        };

        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(function (stream) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    recognition.start();
                })
                .catch(function () {
                    if (transcript) transcript.textContent = 'Microphone access denied';
                });
        } else {
            try { recognition.start(); } catch (err) { console.error('Voice commander start error:', err); }
        }
    }

    function stopListening() {
        isListening = false;
        if (recognition) {
            try { recognition.abort(); } catch (_) {}
            recognition = null;
        }
    }

    function toggleListening() {
        if (isListening) {
            stopListening();
            var orb = document.getElementById('vcOrb');
            if (orb) orb.className = 'vc-orb vc-idle';
            var transcript = document.getElementById('vcTranscript');
            if (transcript) {
                transcript.textContent = 'Tap the orb and speak a command';
                transcript.className = 'vc-transcript';
            }
        } else {
            startListening();
        }
    }

    // ── Handle completed speech ──
    async function handleFinalTranscript(text) {
        stopListening();

        var orb = document.getElementById('vcOrb');
        var transcript = document.getElementById('vcTranscript');
        var status = document.getElementById('vcStatus');

        if (orb) orb.className = 'vc-orb vc-processing';
        if (transcript) {
            transcript.textContent = text;
            transcript.className = 'vc-transcript';
        }
        if (status) status.textContent = 'Processing...';

        try {
            var result = await processCommand(text);

            if (orb) {
                orb.className = 'vc-orb ' + (result.type === 'success' ? 'vc-success' : 'vc-error');
            }
            if (transcript) transcript.textContent = result.message;
            if (status) status.textContent = '';

            speak(result.message);

            if (result.type === 'success' && result.message.includes('...')) {
                setTimeout(closeOverlay, 800);
            } else {
                showToast(result.message, result.type);
                setTimeout(function () {
                    if (overlayEl) {
                        if (orb) orb.className = 'vc-orb vc-idle';
                        if (transcript) {
                            transcript.textContent = 'Tap the orb for another command';
                            transcript.className = 'vc-transcript';
                        }
                        if (status) status.textContent = '';
                        var hintsEl = document.getElementById('vcHints');
                        if (hintsEl) hintsEl.style.opacity = '1';
                    }
                }, 3000);
            }
        } catch (err) {
            console.error('Voice Commander error:', err);
            if (orb) orb.className = 'vc-orb vc-error';
            if (transcript) transcript.textContent = 'Something went wrong processing that command';
            if (status) status.textContent = 'Tap the orb to try again';
            setTimeout(function () {
                if (orb && overlayEl) orb.className = 'vc-orb vc-idle';
            }, 2500);
        }
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function createFAB() {
        var fab = document.createElement('button');
        fab.className = 'vc-fab';
        fab.id = 'vcFab';
        fab.title = 'Voice Commands (Ctrl+Shift+V)';
        fab.innerHTML = ICONS.mic;
        fab.addEventListener('click', openOverlay);
        document.body.appendChild(fab);
    }

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            if (overlayEl) closeOverlay();
            else openOverlay();
        }
    });

    function init() {
        createFAB();
        detectContext();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.VoiceCommander = {
        open: openOverlay,
        close: closeOverlay,
        process: processCommand
    };
})();
