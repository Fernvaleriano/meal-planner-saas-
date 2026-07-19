import { useState, useEffect } from 'react';
import { X, Sparkles, Dumbbell, CalendarX, Plane, Clock, BatteryLow } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Client-facing "Adjust my workout" — the RESTRICTED, plan-anchored AI tool for
 * full coaching clients (NOT the gym members' free-form generator).
 *
 * It never builds a new program. It takes the client's OWN coach-assigned
 * workouts and adapts them into ONE session for whatever got in the way:
 *   • behind     — blend the days they missed this week into a single catch-up.
 *   • travel     — adapt their planned session to a hotel gym / minimal / no kit.
 *   • short_time — condense their planned session into the minutes they've got.
 *
 * The reference workouts are the coach's plan, fetched per-date from
 * workout-assignments (the same endpoint the calendar uses), so the AI stays
 * anchored to what the coach programmed. The result is handed to the page's
 * existing ad-hoc save path (onGenerated) exactly like the gym generator.
 *
 * Props:
 *   missedDates:   [{ dateStr, dayLabel }]  planned days missed this week
 *   referenceDate: dateStr | null           today's (or next) planned session
 *   referenceLabel: string                   human label for referenceDate
 *   clientId, goal, language, onGenerated, onClose
 */

// Situations. `behind` is only offered when there's actually something missed.
const SITUATIONS = [
  { value: 'behind', label: 'I fell behind', hint: 'Squeeze my missed days into one', Icon: CalendarX },
  { value: 'travel', label: "I'm traveling", hint: 'Limited or no gym', Icon: Plane },
  { value: 'short_time', label: 'Short on time', hint: 'Fit it into what I have', Icon: Clock },
  { value: 'tired', label: 'Feeling beat up', hint: 'Go lighter today', Icon: BatteryLow },
];

// Travel equipment presets — map 1:1 to the backend's EQUIPMENT_PRESETS keys.
const EQUIPMENT = [
  { value: 'hotel_gym', label: 'Hotel gym', hint: 'Dumbbells + a few machines' },
  { value: 'minimal', label: 'Minimal', hint: 'Dumbbells / bands' },
  { value: 'bodyweight', label: 'No equipment', hint: 'Bodyweight only' },
];

const TIMES = [20, 30, 45];

function AdjustWorkoutModal({
  missedDates = [],
  referenceDate = null,
  referenceLabel = '',
  clientId = null,
  goal = '',
  language = 'en',
  onGenerated,
  onClose,
}) {
  const { t } = useLanguage();
  const hasMissed = Array.isArray(missedDates) && missedDates.length > 0;

  const [situation, setSituation] = useState(hasMissed ? 'behind' : 'travel');
  const [equipmentContext, setEquipmentContext] = useState('hotel_gym');
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  // Compact a stored plan exercise down to what the AI needs as reference.
  // Stored `sets` can be a number OR an array of set objects, and per-set data
  // may live under setsData — normalize both so the payload stays small + clean.
  const compactExercise = (ex) => {
    let setCount = 3;
    if (Array.isArray(ex.sets)) setCount = ex.sets.length;
    else if (Array.isArray(ex.setsData)) setCount = ex.setsData.length;
    else if (Number(ex.sets) > 0) setCount = Number(ex.sets);
    const firstSet = (Array.isArray(ex.setsData) && ex.setsData[0])
      || (Array.isArray(ex.sets) && ex.sets[0])
      || null;
    let reps = ex.reps;
    if (firstSet) reps = firstSet.reps != null ? firstSet.reps : (firstSet.duration ? `${firstSet.duration} sec` : reps);
    return {
      name: ex.name,
      sets: setCount,
      reps: reps != null ? String(reps) : '8-12',
      muscleGroup: ex.muscle_group || ex.muscleGroup || '',
      isWarmup: !!ex.isWarmup,
      isStretch: !!ex.isStretch,
      phase: ex.phase || 'main',
    };
  };

  // Pull the coach-assigned workouts for a set of dates (the calendar endpoint
  // resolves the right day of the program for each date). Prefer real coach
  // assignments over ad-hoc entries so we stay anchored to the plan.
  const fetchReferenceWorkouts = async (dateStrs) => {
    const out = [];
    for (const dateStr of dateStrs) {
      try {
        const res = await apiGet(`/.netlify/functions/workout-assignments?clientId=${encodeURIComponent(clientId)}&date=${encodeURIComponent(dateStr)}`);
        const assignments = Array.isArray(res?.assignments) ? res.assignments : [];
        const planned = assignments.filter(a => !a.is_adhoc);
        const use = planned.length ? planned : assignments;
        for (const a of use) {
          const exercises = (a.workout_data?.exercises || []).map(compactExercise).filter(e => e.name);
          if (exercises.length) out.push({ name: a.name || 'Workout', exercises });
        }
      } catch (err) {
        console.error('Could not load plan for', dateStr, err);
      }
    }
    return out;
  };

  const handleAdjust = async () => {
    setError('');
    setLoading(true);
    try {
      // Which planned session(s) are we adjusting?
      let dates = [];
      if (situation === 'behind') {
        dates = missedDates.map(d => d.dateStr);
      } else if (referenceDate) {
        dates = [referenceDate];
      } else if (hasMissed) {
        // Traveling/short but today's a rest day — fall back to the missed work.
        dates = missedDates.map(d => d.dateStr);
      }

      if (!dates.length) {
        throw new Error("There's no planned workout to adjust right now. Check back on a training day.");
      }

      const referenceWorkouts = await fetchReferenceWorkouts(dates);
      if (!referenceWorkouts.length) {
        throw new Error("Couldn't find your planned workouts to adjust. Please try again.");
      }

      const payload = {
        clientId,
        situation,
        referenceWorkouts,
        language,
      };
      if (goal) payload.goal = goal;
      if (situation === 'travel') payload.equipmentContext = equipmentContext;
      if (situation === 'short_time') payload.timeMinutes = timeMinutes;
      if (note.trim()) payload.notes = note.trim();

      const res = await apiPost('/.netlify/functions/adjust-workout-claude', payload, { timeoutMs: 60000 });
      if (!res?.success) throw new Error(res?.error || 'Could not adjust your workout. Please try again.');

      const workout = res.program?.weeks?.[0]?.workouts?.[0];
      const exercises = (workout?.exercises || []).filter(e => e && e.id);
      if (!exercises.length) throw new Error('The adjusted workout came back empty. Please try again.');

      // Give it a cover from the shared library (best-effort, same as the gym generator).
      let coverUrl = null;
      try {
        const lib = await apiGet('/.netlify/functions/workout-cover-library');
        const covers = Array.isArray(lib?.covers) ? lib.covers : [];
        if (covers.length) coverUrl = covers[Math.floor(Math.random() * covers.length)].url;
      } catch (coverErr) {
        console.error('Could not fetch a cover for the adjusted workout:', coverErr);
      }

      onGenerated?.({
        name: workout.name || 'Adjusted Workout',
        description: '',
        category: 'Main Workout Programs',
        frequency: 1,
        exercises,
        image_url: coverUrl,
      });
      onClose?.();
    } catch (err) {
      console.error('Adjust workout failed:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };
  const sheet = {
    background: '#000', color: '#fff', width: '100%', maxWidth: 520,
    borderRadius: '18px 18px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
  };
  const scrollBody = { overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: 4 };
  const footer = { paddingTop: 12, marginTop: 10, borderTop: '1px solid rgba(128,128,128,0.2)' };
  const groupLabel = { fontSize: 13, fontWeight: 700, opacity: 0.7, margin: '16px 2px 8px' };
  const groupHint = { fontSize: 12, opacity: 0.55, margin: '-4px 2px 8px' };
  const row = { display: 'flex', flexWrap: 'wrap', gap: 8 };
  const chip = (active) => ({
    flex: '1 1 auto', minWidth: 96, textAlign: 'center', cursor: 'pointer',
    padding: '12px 10px', borderRadius: 11, fontSize: 14, fontWeight: 700,
    border: `1.5px solid ${active ? 'var(--brand-primary, #FF5A1F)' : 'rgba(128,128,128,0.28)'}`,
    background: active ? 'var(--brand-primary, #FF5A1F)' : 'transparent',
    color: active ? '#fff' : 'inherit',
  });
  const smallChip = (active) => ({ ...chip(active), flex: '0 1 auto', minWidth: 76, padding: '10px 12px', fontSize: 13 });

  const missedLabels = missedDates.map(d => d.dayLabel).filter(Boolean);
  const subtitle = {
    behind: hasMissed
      ? `You missed ${missedDates.length} planned ${missedDates.length === 1 ? 'day' : 'days'} this week. I'll blend the key work into one session to get you back on track.`
      : "You're all caught up — nothing missed this week.",
    travel: 'I\'ll adapt your planned session to whatever you\'ve got with you.',
    short_time: 'I\'ll trim your planned session down to the time you have.',
    tired: 'I\'ll keep the main lifts but dial the volume and intensity back for a recovery-minded day.',
  }[situation];

  return (
    <div style={overlay} onClick={() => !loading && onClose?.()}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18 }}>
            <Sparkles size={20} color="var(--brand-primary, #FF5A1F)" />
            Adjust my workout
          </div>
          <button onClick={() => !loading && onClose?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={24} />
          </button>
        </div>
        <p style={{ fontSize: 14, opacity: 0.65, margin: '6px 2px 4px' }}>
          Keeps you on your coach's plan — just flexed to fit your week.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0 40px' }}>
            <div style={{
              width: 46, height: 46, margin: '0 auto 18px', borderRadius: '50%',
              border: '4px solid rgba(128,128,128,0.25)', borderTopColor: 'var(--brand-primary, #FF5A1F)',
              animation: 'awmSpin 0.8s linear infinite',
            }} />
            <div style={{ fontWeight: 700 }}>Adjusting your workout…</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>Reworking your plan around your situation.</div>
            <style>{`@keyframes awmSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <div style={scrollBody}>
              <div style={groupLabel}>WHAT CAME UP?</div>
              <div style={row}>
                {SITUATIONS.map((o) => {
                  const disabled = o.value === 'behind' && !hasMissed;
                  const active = situation === o.value;
                  return (
                    <div
                      key={o.value}
                      style={{ ...chip(active), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
                      onClick={() => !disabled && setSituation(o.value)}
                    >
                      <o.Icon size={18} style={{ marginBottom: 4 }} />
                      <div>{o.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.75, marginTop: 2 }}>{o.hint}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ ...groupHint, marginTop: 12 }}>{subtitle}</div>

              {situation === 'behind' && missedLabels.length > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, margin: '2px 2px 4px', color: 'var(--brand-primary, #FF5A1F)' }}>
                  Catching up: {missedLabels.join(' + ')}
                </div>
              )}

              {situation === 'travel' && (
                <>
                  <div style={groupLabel}>WHAT DO YOU HAVE?</div>
                  <div style={row}>
                    {EQUIPMENT.map((o) => (
                      <div key={o.value} style={smallChip(equipmentContext === o.value)} onClick={() => setEquipmentContext(o.value)}>
                        {o.label}
                        <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginTop: 2 }}>{o.hint}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {situation === 'short_time' && (
                <>
                  <div style={groupLabel}>HOW LONG DO YOU HAVE?</div>
                  <div style={row}>
                    {TIMES.map((n) => (
                      <div key={n} style={smallChip(timeMinutes === n)} onClick={() => setTimeMinutes(n)}>{n} min</div>
                    ))}
                  </div>
                </>
              )}

              {(situation === 'travel' || situation === 'short_time' || situation === 'tired') && !referenceDate && !hasMissed && (
                <div style={{ ...groupHint, marginTop: 12, color: '#e5a23d' }}>
                  No workout scheduled right now — open this on a training day and I'll have a session to adjust.
                </div>
              )}

              <div style={groupLabel}>ANYTHING I SHOULD KNOW?</div>
              <textarea
                style={{
                  width: '100%', minHeight: 52, borderRadius: 11, padding: '10px 12px',
                  border: '1.5px solid rgba(128,128,128,0.28)', background: 'transparent',
                  color: 'inherit', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                }}
                placeholder="e.g. tweaked my shoulder, no squat rack today, knees a bit sore"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
              />
            </div>

            <div style={footer}>
              {error && (
                <div style={{ marginBottom: 10, color: '#e5484d', fontSize: 14, textAlign: 'center' }}>{error}</div>
              )}
              <button
                onClick={handleAdjust}
                style={{
                  width: '100%', padding: 15, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: 'var(--brand-primary, #FF5A1F)', color: '#fff', fontSize: 16, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Dumbbell size={18} /> Adjust my workout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdjustWorkoutModal;
