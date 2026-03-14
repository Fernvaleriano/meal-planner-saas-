import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus, Trophy, Target, Flame, Footprints, Droplets, Dumbbell, CheckCircle, Users, Calendar, ChevronRight, X, Loader2, Award, TrendingUp, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useToast } from '../components/Toast';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

const CHALLENGE_TYPES = [
  { key: 'gym_checkin', label: 'Gym Check-in', icon: Dumbbell, color: '#f97316', description: 'Clients prove they went to the gym daily' },
  { key: 'weight_loss', label: 'Weight Loss', icon: TrendingUp, color: '#ef4444', description: 'Track weight loss toward a goal' },
  { key: 'consistency', label: 'Consistency Streak', icon: Flame, color: '#f59e0b', description: 'Log meals/workouts X days in a row' },
  { key: 'water_intake', label: 'Water Intake', icon: Droplets, color: '#3b82f6', description: 'Hit daily water intake targets' },
  { key: 'steps', label: 'Daily Steps', icon: Footprints, color: '#10b981', description: 'Hit a daily step count goal' },
  { key: 'custom', label: 'Custom', icon: Target, color: '#8b5cf6', description: 'Define your own challenge rules' }
];

const TYPE_DEFAULTS = {
  gym_checkin: { targetValue: '', targetUnit: 'days', frequency: 'daily' },
  weight_loss: { targetValue: '', targetUnit: 'lbs', frequency: 'weekly' },
  consistency: { targetValue: '30', targetUnit: 'days', frequency: 'daily' },
  water_intake: { targetValue: '64', targetUnit: 'oz', frequency: 'daily' },
  steps: { targetValue: '10000', targetUnit: 'steps', frequency: 'daily' },
  custom: { targetValue: '', targetUnit: '', frequency: 'daily' }
};

function getTypeConfig(type) {
  return CHALLENGE_TYPES.find(t => t.key === type) || CHALLENGE_TYPES[5];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// ─── Coach View: Create & Manage Challenges ───────────────────────────
function CoachChallenges() {
  const { user } = useAuth();
  const { showError, showSuccess } = useToast();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchChallenges = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiGet(`/.netlify/functions/coach-challenges?coachId=${user.id}`);
      setChallenges(data?.challenges || []);
    } catch (err) {
      showError('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);
  usePullToRefreshEvent(fetchChallenges);

  const fetchDetail = async (challengeId) => {
    setLoadingDetail(true);
    try {
      const data = await apiGet(`/.netlify/functions/coach-challenges?coachId=${user.id}&challengeId=${challengeId}`);
      setDetailData(data);
    } catch (err) {
      showError('Failed to load challenge details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectChallenge = (challenge) => {
    setSelectedChallenge(challenge);
    fetchDetail(challenge.id);
  };

  const handleEndChallenge = async (challengeId) => {
    try {
      await apiPut('/.netlify/functions/coach-challenges', { challengeId, coachId: user.id, status: 'completed' });
      showSuccess('Challenge ended');
      setSelectedChallenge(null);
      setDetailData(null);
      fetchChallenges();
    } catch (err) {
      showError('Failed to end challenge');
    }
  };

  const handleDeleteChallenge = async (challengeId) => {
    try {
      await apiDelete('/.netlify/functions/coach-challenges', { challengeId, coachId: user.id });
      showSuccess('Challenge deleted');
      setSelectedChallenge(null);
      setDetailData(null);
      fetchChallenges();
    } catch (err) {
      showError('Failed to delete challenge');
    }
  };

  // Challenge Detail View
  if (selectedChallenge) {
    const config = getTypeConfig(selectedChallenge.challenge_type);
    const Icon = config.icon;
    const isActive = selectedChallenge.status === 'active';
    const remaining = daysUntil(selectedChallenge.end_date);

    return (
      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => { setSelectedChallenge(null); setDetailData(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          <ChevronLeft size={18} /> Back to Challenges
        </button>

        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${config.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color={config.color} />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>{selectedChallenge.title}</h2>
              <span style={{ fontSize: 12, color: config.color, fontWeight: 600, textTransform: 'uppercase' }}>{config.label}</span>
            </div>
            <span style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: isActive ? '#10b98120' : '#64748b20',
              color: isActive ? '#10b981' : '#64748b'
            }}>
              {isActive ? 'Active' : selectedChallenge.status}
            </span>
          </div>

          {selectedChallenge.description && (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{selectedChallenge.description}</p>
          )}

          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={14} /> {formatDate(selectedChallenge.start_date)} - {formatDate(selectedChallenge.end_date)}
            </span>
            {isActive && remaining > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={14} /> {remaining} days left
              </span>
            )}
          </div>

          {selectedChallenge.target_value && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, fontSize: 13 }}>
              <strong>Target:</strong> {selectedChallenge.target_value} {selectedChallenge.target_unit} ({selectedChallenge.frequency})
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={18} color="#f59e0b" /> Leaderboard
          </h3>

          {loadingDetail ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={24} className="spin" /></div>
          ) : detailData?.leaderboard?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detailData.leaderboard.map((entry, i) => (
                <div key={entry.clientId} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  background: i === 0 ? '#f59e0b10' : 'var(--bg-primary)',
                  borderRadius: 10,
                  border: i === 0 ? '1px solid #f59e0b30' : '1px solid transparent'
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--card-bg)',
                    color: i < 3 ? '#fff' : 'var(--text-secondary)'
                  }}>
                    {i + 1}
                  </span>
                  {entry.profilePhoto ? (
                    <img src={entry.profilePhoto} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {(entry.clientName || '?')[0]}
                    </div>
                  )}
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{entry.clientName}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: config.color }}>{entry.totalDays} days</div>
                    {entry.currentStreak > 0 && (
                      <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                        <Flame size={12} /> {entry.currentStreak} streak
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>No progress logged yet</p>
          )}
        </div>

        {/* Actions */}
        {isActive && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => handleEndChallenge(selectedChallenge.id)} style={{
              flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #f59e0b40',
              background: 'transparent', color: '#f59e0b', fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              End Challenge
            </button>
            <button onClick={() => handleDeleteChallenge(selectedChallenge.id)} style={{
              padding: '12px 16px', borderRadius: 10, border: '1px solid #ef444440',
              background: 'transparent', color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  // Create Challenge Form
  if (showCreate) {
    return <CreateChallengeForm coachId={user?.id} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchChallenges(); }} />;
  }

  // Challenge List
  const active = challenges.filter(c => c.status === 'active');
  const past = challenges.filter(c => c.status !== 'active');

  return (
    <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)' }}>Challenges</h1>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
          background: 'var(--accent-color, #f97316)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>
          <Plus size={16} /> New
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} className="spin" /></div>
      ) : challenges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <Trophy size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 500 }}>No challenges yet</p>
          <p style={{ fontSize: 14 }}>Create a challenge to motivate your clients!</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Active</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {active.map(c => <ChallengeCard key={c.id} challenge={c} onClick={() => handleSelectChallenge(c)} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Past</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {past.map(c => <ChallengeCard key={c.id} challenge={c} onClick={() => handleSelectChallenge(c)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChallengeCard({ challenge, onClick }) {
  const config = getTypeConfig(challenge.challenge_type);
  const Icon = config.icon;
  const isActive = challenge.status === 'active';
  const remaining = daysUntil(challenge.end_date);

  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      background: 'var(--card-bg)', borderRadius: 14, border: 'none', cursor: 'pointer',
      width: '100%', textAlign: 'left'
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${config.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={config.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{challenge.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {formatDate(challenge.start_date)} - {formatDate(challenge.end_date)}
          {isActive && remaining > 0 && ` · ${remaining}d left`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={14} /> {challenge.participant_count || 0}
        </span>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
    </button>
  );
}

// ─── Create Challenge Form ────────────────────────────────────────────
function CreateChallengeForm({ coachId, onClose, onCreated }) {
  const { showError, showSuccess } = useToast();
  const [step, setStep] = useState(1); // 1=type, 2=details
  const [selectedType, setSelectedType] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [assignTo, setAssignTo] = useState('all');
  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (assignTo === 'selected' && clients.length === 0) {
      setLoadingClients(true);
      apiGet(`/.netlify/functions/get-clients?coachId=${coachId}`)
        .then(data => setClients(data?.clients || []))
        .catch(() => {})
        .finally(() => setLoadingClients(false));
    }
  }, [assignTo, coachId]);

  const handleSelectType = (type) => {
    setSelectedType(type);
    const defaults = TYPE_DEFAULTS[type];
    setTargetValue(defaults.targetValue);
    setTargetUnit(defaults.targetUnit);
    setFrequency(defaults.frequency);
    // Auto-generate title
    const config = CHALLENGE_TYPES.find(t => t.key === type);
    if (config && !title) {
      const month = new Date().toLocaleDateString('en-US', { month: 'long' });
      setTitle(`${month} ${config.label} Challenge`);
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { showError('Please enter a title'); return; }
    if (!startDate || !endDate) { showError('Please set start and end dates'); return; }
    if (new Date(endDate) <= new Date(startDate)) { showError('End date must be after start date'); return; }

    setSubmitting(true);
    try {
      await apiPost('/.netlify/functions/coach-challenges', {
        coachId,
        title: title.trim(),
        description: description.trim() || null,
        challengeType: selectedType || 'custom',
        targetValue: targetValue ? parseFloat(targetValue) : null,
        targetUnit: targetUnit || null,
        frequency,
        startDate,
        endDate,
        assignTo,
        clientIds: assignTo === 'selected' ? selectedClients : null
      });
      showSuccess('Challenge created!');
      onCreated();
    } catch (err) {
      showError('Failed to create challenge');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Choose Type
  if (step === 1) {
    return (
      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          <ChevronLeft size={18} /> Back
        </button>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--text-primary)' }}>New Challenge</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>Choose a challenge type</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CHALLENGE_TYPES.map(type => {
            const Icon = type.icon;
            return (
              <button key={type.key} onClick={() => handleSelectType(type.key)} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
                background: 'var(--card-bg)', borderRadius: 14, border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left'
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${type.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={22} color={type.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{type.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{type.description}</div>
                </div>
                <ChevronRight size={18} color="var(--text-secondary)" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2: Details
  const typeConfig = getTypeConfig(selectedType);
  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-color, #333)',
    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box'
  };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };

  return (
    <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
      <button onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        <ChevronLeft size={18} /> Change Type
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${typeConfig.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <typeConfig.icon size={18} color={typeConfig.color} />
        </div>
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>Challenge Details</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. March Gym Challenge" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the challenge rules and rewards..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {selectedType !== 'custom' && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Target</label>
              <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder="e.g. 10000" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Unit</label>
              <input value={targetUnit} onChange={e => setTargetUnit(e.target.value)} placeholder="e.g. steps" style={inputStyle} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Frequency</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['daily', 'weekly', 'one_time'].map(f => (
              <button key={f} onClick={() => setFrequency(f)} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${frequency === f ? 'var(--accent-color, #f97316)' : 'var(--border-color, #333)'}`,
                background: frequency === f ? 'var(--accent-color, #f97316)15' : 'transparent',
                color: frequency === f ? 'var(--accent-color, #f97316)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
              }}>
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Assign To</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAssignTo('all')} style={{
              flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${assignTo === 'all' ? 'var(--accent-color, #f97316)' : 'var(--border-color, #333)'}`,
              background: assignTo === 'all' ? 'var(--accent-color, #f97316)15' : 'transparent',
              color: assignTo === 'all' ? 'var(--accent-color, #f97316)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              All Clients
            </button>
            <button onClick={() => setAssignTo('selected')} style={{
              flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${assignTo === 'selected' ? 'var(--accent-color, #f97316)' : 'var(--border-color, #333)'}`,
              background: assignTo === 'selected' ? 'var(--accent-color, #f97316)15' : 'transparent',
              color: assignTo === 'selected' ? 'var(--accent-color, #f97316)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              Select Clients
            </button>
          </div>
        </div>

        {assignTo === 'selected' && (
          <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border-color, #333)' }}>
            {loadingClients ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={20} className="spin" /></div>
            ) : clients.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No active clients</div>
            ) : (
              clients.map(c => (
                <label key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color, #222)'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedClients.includes(c.id)}
                    onChange={e => {
                      setSelectedClients(prev =>
                        e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                      );
                    }}
                    style={{ accentColor: 'var(--accent-color, #f97316)' }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{c.client_name}</span>
                </label>
              ))
            )}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting} style={{
          padding: '14px', borderRadius: 12, border: 'none',
          background: 'var(--accent-color, #f97316)', color: '#fff', fontSize: 16, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, marginTop: 8
        }}>
          {submitting ? 'Creating...' : 'Create Challenge'}
        </button>
      </div>
    </div>
  );
}

// ─── Client View: Participate in Challenges ───────────────────────────
function ClientChallenges() {
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [logging, setLogging] = useState(false);

  const fetchChallenges = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const data = await apiGet(`/.netlify/functions/client-challenges?clientId=${clientData.id}`);
      setChallenges(data?.challenges || []);
    } catch (err) {
      showError('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, [clientData?.id]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);
  usePullToRefreshEvent(fetchChallenges);

  const fetchDetail = async (challengeId) => {
    setLoadingDetail(true);
    try {
      const data = await apiGet(`/.netlify/functions/client-challenges?clientId=${clientData.id}&challengeId=${challengeId}`);
      setDetailData(data);
    } catch (err) {
      showError('Failed to load challenge');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLogProgress = async (challengeId, challengeType) => {
    setLogging(true);
    try {
      const isValueType = ['weight_loss', 'water_intake', 'steps'].includes(challengeType);
      await apiPost('/.netlify/functions/client-challenges', {
        clientId: clientData.id,
        challengeId,
        value: isValueType && logValue ? parseFloat(logValue) : null,
        completed: true
      });
      showSuccess('Progress logged!');
      setLogValue('');
      // Refresh detail
      fetchDetail(challengeId);
      fetchChallenges();
    } catch (err) {
      showError('Failed to log progress');
    } finally {
      setLogging(false);
    }
  };

  // Challenge Detail
  if (selectedChallenge) {
    const config = getTypeConfig(selectedChallenge.challenge_type);
    const Icon = config.icon;
    const isValueType = ['weight_loss', 'water_intake', 'steps'].includes(selectedChallenge.challenge_type);

    return (
      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => { setSelectedChallenge(null); setDetailData(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          <ChevronLeft size={18} /> Back
        </button>

        {/* Challenge Header */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${config.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color={config.color} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>{selectedChallenge.title}</h2>
              <span style={{ fontSize: 12, color: config.color, fontWeight: 600 }}>{config.label}</span>
            </div>
          </div>

          {selectedChallenge.description && (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{selectedChallenge.description}</p>
          )}

          {/* Stats */}
          {detailData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
              <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{detailData.streak}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Streak</div>
              </div>
              <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{detailData.daysCompleted}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Days Done</div>
              </div>
              <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{detailData.daysRemaining}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Days Left</div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {detailData && detailData.totalDays > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>Progress</span>
                <span>{Math.round((detailData.daysCompleted / detailData.totalDays) * 100)}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: `linear-gradient(90deg, ${config.color}, ${config.color}cc)`,
                  width: `${Math.min(100, (detailData.daysCompleted / detailData.totalDays) * 100)}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Log Today */}
        {detailData && !detailData.todayLog && selectedChallenge.status === 'active' && (
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text-primary)' }}>Log Today</h3>
            {isValueType ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="number"
                  value={logValue}
                  onChange={e => setLogValue(e.target.value)}
                  placeholder={`Enter ${selectedChallenge.target_unit || 'value'}`}
                  style={{
                    flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-color, #333)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14
                  }}
                />
                <button onClick={() => handleLogProgress(selectedChallenge.id, selectedChallenge.challenge_type)} disabled={logging || !logValue} style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: 'var(--accent-color, #f97316)', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: logging || !logValue ? 'not-allowed' : 'pointer', opacity: logging || !logValue ? 0.5 : 1
                }}>
                  {logging ? '...' : 'Log'}
                </button>
              </div>
            ) : (
              <button onClick={() => handleLogProgress(selectedChallenge.id, selectedChallenge.challenge_type)} disabled={logging} style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: 'var(--accent-color, #f97316)', color: '#fff', fontSize: 16, fontWeight: 700,
                cursor: logging ? 'not-allowed' : 'pointer', opacity: logging ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}>
                <CheckCircle size={20} /> {logging ? 'Logging...' : 'Mark Complete for Today'}
              </button>
            )}
          </div>
        )}

        {/* Already logged today */}
        {detailData?.todayLog && (
          <div style={{
            background: '#10b98115', borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'center',
            border: '1px solid #10b98130'
          }}>
            <CheckCircle size={24} color="#10b981" />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginTop: 6 }}>Done for today!</div>
          </div>
        )}

        {/* Leaderboard */}
        {detailData?.leaderboard?.length > 1 && (
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} color="#f59e0b" /> Leaderboard
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {detailData.leaderboard.map(entry => (
                <div key={entry.clientId} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: entry.isMe ? `${config.color}10` : 'transparent',
                  borderRadius: 8,
                  border: entry.isMe ? `1px solid ${config.color}30` : '1px solid transparent'
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    background: entry.rank === 1 ? '#f59e0b' : entry.rank === 2 ? '#94a3b8' : entry.rank === 3 ? '#cd7f32' : 'var(--bg-primary)',
                    color: entry.rank <= 3 ? '#fff' : 'var(--text-secondary)'
                  }}>
                    {entry.rank}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: entry.isMe ? 700 : 500, color: entry.isMe ? config.color : 'var(--text-primary)' }}>
                    {entry.clientName}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{entry.totalDays}d</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Challenge List
  return (
    <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 22, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Trophy size={24} color="#f59e0b" /> Challenges
      </h1>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} className="spin" /></div>
      ) : challenges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <Trophy size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 500 }}>No active challenges</p>
          <p style={{ fontSize: 14 }}>Your coach hasn't created any challenges yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {challenges.map(c => {
            const config = getTypeConfig(c.challenge_type);
            const Icon = config.icon;
            const progress = c.total_days > 0 ? (c.days_completed / c.total_days) * 100 : 0;

            return (
              <button key={c.id} onClick={() => { setSelectedChallenge(c); fetchDetail(c.id); }} style={{
                background: 'var(--card-bg)', borderRadius: 14, padding: '16px', border: 'none',
                cursor: 'pointer', width: '100%', textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${config.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={20} color={config.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {c.days_remaining}d left · {c.participant_count} participants
                    </div>
                  </div>
                  {c.logged_today ? (
                    <CheckCircle size={22} color="#10b981" />
                  ) : (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--text-secondary)', opacity: 0.4 }} />
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: config.color,
                    width: `${Math.min(100, progress)}%`
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>{c.days_completed}/{c.total_days} days</span>
                  {c.streak > 0 && (
                    <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Flame size={12} /> {c.streak} day streak
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Export: Show coach or client view based on role ─────────────
function Challenges() {
  const { clientData } = useAuth();
  const navigate = useNavigate();
  const isCoach = clientData?.is_coach === true;

  return (
    <div>
      {!isCoach && (
        <div style={{ padding: '12px 16px 0' }}>
          <button onClick={() => navigate(-1)} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0
          }}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>
      )}
      {isCoach ? <CoachChallenges /> : <ClientChallenges />}
    </div>
  );
}

export default Challenges;
