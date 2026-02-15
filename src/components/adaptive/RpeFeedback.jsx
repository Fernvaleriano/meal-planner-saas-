import { useState } from 'react';
import { apiPost } from '../../utils/api';
import { TrendingUp, TrendingDown, Minus, Target, Zap } from 'lucide-react';

/**
 * RPE Feedback component for real-time auto-regulation during workouts.
 * Shown after each set to collect perceived exertion and provide weight recommendations.
 */
function RpeFeedback({
  clientId,
  exerciseName,
  currentWeight,
  setNumber,
  weightUnit = 'lbs',
  targetRpe = 7.5,
  onWeightRecommendation,
  onDismiss
}) {
  const [selectedRpe, setSelectedRpe] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  const rpeOptions = [
    { value: 4, label: '4', description: 'Very easy - 6 reps left', color: '#22c55e' },
    { value: 5, label: '5', description: 'Easy - 5 reps left', color: '#22c55e' },
    { value: 6, label: '6', description: 'Moderate - 4 reps left', color: '#84cc16' },
    { value: 7, label: '7', description: 'Challenging - 3 reps left', color: '#eab308' },
    { value: 7.5, label: '7.5', description: 'Hard - 2-3 reps left', color: '#eab308' },
    { value: 8, label: '8', description: 'Hard - 2 reps left', color: '#f97316' },
    { value: 8.5, label: '8.5', description: 'Very hard - 1-2 reps left', color: '#f97316' },
    { value: 9, label: '9', description: 'Near max - 1 rep left', color: '#ef4444' },
    { value: 9.5, label: '9.5', description: 'Almost max - maybe 1 left', color: '#ef4444' },
    { value: 10, label: '10', description: 'Max effort - nothing left', color: '#dc2626' }
  ];

  const handleRpeSelect = async (rpe) => {
    setSelectedRpe(rpe);
    setLoading(true);

    try {
      const result = await apiPost('/.netlify/functions/rpe-engine', {
        clientId,
        exerciseName,
        currentWeight,
        reportedRpe: rpe,
        targetRpe,
        setNumber,
        weightUnit
      });

      setRecommendation(result);

      if (onWeightRecommendation) {
        onWeightRecommendation(result);
      }
    } catch (err) {
      console.error('RPE feedback error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rpe-feedback">
      <div className="rpe-feedback-header">
        <Target size={16} />
        <span>How did Set {setNumber} feel?</span>
        {currentWeight > 0 && (
          <span className="rpe-current-weight">
            {currentWeight} {weightUnit}
          </span>
        )}
      </div>

      {/* RPE Selection */}
      <div className="rpe-options">
        {rpeOptions.map(opt => (
          <button
            key={opt.value}
            className={`rpe-option ${selectedRpe === opt.value ? 'selected' : ''}`}
            style={{
              '--rpe-color': opt.color,
              borderColor: selectedRpe === opt.value ? opt.color : 'transparent',
              background: selectedRpe === opt.value ? opt.color + '15' : 'var(--gray-50)'
            }}
            onClick={() => handleRpeSelect(opt.value)}
            disabled={loading}
          >
            <span className="rpe-value" style={{ color: opt.color }}>{opt.label}</span>
            <span className="rpe-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      {/* Recommendation */}
      {loading && (
        <div className="rpe-loading">
          <div className="loading-spinner small" />
          <span>Calculating optimal weight...</span>
        </div>
      )}

      {recommendation && !loading && (
        <div className="rpe-recommendation">
          <div className="rpe-rec-header">
            <Zap size={16} />
            <strong>Next Set Recommendation</strong>
          </div>

          <div className="rpe-rec-weight">
            <span className="rpe-rec-value">
              {recommendation.nextSetWeight} {weightUnit}
            </span>
            {recommendation.adjustment !== 0 && (
              <span className={`rpe-rec-change ${recommendation.adjustment > 0 ? 'up' : 'down'}`}>
                {recommendation.adjustment > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {recommendation.adjustment > 0 ? '+' : ''}{recommendation.adjustment} {weightUnit}
                ({recommendation.adjustmentPercent > 0 ? '+' : ''}{recommendation.adjustmentPercent}%)
              </span>
            )}
            {recommendation.adjustment === 0 && (
              <span className="rpe-rec-change same">
                <Minus size={14} />
                Keep same weight
              </span>
            )}
          </div>

          <p className="rpe-rec-message">{recommendation.message}</p>

          <div className="rpe-rec-actions">
            <button
              className="rpe-rec-btn accept"
              onClick={() => {
                if (onWeightRecommendation) {
                  onWeightRecommendation({
                    ...recommendation,
                    accepted: true
                  });
                }
                if (onDismiss) onDismiss();
              }}
            >
              Use {recommendation.nextSetWeight} {weightUnit}
            </button>
            <button
              className="rpe-rec-btn keep"
              onClick={() => {
                if (onDismiss) onDismiss();
              }}
            >
              Keep current
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RpeFeedback;
