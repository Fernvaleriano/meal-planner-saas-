import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, MessageCircle, Bot } from 'lucide-react';
import { apiPost } from '../../utils/api';

function AskCoachChat({ exercise, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Add welcome message on mount
  useEffect(() => {
    setMessages([{
      role: 'coach',
      text: `Hi! I'm your AI coach. Ask me anything about ${exercise?.name || 'this exercise'} - form tips, equipment alternatives, common mistakes, or anything else!`
    }]);
  }, [exercise?.name]);

  // Generate a helpful fallback response based on the question
  const getFallbackResponse = (question, exerciseName) => {
    const q = question.toLowerCase();
    if (q.includes('form') || q.includes('proper') || q.includes('technique')) {
      return `For ${exerciseName}, focus on controlled movements and maintaining proper posture throughout. Start with lighter weight to perfect your form, and consider recording yourself or asking a trainer for feedback.`;
    } else if (q.includes('mistake') || q.includes('wrong') || q.includes('avoid')) {
      return `Common mistakes include using momentum instead of controlled movement, not using full range of motion, and lifting too heavy too soon. Take your time and focus on quality over quantity.`;
    } else if (q.includes('home') || q.includes('alternative') || q.includes('substitute')) {
      return `There are often bodyweight or resistance band alternatives you can do at home. Look for exercises that target the same muscle group with equipment you have available.`;
    } else if (q.includes('muscle') || q.includes('work') || q.includes('target')) {
      return `This exercise primarily targets your ${exercise?.muscle_group || exercise?.muscleGroup || 'target muscles'}. Focus on feeling the contraction in those muscles during each rep.`;
    }
    return `Great question about ${exerciseName}! For the best results, focus on proper form, controlled movements, and progressive overload. Consider consulting with a trainer for personalized guidance.`;
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const response = await apiPost('/.netlify/functions/exercise-coach', {
        mode: 'ask',
        exercise: {
          name: exercise?.name,
          muscle_group: exercise?.muscle_group || exercise?.muscleGroup,
          equipment: exercise?.equipment
        },
        question
      });

      if (response?.success && response?.answer) {
        setMessages(prev => [...prev, { role: 'coach', text: response.answer }]);
      } else {
        // Use fallback response if API didn't return valid answer
        setMessages(prev => [...prev, {
          role: 'coach',
          text: getFallbackResponse(question, exercise?.name || 'this exercise')
        }]);
      }
    } catch (error) {
      console.error('Ask coach error:', error);
      // Use fallback response on error
      setMessages(prev => [...prev, {
        role: 'coach',
        text: getFallbackResponse(question, exercise?.name || 'this exercise')
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, exercise]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick question suggestions
  const quickQuestions = [
    "What's the proper form?",
    "Common mistakes to avoid?",
    "Can I do this at home?",
    "What muscles does this work?"
  ];

  const handleQuickQuestion = (q) => {
    setInput(q);
    // Focus the input after setting
    inputRef.current?.focus();
  };

  return (
    <div className="ask-coach-overlay" onClick={onClose}>
      <div className="ask-coach-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ask-coach-header">
          <div className="coach-title">
            <Bot size={20} />
            <span>Ask Coach</span>
          </div>
          <button className="close-btn" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="ask-coach-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`coach-message ${msg.role}`}>
              {msg.role === 'coach' && (
                <div className="coach-avatar">
                  <Bot size={16} />
                </div>
              )}
              <div className="message-bubble">
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="coach-message coach">
              <div className="coach-avatar">
                <Bot size={16} />
              </div>
              <div className="message-bubble typing">
                <Loader2 size={16} className="spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions - only show if no user messages yet */}
        {messages.length <= 1 && (
          <div className="quick-questions">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                className="quick-question-btn"
                onClick={() => handleQuickQuestion(q)}
                type="button"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ask-coach-input">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask about form, alternatives, tips..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            type="button"
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AskCoachChat;
