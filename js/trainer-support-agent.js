/**
 * Trainer Support Agent - Self-contained floating chat widget
 *
 * Drop a single <script src="/js/trainer-support-agent.js"></script> on any
 * coach page and the widget injects itself (styles + HTML + logic).
 * Requires api-helper.js to be loaded first (for authenticatedFetch).
 */
(function () {
  'use strict';

  // ── Constants ──
  const STORAGE_KEY = 'trainer-support-chat-history';
  const MINIMIZED_KEY = 'trainer-support-minimized';
  const SEEN_KEY = 'trainer-support-seen';

  const QUICK_SUGGESTIONS = [
    'How do I add a new client?',
    'How do I create a meal plan?',
    'How do I set up billing?',
    'How do I customize my branding?',
    'How do workouts work?',
    'How do I message clients?',
  ];

  // ── SVG Icons (Lucide-style) ──
  const ICONS = {
    sparkles: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>',
    sparklesBig: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>',
    messageCircleQuestion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    xSmall: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
    chevronDown: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    loader: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tsa-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  };

  // ── Inject CSS ──
  function injectStyles() {
    if (document.getElementById('tsa-styles')) return;
    const style = document.createElement('style');
    style.id = 'tsa-styles';
    style.textContent = `
      /* ─── FAB ─── */
      .tsa-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: none;
        background: var(--brand-gradient, linear-gradient(135deg, #0d9488 0%, #0284c7 100%));
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);
        z-index: 9998;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .tsa-fab:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(13, 148, 136, 0.5);
      }
      .tsa-fab:active { transform: scale(0.95); }
      .tsa-fab.pulse {
        animation: tsa-pulse 2s ease-in-out infinite;
      }
      @keyframes tsa-pulse {
        0%, 100% { box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4); }
        50% { box-shadow: 0 4px 24px rgba(13, 148, 136, 0.7), 0 0 0 8px rgba(13, 148, 136, 0.1); }
      }

      /* ─── Minimized ─── */
      .tsa-minimized {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--brand-gradient, linear-gradient(135deg, #0d9488 0%, #0284c7 100%));
        color: #fff;
        border-radius: 24px;
        padding: 8px 14px 8px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        z-index: 9998;
        box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);
        font-size: 0.82rem;
        font-weight: 500;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        transition: transform 0.2s;
      }
      .tsa-minimized:hover { transform: scale(1.03); }
      .tsa-minimized-content {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tsa-minimized-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin-left: 4px;
        transition: background 0.15s;
      }
      .tsa-minimized-close:hover { background: rgba(255,255,255,0.35); }

      /* ─── Panel ─── */
      .tsa-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 400px;
        max-width: calc(100vw - 32px);
        height: 560px;
        max-height: calc(100vh - 100px);
        background: var(--gray-50, #f8fafc);
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9999;
        animation: tsa-slide-in 0.25s ease-out;
        border: 1px solid var(--gray-200, #e2e8f0);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      [data-theme="dark"] .tsa-panel {
        background: var(--gray-900, #0f172a);
        border-color: var(--gray-700, #334155);
        box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
      }
      @keyframes tsa-slide-in {
        from { opacity: 0; transform: translateY(16px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* ─── Header ─── */
      .tsa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 14px 12px;
        background: var(--brand-gradient, linear-gradient(135deg, #0d9488 0%, #0284c7 100%));
        color: #fff;
        flex-shrink: 0;
      }
      .tsa-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .tsa-title {
        font-size: 0.92rem;
        font-weight: 600;
        line-height: 1.2;
      }
      .tsa-subtitle {
        font-size: 0.72rem;
        opacity: 0.85;
        line-height: 1.2;
      }
      .tsa-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .tsa-header-btn {
        background: rgba(255,255,255,0.15);
        border: none;
        color: #fff;
        border-radius: 8px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s;
      }
      .tsa-header-btn:hover { background: rgba(255,255,255,0.3); }

      /* ─── Body ─── */
      .tsa-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scroll-behavior: smooth;
      }

      /* ─── Welcome ─── */
      .tsa-welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 20px 8px 8px;
        gap: 10px;
      }
      .tsa-welcome-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--brand-gradient, linear-gradient(135deg, #0d9488 0%, #0284c7 100%));
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tsa-welcome h3 {
        font-size: 1rem;
        font-weight: 600;
        color: var(--gray-800, #1e293b);
        margin: 0;
      }
      [data-theme="dark"] .tsa-welcome h3 { color: var(--gray-100, #f1f5f9); }
      .tsa-welcome p {
        font-size: 0.82rem;
        color: var(--gray-500, #64748b);
        margin: 0;
        line-height: 1.5;
      }
      .tsa-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        margin-top: 8px;
      }
      .tsa-suggestion {
        background: var(--gray-100, #f1f5f9);
        border: 1px solid var(--gray-200, #e2e8f0);
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 0.75rem;
        color: var(--gray-800, #1e293b);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        text-align: left;
        line-height: 1.3;
        font-family: inherit;
      }
      .tsa-suggestion:hover {
        background: var(--gray-200, #e2e8f0);
        border-color: var(--brand-primary, #0d9488);
      }
      [data-theme="dark"] .tsa-suggestion {
        background: var(--gray-800, #1e293b);
        border-color: var(--gray-700, #334155);
        color: var(--gray-200, #e2e8f0);
      }
      [data-theme="dark"] .tsa-suggestion:hover {
        background: var(--gray-700, #334155);
      }

      /* ─── Messages ─── */
      .tsa-message {
        display: flex;
        max-width: 88%;
      }
      .tsa-message.user {
        align-self: flex-end;
        justify-content: flex-end;
      }
      .tsa-message.assistant {
        align-self: flex-start;
      }
      .tsa-message-content {
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 0.84rem;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .tsa-message.user .tsa-message-content {
        background: var(--brand-primary, #0d9488);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .tsa-message.assistant .tsa-message-content {
        background: var(--gray-100, #f1f5f9);
        color: var(--gray-800, #1e293b);
        border-bottom-left-radius: 4px;
      }
      [data-theme="dark"] .tsa-message.assistant .tsa-message-content {
        background: var(--gray-800, #1e293b);
        color: var(--gray-200, #e2e8f0);
      }
      .tsa-message.error .tsa-message-content {
        background: #fef2f2;
        color: #b91c1c;
        border: 1px solid #fecaca;
      }
      [data-theme="dark"] .tsa-message.error .tsa-message-content {
        background: #2d1b1b;
        color: #fca5a5;
        border-color: #7f1d1d;
      }
      .tsa-message-content.typing {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--gray-500, #64748b);
        font-style: italic;
      }
      .tsa-spin {
        animation: tsa-spinner 1s linear infinite;
      }
      @keyframes tsa-spinner {
        to { transform: rotate(360deg); }
      }

      /* ─── Input ─── */
      .tsa-input-area {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid var(--gray-200, #e2e8f0);
        background: var(--gray-50, #f8fafc);
        flex-shrink: 0;
      }
      [data-theme="dark"] .tsa-input-area {
        border-top-color: var(--gray-700, #334155);
        background: var(--gray-900, #0f172a);
      }
      .tsa-input {
        flex: 1;
        border: 1px solid var(--gray-200, #e2e8f0);
        border-radius: 22px;
        padding: 9px 16px;
        font-size: 0.84rem;
        background: #fff;
        color: var(--gray-800, #1e293b);
        outline: none;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      [data-theme="dark"] .tsa-input {
        background: var(--gray-800, #1e293b);
        border-color: var(--gray-600, #475569);
        color: var(--gray-100, #f1f5f9);
      }
      .tsa-input:focus {
        border-color: var(--brand-primary, #0d9488);
      }
      .tsa-input::placeholder { color: var(--gray-400, #94a3b8); }
      .tsa-input:disabled { opacity: 0.6; }
      .tsa-send-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: none;
        background: var(--brand-primary, #0d9488);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.15s;
        flex-shrink: 0;
      }
      .tsa-send-btn:hover:not(:disabled) {
        opacity: 0.9;
        transform: scale(1.05);
      }
      .tsa-send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* ─── Mobile ─── */
      @media (max-width: 500px) {
        .tsa-panel {
          width: calc(100vw - 16px);
          right: 8px;
          bottom: 16px;
          height: calc(100vh - 80px);
          border-radius: 12px;
        }
        .tsa-fab {
          bottom: 18px;
          right: 16px;
          width: 48px;
          height: 48px;
        }
        .tsa-minimized {
          bottom: 18px;
          right: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ── State ──
  let isOpen = false;
  let isMinimized = false;
  let isLoading = false;
  let messages = [];
  let container = null;

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) messages = JSON.parse(saved);
    } catch {}
    try {
      isMinimized = localStorage.getItem(MINIMIZED_KEY) === 'true';
    } catch {}
  }

  function saveMessages() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }

  function saveMinimized() {
    try {
      localStorage.setItem(MINIMIZED_KEY, String(isMinimized));
    } catch {}
  }

  function hasSeen() {
    try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
  }

  // ── Render ──
  function render() {
    if (!container) return;

    // FAB (closed state)
    if (!isOpen) {
      const showPulse = !hasSeen();
      container.innerHTML = `
        <button class="tsa-fab ${showPulse ? 'pulse' : ''}" id="tsaFab" title="Need help? Ask the support assistant">
          ${ICONS.messageCircleQuestion}
        </button>`;
      container.querySelector('#tsaFab').addEventListener('click', () => {
        isOpen = true;
        isMinimized = false;
        markSeen();
        render();
      });
      return;
    }

    // Minimized bar
    if (isMinimized) {
      container.innerHTML = `
        <div class="tsa-minimized" id="tsaMinBar">
          <div class="tsa-minimized-content">${ICONS.sparkles}<span>Support Assistant</span></div>
          <button class="tsa-minimized-close" id="tsaMinClose">${ICONS.xSmall}</button>
        </div>`;
      container.querySelector('#tsaMinBar').addEventListener('click', () => {
        isMinimized = false;
        saveMinimized();
        render();
      });
      container.querySelector('#tsaMinClose').addEventListener('click', (e) => {
        e.stopPropagation();
        isOpen = false;
        render();
      });
      return;
    }

    // Full panel
    const clearBtn = messages.length > 0
      ? `<button class="tsa-header-btn" id="tsaClear" title="Clear chat">${ICONS.trash}</button>`
      : '';

    let bodyHTML;
    if (messages.length === 0) {
      const suggestionsHTML = QUICK_SUGGESTIONS.map((s, i) =>
        `<button class="tsa-suggestion" data-idx="${i}">${escapeHTML(s)}</button>`
      ).join('');
      bodyHTML = `
        <div class="tsa-welcome">
          <div class="tsa-welcome-icon">${ICONS.sparklesBig}</div>
          <h3>Hi there! I'm your support assistant.</h3>
          <p>I know everything about this platform. Ask me anything — how to add clients, create meal plans, set up billing, customize branding, and more.</p>
          <div class="tsa-suggestions">${suggestionsHTML}</div>
        </div>`;
    } else {
      const msgsHTML = messages.map((msg) => {
        const cls = msg.role === 'user' ? 'user' : 'assistant';
        const errCls = msg.isError ? ' error' : '';
        return `<div class="tsa-message ${cls}${errCls}"><div class="tsa-message-content">${escapeHTML(msg.content)}</div></div>`;
      }).join('');
      const loadingHTML = isLoading
        ? `<div class="tsa-message assistant"><div class="tsa-message-content typing">${ICONS.loader}<span>Thinking...</span></div></div>`
        : '';
      bodyHTML = msgsHTML + loadingHTML + '<div id="tsaEnd"></div>';
    }

    container.innerHTML = `
      <div class="tsa-panel">
        <div class="tsa-header">
          <div class="tsa-header-left">
            ${ICONS.sparkles}
            <div>
              <div class="tsa-title">Support Assistant</div>
              <div class="tsa-subtitle">Ask me anything about the platform</div>
            </div>
          </div>
          <div class="tsa-header-actions">
            ${clearBtn}
            <button class="tsa-header-btn" id="tsaMinimize" title="Minimize">${ICONS.chevronDown}</button>
            <button class="tsa-header-btn" id="tsaClose" title="Close">${ICONS.x}</button>
          </div>
        </div>
        <div class="tsa-body" id="tsaBody">${bodyHTML}</div>
        <form class="tsa-input-area" id="tsaForm">
          <input type="text" class="tsa-input" id="tsaInput" placeholder="Ask a question..." autocomplete="off" ${isLoading ? 'disabled' : ''}>
          <button type="submit" class="tsa-send-btn" id="tsaSend" ${isLoading ? 'disabled' : ''}>${ICONS.send}</button>
        </form>
      </div>`;

    // Wire events
    container.querySelector('#tsaMinimize').addEventListener('click', () => {
      isMinimized = true;
      saveMinimized();
      render();
    });
    container.querySelector('#tsaClose').addEventListener('click', () => {
      isOpen = false;
      render();
    });
    if (container.querySelector('#tsaClear')) {
      container.querySelector('#tsaClear').addEventListener('click', () => {
        messages = [];
        saveMessages();
        render();
      });
    }

    // Quick suggestions
    container.querySelectorAll('.tsa-suggestion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        sendMessage(QUICK_SUGGESTIONS[idx]);
      });
    });

    // Form submission
    const form = container.querySelector('#tsaForm');
    const input = container.querySelector('#tsaInput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text && !isLoading) sendMessage(text);
    });

    // Scroll to bottom
    const end = container.querySelector('#tsaEnd');
    if (end) end.scrollIntoView({ behavior: 'smooth' });

    // Focus input
    setTimeout(() => {
      const inp = container.querySelector('#tsaInput');
      if (inp) inp.focus();
    }, 300);
  }

  // ── Send Message ──
  async function sendMessage(text) {
    if (!text || isLoading) return;

    messages.push({ role: 'user', content: text, timestamp: Date.now() });
    saveMessages();
    isLoading = true;
    render();

    try {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Use the global authenticatedFetch from api-helper.js if available,
      // otherwise fall back to fetching with auth token from supabase
      let data;
      if (typeof authenticatedFetch === 'function') {
        const response = await authenticatedFetch('/.netlify/functions/trainer-support-chat', {
          method: 'POST',
          body: JSON.stringify({ message: text, conversationHistory })
        });
        data = await response.json();
      } else {
        // Fallback: try getting token directly
        let token = null;
        const sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
        if (sb) {
          const { data: { session } } = await sb.auth.getSession();
          token = session?.access_token || null;
        }
        const response = await fetch('/.netlify/functions/trainer-support-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ message: text, conversationHistory })
        });
        data = await response.json();
      }

      messages.push({
        role: 'assistant',
        content: data.reply || "Sorry, I couldn't generate a response.",
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Support agent error:', err);
      messages.push({
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: Date.now(),
        isError: true
      });
    } finally {
      isLoading = false;
      saveMessages();
      render();
    }
  }

  // ── Helpers ──
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──
  function init() {
    injectStyles();
    loadState();

    container = document.createElement('div');
    container.id = 'trainer-support-agent';
    document.body.appendChild(container);

    render();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
