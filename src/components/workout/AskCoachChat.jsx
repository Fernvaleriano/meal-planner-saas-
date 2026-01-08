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
  const getFallbackResponse = (question, exerciseName, muscleGroup) => {
    const q = question.toLowerCase();
    const muscle = muscleGroup || 'target muscles';
    const nameLower = exerciseName.toLowerCase();

    // Body positioning questions - MUST come before weight questions (catches "how much/far do I bend")
    if (q.includes('bend') || q.includes('lean') || q.includes('angle') || q.includes('far') ||
        q.includes('position') || q.includes('degree') || q.includes('torso') || q.includes('back angle') ||
        (q.includes('how') && (q.includes('down') || q.includes('over')))) {
      // Check for specific exercises that have positioning requirements
      if (nameLower.includes('row') || nameLower.includes('bent')) {
        return `For body position on ${exerciseName}:\n\n• Hinge at hips until torso is roughly 45 degrees to the floor (closer to parallel for more lat emphasis)\n• Keep your back FLAT - no rounding\n• Slight bend in knees, weight in heels\n• Head neutral, eyes looking a few feet ahead\n• Your torso should stay still throughout - if you're bobbing up and down, the weight is too heavy\n\nThe more horizontal your torso, the more you target your lats. More upright hits upper back/traps more.`;
      } else if (nameLower.includes('deadlift') || nameLower.includes('rdl') || nameLower.includes('romanian')) {
        return `For body position on ${exerciseName}:\n\n• Push hips BACK (not down) - like closing a car door with your butt\n• Keep the bar/weight close to your legs throughout\n• Back stays flat/neutral - never rounded\n• Slight knee bend but this is a HIP movement\n• Go down until you feel a stretch in your hamstrings (usually around knee level)\n• Keep chest up and shoulder blades engaged`;
      } else if (nameLower.includes('squat')) {
        return `For body position on ${exerciseName}:\n\n• Feet shoulder-width or slightly wider, toes pointed out 15-30°\n• Break at hips AND knees together\n• Keep chest up - imagine someone's pulling you up by your shirt\n• Knees track over (or slightly outside) toes\n• Go as deep as you can while keeping back flat\n• Slight forward lean is fine, but torso stays relatively upright`;
      }
      return `For body position on ${exerciseName}:\n\n• Keep your core braced and spine neutral\n• Maintain proper alignment throughout the movement\n• If you're unsure about exact angles, start conservative and increase range of motion as you get comfortable\n• Film yourself from the side to check your form`;
    }

    if (q.includes('grip') || q.includes('wide') || q.includes('narrow') || q.includes('hand')) {
      return `For grip width on ${exerciseName}: A shoulder-width grip is a good starting point. Wider grips typically emphasize outer muscles more, while narrower grips target inner portions and often increase tricep involvement. Experiment to find what feels strongest and most comfortable for your body structure.`;
    } else if (q.includes('form') || q.includes('proper') || q.includes('technique') || q.includes('how do i')) {
      return `For ${exerciseName}:\n\n1. Set up with proper positioning - feet planted, core braced\n2. Control the weight through the full range of motion\n3. Focus on squeezing the ${muscle} at the peak contraction\n4. Lower under control (2-3 seconds)\n5. Breathe out on the exertion phase\n\nStart lighter to master the movement before adding weight.`;
    } else if ((q.includes('weight') || q.includes('heavy')) && !q.includes('body')) {
      // Only match weight questions if NOT asking about body position
      return `For weight selection on ${exerciseName}:\n\n• Hypertrophy (muscle growth): Choose a weight where 8-12 reps is challenging\n• Strength: Heavier weight, 4-6 reps\n• Endurance: Lighter weight, 15-20 reps\n\nYou should be able to complete your target reps with good form, but the last 2-3 reps should feel difficult.`;
    } else if (q.includes('mistake') || q.includes('wrong') || q.includes('avoid')) {
      return `Common mistakes on ${exerciseName}:\n\n• Using momentum/swinging to lift the weight\n• Not using full range of motion\n• Going too heavy too soon\n• Rushing through reps\n• Holding your breath\n\nFocus on mind-muscle connection and controlled movement.`;
    } else if (q.includes('home') || q.includes('alternative') || q.includes('substitute') || q.includes('replace')) {
      return `Alternatives to ${exerciseName}:\n\nLook for exercises that target the same muscle (${muscle}) with equipment you have. Resistance bands, dumbbells, or bodyweight variations often work well. The key is matching the movement pattern and muscle activation.`;
    } else if (q.includes('muscle') || q.includes('work') || q.includes('target')) {
      return `${exerciseName} primarily targets your ${muscle}. Secondary muscles involved typically include stabilizers and synergists that assist the movement. Focus on feeling the ${muscle} working throughout each rep for best results.`;
    } else if (q.includes('set') || q.includes('rep') || q.includes('how many')) {
      return `Rep and set recommendations for ${exerciseName}:\n\n• Muscle growth: 3-4 sets of 8-12 reps\n• Strength: 4-5 sets of 4-6 reps\n• Endurance: 2-3 sets of 15-20 reps\n\nRest 60-90 seconds between sets for hypertrophy, 2-3 minutes for strength work.`;
    } else if (q.includes('breathe') || q.includes('breathing')) {
      return `Breathing for ${exerciseName}:\n\n• Exhale during the exertion (lifting/pushing phase)\n• Inhale during the lowering phase\n• For heavy lifts, take a breath and brace your core before the rep\n• Never hold your breath for extended periods`;
    }
    return `For ${exerciseName}, focus on controlled movement through full range of motion. Keep the ${muscle} under tension throughout, and prioritize form over weight. If you have a specific question about grip, form, weight selection, or alternatives, I'm happy to help with more detail!`;
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      // Build conversation history for context (excluding welcome message)
      const conversationHistory = messages
        .filter(msg => msg.role !== 'coach' || !msg.text.includes("I'm your AI coach"))
        .map(msg => ({
          role: msg.role === 'coach' ? 'assistant' : 'user',
          content: msg.text
        }));

      const response = await apiPost('/.netlify/functions/exercise-coach', {
        mode: 'ask',
        exercise: {
          name: exercise?.name,
          muscle_group: exercise?.muscle_group || exercise?.muscleGroup,
          equipment: exercise?.equipment,
          instructions: exercise?.instructions
        },
        question,
        conversationHistory
      });

      if (response?.success && response?.answer) {
        setMessages(prev => [...prev, { role: 'coach', text: response.answer }]);
      } else {
        // Log any error info for debugging
        if (response?.error) {
          console.error('Coach API error:', response.error, response.debugInfo);
        }
        // Use fallback response if API didn't return valid answer
        const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup;
        setMessages(prev => [...prev, {
          role: 'coach',
          text: getFallbackResponse(question, exercise?.name || 'this exercise', muscleGroup)
        }]);
      }
    } catch (error) {
      console.error('Ask coach error:', error);
      // Use fallback response on error
      const muscleGroup = exercise?.muscle_group || exercise?.muscleGroup;
      setMessages(prev => [...prev, {
        role: 'coach',
        text: getFallbackResponse(question, exercise?.name || 'this exercise', muscleGroup)
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
