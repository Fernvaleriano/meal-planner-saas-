import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Dumbbell } from 'lucide-react';
import { apiPost } from '../../utils/api';

/**
 * Member-facing AI workout generator (gym / lite-mode members).
 *
 * Wraps the existing generate-workout-claude function, which already accepts
 * being called directly by a member (auth is optional) and reads the member's
 * saved equipment limits from their clientId. This component only collects a
 * few inputs, calls the generator in single-workout mode, and hands the result
 * back via onGenerated() to the page's normal ad-hoc save path.
 *
 * Every option here maps 1:1 to a parameter the generator already understands:
 * targetMuscle, trainingStyle, conditioningStyle, injuryCodes (deterministic
 * exercise exclusion), injuries (free text, mandatory block in the prompt) and
 * preferences (free text, mandatory block in the prompt).
 *
 * Exercise source:
 *  - 'library' (default): our global exercise library only (all have videos).
 *    coachId is NOT sent, so the generator loads globals only.
 *  - 'both': global library + the gym's own custom filmed exercises. coachId
 *    (the gym) IS sent, so loadExercises unions globals + the gym's customs.
 *  - 'gym': gym's own only — needs the gym to have filmed videos first, so it
 *    is disabled until then (the backend has no globals-excluded mode yet).
 */

const GOALS = [
  { value: 'hypertrophy', label: 'Build muscle' },
  { value: 'strength', label: 'Get stronger' },
  { value: 'weight_loss', label: 'Lose fat' },
  { value: 'endurance', label: 'Endurance' },
];

// Values map to the generator's muscleGroupMap keys.
const FOCUS = [
  { value: '', label: 'Full body' },
  { value: 'upper_body', label: 'Upper' },
  { value: 'lower_body', label: 'Lower' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'legs', label: 'Legs' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'core', label: 'Core / Abs' },
];

const EXPERIENCE = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const LENGTHS = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
];

// Maps to the generator's trainingStyle styleMap.
const STYLES = [
  { value: 'straight_sets', label: 'Straight sets', hint: 'One at a time' },
  { value: 'supersets', label: 'Supersets', hint: 'Paired exercises' },
  { value: 'circuits', label: 'Circuits', hint: '3-5 back to back' },
  { value: 'mixed', label: 'Mixed', hint: 'A bit of both' },
];

// Maps to the generator's conditioningStyle (finisher block).
const CARDIO = [
  { value: 'none', label: 'None' },
  { value: 'hiit', label: 'HIIT finisher' },
  { value: 'liss', label: 'Steady cardio' },
  { value: 'mixed', label: 'Surprise me' },
];

// Maps to the generator's INJURY_EXCLUSIONS codes — these deterministically
// remove risky exercises from the pool before the AI even sees them.
const INJURY_OPTIONS = [
  { value: 'lower_back', label: 'Lower back' },
  { value: 'knee', label: 'Knee' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'hip', label: 'Hip' },
  { value: 'neck', label: 'Neck' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'ankle', label: 'Ankle' },
];

const SOURCES = [
  { value: 'library', label: 'Our library', hint: 'Exercises with videos' },
  { value: 'both', label: 'Both', hint: 'Our library + gym' },
  { value: 'gym', label: 'Gym only', hint: 'Add videos first', disabled: true },
];

function GenerateWorkoutModal({ onClose, onGenerated, clientId = null, coachId = null }) {
  const [goal, setGoal] = useState('hypertrophy');
  const [focus, setFocus] = useState('');
  const [experience, setExperience] = useState('beginner');
  const [sessionDuration, setSessionDuration] = useState(45);
  const [style, setStyle] = useState('straight_sets');
  const [cardio, setCardio] = useState('none');
  const [injuryCodes, setInjuryCodes] = useState([]);
  const [injuryText, setInjuryText] = useState('');
  const [requests, setRequests] = useState('');
  const [source, setSource] = useState('library');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Prevents a double-fired tap from launching two (paid) AI generations and
  // saving the workout twice. Reset only on error so a retry is allowed.
  const submittingRef = useRef(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  const toggleInjury = (value) => {
    setInjuryCodes(prev => prev.includes(value)
      ? prev.filter(v => v !== value)
      : [...prev, value]);
  };

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const payload = {
        mode: 'single',
        goal,
        experience,
        sessionDuration,
        trainingStyle: style,
        conditioningStyle: cardio,
        clientId,
        varietySeed: Date.now(),
      };
      if (focus) payload.targetMuscle = focus;
      if (injuryCodes.length > 0) payload.injuryCodes = injuryCodes;
      if (injuryText.trim()) payload.injuries = injuryText.trim();
      if (requests.trim()) payload.preferences = requests.trim();
      // 'both' unions the gym's custom exercises; 'library' sends no coachId
      // so only the global library (all video-backed) is used.
      if (source === 'both' && coachId) payload.coachId = coachId;

      // AI generation runs longer than a normal request — allow up to 60s so
      // slow connections / cold starts don't abort a generation that is about
      // to succeed (the function itself is capped at 26s server-side).
      const res = await apiPost('/.netlify/functions/generate-workout-claude', payload, { timeoutMs: 60000 });
      if (!res?.success) throw new Error(res?.error || 'Could not generate a workout. Please try again.');

      const workout = res.program?.weeks?.[0]?.workouts?.[0];
      // Keep only matched exercises (they carry a real DB id + video). Unmatched
      // names have no id and would render blank in the workout viewer.
      const exercises = (workout?.exercises || []).filter((e) => e && e.id);
      if (!exercises.length) throw new Error('No matching exercises came back. Try again or widen the source.');

      onGenerated?.({
        name: workout.name || 'AI Workout',
        description: '',
        difficulty: experience.charAt(0).toUpperCase() + experience.slice(1),
        category: 'Main Workout Programs',
        frequency: 1,
        exercises,
      });
      onClose?.();
    } catch (err) {
      console.error('AI workout generation failed:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };
  const sheet = {
    background: 'var(--brand-card-color, #fff)', color: 'var(--brand-text-color, #16222c)',
    width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0',
    padding: '18px 18px calc(20px + env(safe-area-inset-bottom))',
    maxHeight: '92vh', overflowY: 'auto',
  };
  const groupLabel = { fontSize: 13, fontWeight: 700, opacity: 0.7, margin: '16px 2px 8px' };
  const groupHint = { fontSize: 12, opacity: 0.55, margin: '-4px 2px 8px' };
  const row = { display: 'flex', flexWrap: 'wrap', gap: 8 };
  const chip = (active, disabled) => ({
    flex: '1 1 auto', minWidth: 88, textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
    padding: '11px 10px', borderRadius: 11, fontSize: 14, fontWeight: 700,
    border: `1.5px solid ${active ? 'var(--brand-primary, #FF5A1F)' : 'rgba(128,128,128,0.28)'}`,
    background: active ? 'var(--brand-primary, #FF5A1F)' : 'transparent',
    color: active ? '#fff' : 'inherit', opacity: disabled ? 0.4 : 1,
  });
  const smallChip = (active) => ({
    ...chip(active),
    flex: '0 1 auto', minWidth: 70, padding: '9px 12px', fontSize: 13,
  });
  const textArea = {
    width: '100%', minHeight: 64, borderRadius: 11, padding: '10px 12px',
    border: '1.5px solid rgba(128,128,128,0.28)', background: 'transparent',
    color: 'inherit', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
  };

  return (
    <div style={overlay} onClick={() => !loading && onClose?.()}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18 }}>
            <Sparkles size={20} color="var(--brand-primary, #FF5A1F)" />
            Generate a workout
          </div>
          <button onClick={() => !loading && onClose?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={24} />
          </button>
        </div>
        <p style={{ fontSize: 14, opacity: 0.65, margin: '6px 2px 4px' }}>
          The AI builds today's workout around your goal and the gym's equipment.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0 40px' }}>
            <div className="spin" style={{
              width: 46, height: 46, margin: '0 auto 18px', borderRadius: '50%',
              border: '4px solid rgba(128,128,128,0.25)', borderTopColor: 'var(--brand-primary, #FF5A1F)',
              animation: 'giwSpin 0.8s linear infinite',
            }} />
            <div style={{ fontWeight: 700 }}>Building your workout…</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>This can take up to a minute</div>
            <style>{`@keyframes giwSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <div style={groupLabel}>MY GOAL</div>
            <div style={row}>
              {GOALS.map((o) => (
                <div key={o.value} style={chip(goal === o.value)} onClick={() => setGoal(o.value)}>{o.label}</div>
              ))}
            </div>

            <div style={groupLabel}>FOCUS / BODY PART</div>
            <div style={row}>
              {FOCUS.map((o) => (
                <div key={o.value} style={smallChip(focus === o.value)} onClick={() => setFocus(o.value)}>{o.label}</div>
              ))}
            </div>

            <div style={groupLabel}>EXPERIENCE</div>
            <div style={row}>
              {EXPERIENCE.map((o) => (
                <div key={o.value} style={chip(experience === o.value)} onClick={() => setExperience(o.value)}>{o.label}</div>
              ))}
            </div>

            <div style={groupLabel}>SESSION LENGTH</div>
            <div style={row}>
              {LENGTHS.map((o) => (
                <div key={o.value} style={smallChip(sessionDuration === o.value)} onClick={() => setSessionDuration(o.value)}>{o.label}</div>
              ))}
            </div>

            <div style={groupLabel}>WORKOUT STYLE</div>
            <div style={row}>
              {STYLES.map((o) => (
                <div key={o.value} style={chip(style === o.value)} onClick={() => setStyle(o.value)} title={o.hint}>
                  {o.label}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{o.hint}</div>
                </div>
              ))}
            </div>

            <div style={groupLabel}>CARDIO FINISHER</div>
            <div style={row}>
              {CARDIO.map((o) => (
                <div key={o.value} style={smallChip(cardio === o.value)} onClick={() => setCardio(o.value)}>{o.label}</div>
              ))}
            </div>

            <div style={groupLabel}>ANY INJURIES? (tap all that apply)</div>
            <div style={groupHint}>Exercises that stress these areas are removed automatically.</div>
            <div style={row}>
              {INJURY_OPTIONS.map((o) => (
                <div key={o.value} style={smallChip(injuryCodes.includes(o.value))} onClick={() => toggleInjury(o.value)}>{o.label}</div>
              ))}
            </div>
            <textarea
              style={{ ...textArea, marginTop: 8, minHeight: 48 }}
              placeholder="Anything else? e.g. recovering from a pulled hamstring"
              value={injuryText}
              onChange={(e) => setInjuryText(e.target.value)}
              maxLength={300}
            />

            <div style={groupLabel}>REQUESTS</div>
            <div style={groupHint}>Exercises you hate, things you want included — the AI follows this.</div>
            <textarea
              style={textArea}
              placeholder="e.g. no burpees, i don't like lunges, finish with abs, include hip thrusts"
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              maxLength={500}
            />

            <div style={groupLabel}>EXERCISES FROM</div>
            <div style={row}>
              {SOURCES.map((o) => (
                <div
                  key={o.value}
                  style={chip(source === o.value, o.disabled)}
                  onClick={() => !o.disabled && setSource(o.value)}
                  title={o.hint}
                >
                  {o.label}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{o.hint}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 14, color: '#e5484d', fontSize: 14, textAlign: 'center' }}>{error}</div>
            )}

            <button
              onClick={handleGenerate}
              style={{
                width: '100%', marginTop: 22, padding: 15, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: 'var(--brand-primary, #FF5A1F)', color: '#fff', fontSize: 16, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Dumbbell size={18} /> Generate workout
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default GenerateWorkoutModal;
