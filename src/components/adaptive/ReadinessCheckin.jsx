import { useState } from 'react';
import {
  X, Moon, Battery, Brain, Frown, Smile, Meh,
  ChevronLeft, ChevronRight, Check, Activity
} from 'lucide-react';

const STEPS = [
  { key: 'sleep', label: 'Sleep', icon: Moon, question: 'How well did you sleep last night?' },
  { key: 'energy', label: 'Energy', icon: Battery, question: 'How is your energy level right now?' },
  { key: 'soreness', label: 'Soreness', icon: Activity, question: 'How sore are your muscles?' },
  { key: 'stress', label: 'Stress', icon: Brain, question: 'What is your stress level?' },
  { key: 'mood', label: 'Mood', icon: Smile, question: 'How is your overall mood?' }
];

function ReadinessCheckin({ onSubmit, onClose, existingData }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState({
    sleepQuality: existingData?.sleep_quality || null,
    sleepHours: existingData?.sleep_hours || null,
    energyLevel: existingData?.energy_level || null,
    muscleSoreness: existingData?.muscle_soreness || null,
    stressLevel: existingData?.stress_level || null,
    mood: existingData?.mood || null
  });

  const handleSliderChange = (key, value) => {
    const fieldMap = {
      sleep: 'sleepQuality',
      energy: 'energyLevel',
      soreness: 'muscleSoreness',
      stress: 'stressLevel',
      mood: 'mood'
    };
    setValues(prev => ({ ...prev, [fieldMap[key]]: parseInt(value) }));
  };

  const getCurrentValue = () => {
    const fieldMap = {
      sleep: 'sleepQuality',
      energy: 'energyLevel',
      soreness: 'muscleSoreness',
      stress: 'stressLevel',
      mood: 'mood'
    };
    return values[fieldMap[STEPS[step].key]];
  };

  const getLabel = (key, value) => {
    if (!value) return '';
    const labels = {
      sleep: ['', 'Terrible', 'Very poor', 'Poor', 'Below avg', 'Average', 'Decent', 'Good', 'Very good', 'Great', 'Perfect'],
      energy: ['', 'Exhausted', 'Very low', 'Low', 'Below avg', 'Average', 'Decent', 'Good', 'High', 'Very high', 'Energized'],
      soreness: ['', 'None', 'Minimal', 'Light', 'Mild', 'Moderate', 'Noticeable', 'Significant', 'Heavy', 'Very sore', 'Extreme'],
      stress: ['', 'None', 'Minimal', 'Low', 'Mild', 'Moderate', 'Noticeable', 'High', 'Very high', 'Extreme', 'Maxed out'],
      mood: ['', 'Terrible', 'Very low', 'Low', 'Below avg', 'Neutral', 'Decent', 'Good', 'Great', 'Excellent', 'Amazing']
    };
    return labels[key]?.[value] || '';
  };

  const getScoreColor = (key, value) => {
    if (!value) return 'var(--gray-400)';
    // For soreness and stress, lower is better (inverted)
    const inverted = key === 'soreness' || key === 'stress';
    const effective = inverted ? 11 - value : value;

    if (effective >= 8) return '#22c55e';
    if (effective >= 6) return '#eab308';
    if (effective >= 4) return '#f97316';
    return '#ef4444';
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = getCurrentValue() != null;
  const isLastStep = step === STEPS.length - 1;
  const currentStep = STEPS[step];
  const StepIcon = currentStep.icon;
  const currentValue = getCurrentValue();

  return (
    <div className="readiness-modal-overlay" onClick={onClose}>
      <div className="readiness-modal" onClick={e => e.stopPropagation()}>
        <div className="readiness-modal-header">
          <h2>Daily Readiness Check</h2>
          <button className="readiness-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Progress dots */}
        <div className="readiness-progress">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`readiness-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="readiness-step">
          <div className="readiness-step-icon" style={{ color: getScoreColor(currentStep.key, currentValue) }}>
            <StepIcon size={48} />
          </div>

          <h3 className="readiness-question">{currentStep.question}</h3>

          {/* Sleep hours (extra field for sleep step) */}
          {currentStep.key === 'sleep' && (
            <div className="readiness-sleep-hours">
              <label>Hours of sleep</label>
              <div className="sleep-hours-input">
                <button
                  onClick={() => setValues(prev => ({ ...prev, sleepHours: Math.max(0, (prev.sleepHours || 7) - 0.5) }))}
                  className="sleep-hours-btn"
                >-</button>
                <span className="sleep-hours-value">{values.sleepHours || '7.0'}h</span>
                <button
                  onClick={() => setValues(prev => ({ ...prev, sleepHours: Math.min(14, (prev.sleepHours || 7) + 0.5) }))}
                  className="sleep-hours-btn"
                >+</button>
              </div>
            </div>
          )}

          {/* Rating slider */}
          <div className="readiness-slider-container">
            <input
              type="range"
              min="1"
              max="10"
              value={currentValue || 5}
              onChange={(e) => handleSliderChange(currentStep.key, e.target.value)}
              className="readiness-slider"
              style={{
                '--slider-color': getScoreColor(currentStep.key, currentValue)
              }}
            />
            <div className="readiness-slider-labels">
              <span>1</span>
              <span className="readiness-current-label" style={{ color: getScoreColor(currentStep.key, currentValue) }}>
                {currentValue || '?'} - {getLabel(currentStep.key, currentValue)}
              </span>
              <span>10</span>
            </div>
          </div>

          {/* Quick select emoji buttons */}
          <div className="readiness-quick-select">
            {[
              { value: 2, icon: Frown, label: 'Poor' },
              { value: 5, icon: Meh, label: 'Average' },
              { value: 8, icon: Smile, label: 'Good' }
            ].map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                className={`readiness-quick-btn ${currentValue === value ? 'selected' : ''}`}
                onClick={() => handleSliderChange(currentStep.key, value)}
              >
                <Icon size={24} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="readiness-nav">
          <button
            className="readiness-nav-btn secondary"
            onClick={() => setStep(prev => prev - 1)}
            disabled={step === 0}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          {isLastStep ? (
            <button
              className="readiness-nav-btn primary"
              onClick={handleSubmit}
              disabled={!canProceed || submitting}
            >
              {submitting ? 'Saving...' : 'Complete'}
              <Check size={18} />
            </button>
          ) : (
            <button
              className="readiness-nav-btn primary"
              onClick={() => setStep(prev => prev + 1)}
              disabled={!canProceed}
            >
              Next
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReadinessCheckin;
