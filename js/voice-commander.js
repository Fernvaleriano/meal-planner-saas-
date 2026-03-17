/**
 * Voice Commander — Siri-like voice command agent for coaches
 *
 * Drop <link rel="stylesheet" href="/css/voice-commander.css"> and
 * <script src="/js/voice-commander.js"></script> on any coach page.
 * Self-contained: injects the FAB + overlay and handles all logic.
 *
 * Supports:
 *   - Navigation: "go to clients", "open messages", "show stats"
 *   - Theme: "dark mode", "light mode", "toggle theme"
 *   - Search: "find client John", "search recipes pasta"
 *   - Quick actions: "new workout", "add client", "create recipe"
 *   - Info: "how many clients", "what page am I on"
 */
(function () {
    'use strict';

    // ── Check browser support ──
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return; // Silently bail on unsupported browsers

    // ── Icons (Lucide-style SVGs) ──
    const ICONS = {
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
        x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
        check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        alertCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        waveform: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/></svg>'
    };

    // ── Navigation map ──
    const NAV_ROUTES = [
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

    // ── Command definitions ──
    // Each command: { match: fn(text) -> truthy, action: fn(text) -> { message, type } }
    const COMMANDS = [
        // Navigation
        {
            match: (t) => /^(go to|open|show|navigate to|take me to|switch to)\s+/i.test(t),
            action: (t) => {
                const target = t.replace(/^(go to|open|show|navigate to|take me to|switch to)\s+/i, '').trim().toLowerCase();
                return navigateTo(target);
            }
        },
        // Direct page name (e.g. just "dashboard", "clients")
        {
            match: (t) => {
                const lower = t.toLowerCase().trim();
                return NAV_ROUTES.some(r => r.keywords.some(k => lower === k || lower === k + 's'));
            },
            action: (t) => navigateTo(t.trim().toLowerCase())
        },
        // Theme toggle
        {
            match: (t) => /\b(dark mode|light mode|toggle theme|switch theme|night mode|day mode)\b/i.test(t),
            action: (t) => {
                const wantDark = /dark|night/i.test(t);
                const wantLight = /light|day/i.test(t);
                if (window.ZiqueTheme) {
                    if (wantDark) window.ZiqueTheme.set('dark');
                    else if (wantLight) window.ZiqueTheme.set('light');
                    else window.ZiqueTheme.toggle();
                    const current = window.ZiqueTheme.get();
                    return { message: `Switched to ${current} mode`, type: 'success' };
                }
                return { message: 'Theme control not available', type: 'error' };
            }
        },
        // Search clients
        {
            match: (t) => /^(find|search|look up|lookup)\s+(client|for client|for)\s+/i.test(t),
            action: (t) => {
                const name = t.replace(/^(find|search|look up|lookup)\s+(client|for client|for)\s+/i, '').trim();
                if (!name) return { message: 'Who should I search for?', type: 'error' };
                // Navigate to clients page with search query
                window.location.href = '/manage-clients.html?search=' + encodeURIComponent(name);
                return { message: `Searching for client "${name}"...`, type: 'success' };
            }
        },
        // Search recipes
        {
            match: (t) => /^(search|find)\s+(recipe|recipes)\s+/i.test(t),
            action: (t) => {
                const query = t.replace(/^(search|find)\s+(recipe|recipes)\s+/i, '').trim();
                window.location.href = '/manage-recipes.html?search=' + encodeURIComponent(query);
                return { message: `Searching recipes for "${query}"...`, type: 'success' };
            }
        },
        // Quick create actions
        {
            match: (t) => /^(create|new|add|make)\s+(a\s+)?(workout|exercise)/i.test(t),
            action: () => {
                window.location.href = '/coach-workouts.html';
                return { message: 'Opening Workout Builder...', type: 'success' };
            }
        },
        {
            match: (t) => /^(create|new|add|make)\s+(a\s+)?(recipe)/i.test(t),
            action: () => {
                window.location.href = '/manage-recipes.html?action=new';
                return { message: 'Opening recipe creator...', type: 'success' };
            }
        },
        {
            match: (t) => /^(create|new|add|make)\s+(a\s+)?(client)/i.test(t),
            action: () => {
                window.location.href = '/manage-clients.html?action=add';
                return { message: 'Opening add client...', type: 'success' };
            }
        },
        {
            match: (t) => /^(create|new|add|make)\s+(a\s+)?(meal plan|meal|plan)/i.test(t),
            action: () => {
                window.location.href = '/planner.html';
                return { message: 'Opening Nutrition Planner...', type: 'success' };
            }
        },
        {
            match: (t) => /^(create|new|add|make)\s+(a\s+)?(challenge)/i.test(t),
            action: () => {
                window.location.href = '/coach-challenges.html?action=new';
                return { message: 'Opening challenge creator...', type: 'success' };
            }
        },
        // Send message
        {
            match: (t) => /^(send|write)\s+(a\s+)?message\s+(to\s+)?/i.test(t),
            action: (t) => {
                const name = t.replace(/^(send|write)\s+(a\s+)?message\s+(to\s+)?/i, '').trim();
                if (name) {
                    window.location.href = '/coach-messages.html?to=' + encodeURIComponent(name);
                    return { message: `Opening messages for "${name}"...`, type: 'success' };
                }
                window.location.href = '/coach-messages.html';
                return { message: 'Opening Messages...', type: 'success' };
            }
        },
        // What page am I on
        {
            match: (t) => /\b(what page|where am i|current page)\b/i.test(t),
            action: () => {
                const page = document.title || window.location.pathname;
                return { message: `You're on: ${page}`, type: 'success' };
            }
        },
        // Scroll to top / bottom
        {
            match: (t) => /^(scroll|go)\s+(to\s+)?(top|bottom|up|down)/i.test(t),
            action: (t) => {
                const dir = /top|up/i.test(t) ? 'top' : 'bottom';
                if (dir === 'top') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }
                return { message: `Scrolled to ${dir}`, type: 'success' };
            }
        },
        // Reload / refresh
        {
            match: (t) => /^(reload|refresh)\s*(page|this)?$/i.test(t),
            action: () => {
                setTimeout(() => window.location.reload(), 600);
                return { message: 'Refreshing page...', type: 'success' };
            }
        },
        // Log out
        {
            match: (t) => /^(log out|logout|sign out|signout)$/i.test(t),
            action: () => {
                const logoutBtn = document.getElementById('logoutBtn') ||
                                  document.getElementById('logoutLink') ||
                                  document.getElementById('mobileLogoutBtn');
                if (logoutBtn) {
                    setTimeout(() => logoutBtn.click(), 600);
                    return { message: 'Logging out...', type: 'success' };
                }
                return { message: 'Logout button not found on this page', type: 'error' };
            }
        },
        // Help — list available commands
        {
            match: (t) => /^(help|commands|what can you do|what do you do)/i.test(t),
            action: () => {
                return {
                    message: 'Try: "Go to clients", "Dark mode", "Find client John", "New workout", "Send message to Sarah", "Scroll to top", "Refresh page"',
                    type: 'success',
                    speak: true
                };
            }
        },
    ];

    // ── Navigation helper ──
    function navigateTo(target) {
        // Remove trailing punctuation
        target = target.replace(/[.!?,]+$/, '').trim();

        for (const route of NAV_ROUTES) {
            for (const keyword of route.keywords) {
                if (target.includes(keyword) || keyword.includes(target)) {
                    // Don't navigate if already on this page
                    if (window.location.pathname === route.url) {
                        return { message: `You're already on ${route.label}`, type: 'success' };
                    }
                    window.location.href = route.url;
                    return { message: `Going to ${route.label}...`, type: 'success' };
                }
            }
        }
        return { message: `I don't know where "${target}" is. Try "help" for commands.`, type: 'error' };
    }

    // ── Text-to-Speech ──
    function speak(text) {
        if (!('speechSynthesis' in window)) return;
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.pitch = 1;
        utter.volume = 0.8;
        window.speechSynthesis.speak(utter);
    }

    // ── State ──
    let overlayEl = null;
    let recognition = null;
    let isListening = false;

    // ── Process a command string ──
    function processCommand(text) {
        if (!text) return { message: "I didn't catch that. Try again.", type: 'error' };

        const trimmed = text.trim();

        for (const cmd of COMMANDS) {
            if (cmd.match(trimmed)) {
                return cmd.action(trimmed);
            }
        }

        // Fallback — maybe they said just a page name variant
        const lowerText = trimmed.toLowerCase();
        for (const route of NAV_ROUTES) {
            for (const keyword of route.keywords) {
                // Fuzzy: check if the spoken text contains a keyword
                if (lowerText.includes(keyword)) {
                    if (window.location.pathname === route.url) {
                        return { message: `You're already on ${route.label}`, type: 'success' };
                    }
                    window.location.href = route.url;
                    return { message: `Going to ${route.label}...`, type: 'success' };
                }
            }
        }

        return {
            message: `I didn't understand "${trimmed}". Say "help" for a list of commands.`,
            type: 'error',
            speak: true
        };
    }

    // ── Toast notification ──
    function showToast(message, type) {
        // Remove existing toast
        const existing = document.querySelector('.vc-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'vc-toast' + (type ? ' vc-toast-' + type : '');
        const icon = type === 'success' ? ICONS.check : ICONS.alertCircle;
        toast.innerHTML = icon + '<span>' + escapeHTML(message) + '</span>';
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ── Build & show the overlay ──
    function openOverlay() {
        if (overlayEl) return;

        // Stop any other voice-to-text recordings
        if (window.VoiceToText && window.VoiceToText.stopActive) {
            window.VoiceToText.stopActive();
        }

        overlayEl = document.createElement('div');
        overlayEl.className = 'vc-overlay';

        const hints = [
            '"Go to clients"', '"Dark mode"', '"Find client..."',
            '"New workout"', '"Send message to..."', '"Help"'
        ];
        const hintsHTML = hints.map(h => '<button class="vc-hint">' + h + '</button>').join('');

        overlayEl.innerHTML =
            '<button class="vc-close" id="vcClose">' + ICONS.x + '</button>' +
            '<div class="vc-orb vc-idle" id="vcOrb">' + ICONS.mic + '</div>' +
            '<div class="vc-transcript" id="vcTranscript">Tap the orb and speak a command</div>' +
            '<div class="vc-status" id="vcStatus">Or say "help" for a list of commands</div>' +
            '<div class="vc-hints" id="vcHints">' + hintsHTML + '</div>';

        document.body.appendChild(overlayEl);

        // Wire close button
        document.getElementById('vcClose').addEventListener('click', closeOverlay);

        // Wire orb click
        document.getElementById('vcOrb').addEventListener('click', toggleListening);

        // Wire hint chips
        overlayEl.querySelectorAll('.vc-hint').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const text = btn.textContent.replace(/^"|"$/g, '');
                handleFinalTranscript(text);
            });
        });

        // Close on Escape
        overlayEl._keyHandler = function (e) {
            if (e.key === 'Escape') closeOverlay();
        };
        document.addEventListener('keydown', overlayEl._keyHandler);

        // Auto-start listening after a brief pause
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

        const orb = document.getElementById('vcOrb');
        const transcript = document.getElementById('vcTranscript');
        const status = document.getElementById('vcStatus');
        const hintsEl = document.getElementById('vcHints');

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = function () {
            isListening = true;
            if (orb) {
                orb.className = 'vc-orb vc-listening';
            }
            if (transcript) {
                transcript.textContent = 'Listening...';
                transcript.className = 'vc-transcript vc-interim';
            }
            if (status) status.textContent = 'Speak a command';
            if (hintsEl) hintsEl.style.opacity = '0.4';
        };

        recognition.onresult = function (event) {
            let finalText = '';
            let interimText = '';
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
            console.warn('Voice Commander recognition error:', event.error);
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

        // iOS warmup
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
            try {
                recognition.start();
            } catch (err) {
                console.error('Failed to start voice commander:', err);
            }
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
    function handleFinalTranscript(text) {
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

        // Small delay for visual feedback
        setTimeout(function () {
            var result = processCommand(text);

            if (orb) {
                orb.className = 'vc-orb ' + (result.type === 'success' ? 'vc-success' : 'vc-error');
            }
            if (transcript) transcript.textContent = result.message;
            if (status) status.textContent = '';

            // Speak the response
            speak(result.message);

            // If success with navigation, close overlay after brief delay
            if (result.type === 'success' && result.message.includes('...')) {
                // Navigation happening — overlay will be removed on page change
                setTimeout(closeOverlay, 800);
            } else {
                // Show toast and reset for another command
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
                }, 2500);
            }
        }, 300);
    }

    // ── Helpers ──
    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Create FAB ──
    function createFAB() {
        var fab = document.createElement('button');
        fab.className = 'vc-fab';
        fab.id = 'vcFab';
        fab.title = 'Voice Commands';
        fab.innerHTML = ICONS.mic;
        fab.addEventListener('click', function () {
            openOverlay();
        });
        document.body.appendChild(fab);
    }

    // ── Keyboard shortcut (Ctrl/Cmd + Shift + V) ──
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            if (overlayEl) {
                closeOverlay();
            } else {
                openOverlay();
            }
        }
    });

    // ── Init ──
    function init() {
        createFAB();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for external use
    window.VoiceCommander = {
        open: openOverlay,
        close: closeOverlay,
        process: processCommand
    };
})();
