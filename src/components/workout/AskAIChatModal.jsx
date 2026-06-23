import { useState, useEffect, useRef } from 'react';
import { X, Bot, Send, Check, Loader2 } from 'lucide-react';
import { apiPost, apiGet } from '../../utils/api';
import { getAnchorSet } from '../../utils/workoutProgression';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Reusable AI Coach Chat Modal.
 * Used in both GuidedWorkoutModal (play mode) and ExerciseCard.
 *
 * Props:
 *  - exerciseName: string
 *  - exerciseId: string — used to fetch history if lastSession not provided
 *  - exerciseType: string ('strength', 'cardio', etc.)
 *  - clientId: string — used to fetch history if lastSession not provided
 *  - lastSession: { reps, weight, effort } | null — if null, will auto-fetch
 *  - recommendation: { sets, reps, weight, reasoning } | null
 *  - weightUnit: 'lbs' | 'kg'
 *  - onClose: () => void
 *  - onAcceptRecommendation: (rec) => void  — optional, called when user taps Accept
 */
export default function AskAIChatModal({
  exerciseName,
  exerciseId,
  exerciseType = 'strength',
  clientId,
  lastSession: lastSessionProp = null,
  recommendation = null,
  weightUnit = 'lbs',
  onClose,
  onAcceptRecommendation
}) {
  const { t, language } = useLanguage();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRec, setCurrentRec] = useState(recommendation);
  const [lastSession, setLastSession] = useState(lastSessionProp);
  const [fetchingHistory, setFetchingHistory] = useState(!lastSessionProp && !!(clientId && (exerciseId || exerciseName)));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const buildInitialMessage = (session) => ({
    role: 'assistant',
    content: `Hey! Let's make this ${exerciseName || 'exercise'} count. ${
      session
        ? `Last session you hit ${session.reps} reps at ${session.weight}${weightUnit}.`
        : "This looks like your first time with this exercise — let's set a strong baseline!"
    } ${recommendation?.reasoning || ''}\n\nWhat's the game plan today?`
  });

  const [messages, setMessages] = useState(() => [buildInitialMessage(lastSessionProp)]);

  // Auto-fetch exercise history when lastSession not provided
  useEffect(() => {
    if (lastSessionProp || !clientId || (!exerciseId && !exerciseName)) return;

    let cancelled = false;
    const fetchHistory = async () => {
      try {
        let res = exerciseId
          ? await apiGet(`/.netlify/functions/exercise-history?clientId=${clientId}&exerciseId=${exerciseId}&limit=3`)
          : null;

        if ((!res?.history || res.history.length === 0) && exerciseName) {
          res = await apiGet(
            `/.netlify/functions/exercise-history?clientId=${clientId}&exerciseName=${encodeURIComponent(exerciseName)}&limit=3`
          );
        }

        if (cancelled) return;

        if (res?.history && res.history.length > 0) {
          const latest = res.history[0];
          let sets;
          try {
            sets = typeof latest.setsData === 'string' ? JSON.parse(latest.setsData) : (latest.setsData || []);
          } catch { sets = []; }
          if (Array.isArray(sets) && sets.length > 0) {
            // Anchor on the heaviest set so weight and reps come from the SAME set
            // (a warm-up ramp must not read as "best reps @ heaviest weight").
            const anchor = getAnchorSet(sets);
            const session = { reps: anchor.reps, weight: anchor.weight };
            setLastSession(session);
            // Update initial message with fetched data
            setMessages([buildInitialMessage(session)]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch exercise history for AI chat:', err);
      } finally {
        if (!cancelled) setFetchingHistory(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, []); // Run once on mount

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const quickSuggestions = [
    { key: 'askAiModal.suggestionFeelStrong',  text: t('askAiModal.suggestionFeelStrong') },
    { key: 'askAiModal.suggestionFeelingTired', text: t('askAiModal.suggestionFeelingTired') },
    { key: 'askAiModal.suggestionFeelsOff',    text: t('askAiModal.suggestionFeelsOff') },
    { key: 'askAiModal.suggestionHitPR',       text: t('askAiModal.suggestionHitPR') },
    { key: 'askAiModal.suggestionProgress',    text: t('askAiModal.suggestionProgress') },
  ];

  const handleSend = async (text) => {
    const userMessage = text || input.trim();
    if (!userMessage || loading) return;
    setInput('');

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await apiPost('/.netlify/functions/ai-coach-chat', {
        message: userMessage,
        language,
        context: {
          exerciseName,
          lastSession: lastSession || null,
          currentRecommendation: currentRec,
          exerciseType: exerciseType || 'strength'
        }
      });

      if (response?.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.reply }]);

        if (response.suggestedReps || response.suggestedWeight) {
          const newRec = {
            ...currentRec,
            reps: response.suggestedReps || currentRec?.reps,
            weight: response.suggestedWeight || currentRec?.weight,
            reasoning: response.reasoning || currentRec?.reasoning
          };
          setCurrentRec(newRec);
        }
      }
    } catch (err) {
      console.error('AI chat error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('askAiModal.connectionError')
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  const handleAccept = () => {
    if (onAcceptRecommendation && currentRec) {
      onAcceptRecommendation(currentRec);
    }
    onClose();
  };

  return (
    <div className="ask-ai-overlay" onClick={onClose}>
      <div className="ask-ai-modal" onClick={e => e.stopPropagation()}>
        <div className="ask-ai-header">
          <div className="ask-ai-header-left">
            <Bot size={20} />
            <span>{t('askAiModal.headerTitle')}</span>
          </div>
          <button className="ask-ai-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="ask-ai-exercise-context">
          <span>{exerciseName}</span>
          {currentRec && (
            <span className="ask-ai-current-rec">
              {t('askAiModal.currentRec', { sets: currentRec.sets, reps: currentRec.reps, weight: currentRec.weight || '—', unit: weightUnit })}
            </span>
          )}
        </div>

        <div className="ask-ai-messages">
          {fetchingHistory && (
            <div className="ask-ai-message assistant">
              <div className="ask-ai-avatar">
                <Bot size={16} />
              </div>
              <div className="ask-ai-bubble loading">
                <Loader2 size={16} className="spinning" />
                <span>{t('askAiModal.loadingHistory')}</span>
              </div>
            </div>
          )}
          {!fetchingHistory && messages.map((msg, i) => (
            <div key={i} className={`ask-ai-message ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="ask-ai-avatar">
                  <Bot size={16} />
                </div>
              )}
              <div className="ask-ai-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ask-ai-message assistant">
              <div className="ask-ai-avatar">
                <Bot size={16} />
              </div>
              <div className="ask-ai-bubble loading">
                <Loader2 size={16} className="spinning" />
                <span>{t('askAiModal.thinking')}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestions */}
        {!fetchingHistory && messages.length <= 2 && (
          <div className="ask-ai-suggestions">
            {quickSuggestions.map((suggestion, i) => (
              <button
                key={suggestion.key}
                className="ask-ai-suggestion-btn"
                onClick={() => handleSend(suggestion.text)}
                disabled={loading}
              >
                {suggestion.text}
              </button>
            ))}
          </div>
        )}

        <form className="ask-ai-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="ask-ai-input"
            placeholder={t('askAiModal.inputPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || fetchingHistory}
          />
          <button type="submit" className="ask-ai-send-btn" disabled={loading || fetchingHistory || !input.trim()}>
            <Send size={18} />
          </button>
        </form>

        {currentRec && onAcceptRecommendation && (
          <button className="ask-ai-accept-btn" onClick={handleAccept}>
            <Check size={16} />
            <span>{t('askAiModal.acceptRecommendation', { sets: currentRec.sets, reps: currentRec.reps, weight: currentRec.weight || '—', unit: weightUnit })}</span>
          </button>
        )}
      </div>
    </div>
  );
}
