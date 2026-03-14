import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircleQuestion, X, Send, Loader, ChevronDown, Trash2, Sparkles } from 'lucide-react';
import { apiPost } from '../utils/api';

const STORAGE_KEY = 'trainer-support-chat-history';
const MINIMIZED_KEY = 'trainer-support-minimized';

// Quick-start suggestions for first-time users
const QUICK_SUGGESTIONS = [
  'How do I add a new client?',
  'How do I create a meal plan?',
  'How do I set up billing?',
  'How do I customize my branding?',
  'How do workouts work?',
  'How do I message clients?',
];

function TrainerSupportAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem(MINIMIZED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(() => {
    // Show pulse animation if user has never opened the chat
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return true;
    }
  });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatBodyRef = useRef(null);

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Save minimized state
  useEffect(() => {
    try {
      localStorage.setItem(MINIMIZED_KEY, isMinimized.toString());
    } catch {}
  }, [isMinimized]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      // Small delay to let animation finish
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isMinimized]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
    setShowPulse(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;

    const userMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const data = await apiPost('/.netlify/functions/trainer-support-chat', {
        message: trimmed,
        conversationHistory
      });

      const assistantMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    sendMessage();
  }, [sendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleSuggestionClick = useCallback((suggestion) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  // ─── Floating Button (when chat is closed) ───
  if (!isOpen) {
    return (
      <button
        className={`trainer-support-fab ${showPulse ? 'pulse' : ''}`}
        onClick={handleOpen}
        title="Need help? Ask the support assistant"
        aria-label="Open support assistant"
      >
        <MessageCircleQuestion size={24} />
      </button>
    );
  }

  // ─── Minimized Bar (when chat is minimized) ───
  if (isMinimized) {
    return (
      <div className="trainer-support-minimized" onClick={handleRestore}>
        <div className="trainer-support-minimized-content">
          <Sparkles size={16} />
          <span>Support Assistant</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="trainer-support-minimized-close">
          <X size={14} />
        </button>
      </div>
    );
  }

  // ─── Full Chat Panel ───
  return (
    <div className="trainer-support-panel">
      {/* Header */}
      <div className="trainer-support-header">
        <div className="trainer-support-header-left">
          <Sparkles size={18} />
          <div>
            <div className="trainer-support-title">Support Assistant</div>
            <div className="trainer-support-subtitle">Ask me anything about the platform</div>
          </div>
        </div>
        <div className="trainer-support-header-actions">
          {messages.length > 0 && (
            <button onClick={handleClearChat} className="trainer-support-header-btn" title="Clear chat">
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={handleMinimize} className="trainer-support-header-btn" title="Minimize">
            <ChevronDown size={18} />
          </button>
          <button onClick={handleClose} className="trainer-support-header-btn" title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="trainer-support-body" ref={chatBodyRef}>
        {messages.length === 0 ? (
          <div className="trainer-support-welcome">
            <div className="trainer-support-welcome-icon">
              <Sparkles size={32} />
            </div>
            <h3>Hi there! I'm your support assistant.</h3>
            <p>I know everything about this platform. Ask me anything — how to add clients, create meal plans, set up billing, customize branding, and more.</p>
            <div className="trainer-support-suggestions">
              {QUICK_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="trainer-support-suggestion"
                  onClick={() => handleSuggestionClick(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`trainer-support-message ${msg.role === 'user' ? 'user' : 'assistant'} ${msg.isError ? 'error' : ''}`}
              >
                <div className="trainer-support-message-content">
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="trainer-support-message assistant">
                <div className="trainer-support-message-content typing">
                  <Loader size={16} className="spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <form className="trainer-support-input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          className="trainer-support-input"
          disabled={isLoading}
          autoComplete="off"
        />
        <button
          type="submit"
          className="trainer-support-send"
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

export default TrainerSupportAgent;
