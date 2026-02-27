import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Users, TrendingUp, AlertCircle, ArrowRight, Mic, MicOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function CoachDashboard({ selectedClient, onSelectClient }) {
  const { clientData, user } = useAuth();
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!clientData?.id) return;
      try {
        const res = await fetch(`/.netlify/functions/get-dashboard-stats?coachId=${clientData.id}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [clientData?.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // Voice input
  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setMessage(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', content: trimmed };
    setConversation(prev => [...prev, userMsg]);
    setMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/.netlify/functions/coach-ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: clientData?.id,
          userId: user?.id,
          message: trimmed,
          clientId: selectedClient?.id || null,
          clientName: selectedClient?.client_name || null,
          conversationHistory: conversation.slice(-10),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: data.response || data.message || 'I processed your request.',
        }]);
      } else {
        setConversation(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I had trouble processing that. Try again.',
        }]);
      }
    } catch (err) {
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: "Who needs attention today?", icon: AlertCircle },
    { label: "Show me this week's activity", icon: TrendingUp },
    { label: "Create a new meal plan", icon: Sparkles },
    { label: "Client overview", icon: Users },
  ];

  const firstName = clientData?.client_name?.split(' ')[0] || 'Coach';

  return (
    <div className="coach-dashboard">
      {/* Chat area */}
      <div className="coach-dashboard-chat">
        {conversation.length === 0 ? (
          // Empty state - welcome + quick actions
          <div className="coach-dashboard-welcome">
            <div className="coach-dashboard-greeting">
              <Sparkles size={32} className="coach-dashboard-sparkle" />
              <h1>Hey {firstName}</h1>
              <p>What would you like to do today?</p>
            </div>

            {/* Stats cards */}
            {stats && (
              <div className="coach-dashboard-stats">
                {stats.totalClients !== undefined && (
                  <div className="coach-stat-card">
                    <Users size={20} />
                    <div className="coach-stat-value">{stats.totalClients}</div>
                    <div className="coach-stat-label">Active Clients</div>
                  </div>
                )}
                {stats.activeToday !== undefined && (
                  <div className="coach-stat-card">
                    <TrendingUp size={20} />
                    <div className="coach-stat-value">{stats.activeToday}</div>
                    <div className="coach-stat-label">Active Today</div>
                  </div>
                )}
                {stats.needsAttention !== undefined && (
                  <div className="coach-stat-card attention">
                    <AlertCircle size={20} />
                    <div className="coach-stat-value">{stats.needsAttention}</div>
                    <div className="coach-stat-label">Need Attention</div>
                  </div>
                )}
              </div>
            )}

            <div className="coach-dashboard-quick-actions">
              {quickActions.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className="coach-quick-action"
                  onClick={() => {
                    setMessage(label);
                    setTimeout(() => {
                      setMessage(label);
                      sendMessage();
                    }, 50);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>

            {selectedClient && (
              <div className="coach-dashboard-context">
                <span>Talking about</span>
                <strong>{selectedClient.client_name}</strong>
                <button onClick={() => onSelectClient(null)} className="coach-context-clear">Clear</button>
              </div>
            )}
          </div>
        ) : (
          // Conversation view
          <div className="coach-dashboard-messages">
            {selectedClient && (
              <div className="coach-dashboard-context sticky">
                <span>Talking about</span>
                <strong>{selectedClient.client_name}</strong>
                <button onClick={() => onSelectClient(null)} className="coach-context-clear">Clear</button>
              </div>
            )}
            {conversation.map((msg, i) => (
              <div key={i} className={`coach-message ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="coach-message-avatar">
                    <Sparkles size={16} />
                  </div>
                )}
                <div className="coach-message-content">
                  <div className="coach-message-text">{msg.content}</div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="coach-message assistant">
                <div className="coach-message-avatar">
                  <Sparkles size={16} />
                </div>
                <div className="coach-message-content">
                  <div className="coach-message-thinking">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area - always at bottom */}
      <div className="coach-dashboard-input-area">
        <div className="coach-dashboard-input-wrapper">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedClient
              ? `Ask about ${selectedClient.client_name}...`
              : "Ask anything — meal plans, client progress, insights..."
            }
            rows={1}
          />
          <div className="coach-dashboard-input-actions">
            <button
              onClick={toggleVoice}
              className={`coach-input-btn voice ${isListening ? 'listening' : ''}`}
              title="Voice input"
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={sendMessage}
              className="coach-input-btn send"
              disabled={!message.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachDashboard;
