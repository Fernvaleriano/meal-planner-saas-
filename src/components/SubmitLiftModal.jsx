import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Video, RotateCcw, Trophy, Loader2, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../utils/api';

// Max proof length. Long enough to walk up, lift, and rack; short enough to
// keep uploads quick and storage cheap.
const MAX_DURATION_SECONDS = 60;
const MIN_DURATION_SECONDS = 2;
const MAX_FILE_BYTES = 75 * 1024 * 1024; // matches the gym-lift-videos bucket cap

// Read a video file's duration without playing it. iOS Safari sometimes
// reports Infinity until the media seeks, so we nudge currentTime like the
// form-check flow does.
function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => {
      if (v.duration && isFinite(v.duration)) return done(v.duration);
      const onDur = () => {
        if (v.duration && isFinite(v.duration)) { v.removeEventListener('durationchange', onDur); done(v.duration); }
      };
      v.addEventListener('durationchange', onDur);
      try { v.currentTime = 1e101; } catch { /* ignore */ }
      setTimeout(() => done(v.duration && isFinite(v.duration) ? v.duration : 0), 2500);
    };
    v.onerror = () => done(0);
    v.src = url;
  });
}

function extFromFile(file) {
  const fromType = (file.type.split('/')[1] || '').replace('quicktime', 'mov');
  if (fromType) return fromType;
  const fromName = (file.name.split('.').pop() || '').toLowerCase();
  return fromName || 'mp4';
}

function SubmitLiftModal({ isOpen, lifts, initialLiftKey, onClose, onSubmitted }) {
  const { clientData } = useAuth();
  const defaultUnit = clientData?.unit_preference === 'metric' ? 'kg' : 'lbs';

  const [liftKey, setLiftKey] = useState(initialLiftKey || (lifts?.[0]?.key ?? 'bench_press'));
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState(defaultUnit);
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('form'); // form | uploading | success
  const [statusText, setStatusText] = useState('');

  const fileInputRef = useRef(null);

  const lift = (lifts || []).find(l => l.key === liftKey) || lifts?.[0];
  const isReps = lift?.metric === 'reps';

  useEffect(() => {
    if (isOpen) {
      setLiftKey(initialLiftKey || (lifts?.[0]?.key ?? 'bench_press'));
      setWeight(''); setReps(''); setNotes(''); setError(null);
      setVideoFile(null); setPhase('form');
      setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    }
  }, [isOpen, initialLiftKey, lifts]);

  // Clean up the object URL when it changes or the modal unmounts.
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const handleVideoPick = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setError(null);

    if (file.size > MAX_FILE_BYTES) {
      setError('That video is too large (max 75 MB). Trim it or record a shorter clip.');
      return;
    }
    const duration = await readDuration(file);
    if (duration && duration > MAX_DURATION_SECONDS + 1) {
      setError(`Keep it under ${MAX_DURATION_SECONDS} seconds — this clip is ${Math.round(duration)}s.`);
      return;
    }
    if (duration && duration < MIN_DURATION_SECONDS) {
      setError('That clip is too short to show the lift.');
      return;
    }
    setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setVideoFile(file);
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (!lift) return;
    if (!isReps) {
      const w = parseFloat(weight);
      if (!w || w <= 0 || w > 2000) { setError('Enter the weight you lifted.'); return; }
    }
    const r = parseInt(reps, 10);
    if (!r || r <= 0 || r > 100) { setError('Enter how many reps you hit.'); return; }
    if (!videoFile) { setError('Add a video so your lift counts on the board.'); return; }

    setPhase('uploading');
    try {
      // 1) Ask the server for a one-time signed upload URL.
      setStatusText('Preparing upload…');
      const ext = extFromFile(videoFile);
      const signRes = await apiPost('/.netlify/functions/gym-leaderboard', {
        action: 'sign-upload',
        clientId: clientData.id,
        liftKey,
        ext,
        contentType: videoFile.type || `video/${ext}`
      });
      if (!signRes?.uploadUrl) throw new Error('Could not start the upload.');

      // 2) Push the video straight to storage (bypasses the function body limit).
      setStatusText('Uploading your proof…');
      const put = await fetch(signRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': signRes.contentType || videoFile.type || 'video/mp4' },
        body: videoFile
      });
      if (!put.ok) throw new Error('Upload failed. Check your connection and try again.');

      // 3) Record the lift against the uploaded proof.
      setStatusText('Posting to the leaderboard…');
      await apiPost('/.netlify/functions/gym-leaderboard', {
        action: 'submit',
        clientId: clientData.id,
        liftKey,
        weight: isReps ? (parseFloat(weight) || 0) : parseFloat(weight),
        weightUnit: unit,
        reps: r,
        videoPath: signRes.filePath,
        notes
      });

      setPhase('success');
      onSubmitted?.();
    } catch (err) {
      console.error('Submit lift failed:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setPhase('form');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="gym-proof-overlay" onClick={phase === 'uploading' ? undefined : onClose}>
      <div className="lb-submit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-modal-header">
          <button className="lb-modal-close" onClick={onClose} disabled={phase === 'uploading'}>
            <X size={22} />
          </button>
          <h2 className="lb-modal-title">{phase === 'success' ? 'On the Board!' : 'Log a Lift'}</h2>
        </div>

        <div className="lb-modal-body">
          {phase === 'success' && (
            <div className="lb-success">
              <div className="lb-success-icon"><Trophy size={40} /></div>
              <h3>Nice work! 💪</h3>
              <p>Your {lift?.name} is live on the gym leaderboard with video proof.</p>
              <button className="lb-done-btn" onClick={onClose}>Done</button>
            </div>
          )}

          {phase === 'uploading' && (
            <div className="lb-uploading">
              <Loader2 size={40} className="lb-spin" />
              <p>{statusText}</p>
              <span className="lb-uploading-hint">Keep this open until it finishes.</span>
            </div>
          )}

          {phase === 'form' && (
            <div className="lb-form">
              {/* Lift picker */}
              <label className="lb-label">Which lift?</label>
              <div className="lb-lift-chips">
                {(lifts || []).map(l => (
                  <button
                    key={l.key}
                    type="button"
                    className={`lb-lift-chip ${l.key === liftKey ? 'active' : ''}`}
                    style={l.key === liftKey ? { borderColor: l.color, background: l.color + '18', color: l.color } : undefined}
                    onClick={() => setLiftKey(l.key)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>

              {/* Numbers */}
              <div className="lb-inputs">
                {!isReps ? (
                  <>
                    <div className="lb-input-group lb-input-weight">
                      <label className="lb-label" htmlFor="lb-weight">Weight</label>
                      <div className="lb-weight-row">
                        <input
                          id="lb-weight" type="number" inputMode="decimal" min="0" max="2000" step="0.5"
                          className="lb-input" placeholder="0" value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                        />
                        <div className="lb-unit-toggle">
                          <button type="button" className={unit === 'lbs' ? 'active' : ''} onClick={() => setUnit('lbs')}>lbs</button>
                          <button type="button" className={unit === 'kg' ? 'active' : ''} onClick={() => setUnit('kg')}>kg</button>
                        </div>
                      </div>
                    </div>
                    <div className="lb-input-group lb-input-reps">
                      <label className="lb-label" htmlFor="lb-reps">Reps</label>
                      <input
                        id="lb-reps" type="number" inputMode="numeric" min="1" max="100" step="1"
                        className="lb-input" placeholder="1" value={reps}
                        onChange={(e) => setReps(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="lb-input-group lb-input-reps">
                    <label className="lb-label" htmlFor="lb-reps">Reps in one set</label>
                    <input
                      id="lb-reps" type="number" inputMode="numeric" min="1" max="100" step="1"
                      className="lb-input" placeholder="0" value={reps}
                      onChange={(e) => setReps(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <p className="lb-1rm-hint">
                {isReps
                  ? 'Ranked by reps in a single set.'
                  : 'Ranked by estimated 1-rep max, so heavy singles and rep PRs compete fairly.'}
              </p>

              {/* Video proof */}
              <label className="lb-label">Video proof <span className="lb-required">required</span></label>
              {!videoUrl ? (
                <button type="button" className="lb-video-add" onClick={() => fileInputRef.current?.click()}>
                  <Video size={22} />
                  <span>Record or upload your set</span>
                  <span className="lb-video-add-sub">Up to {MAX_DURATION_SECONDS}s · no proof, no board</span>
                </button>
              ) : (
                <div className="lb-video-preview">
                  <video src={videoUrl} controls playsInline className="lb-video-el" />
                  <button type="button" className="lb-video-retake" onClick={() => fileInputRef.current?.click()}>
                    <RotateCcw size={16} /> Choose a different clip
                  </button>
                </div>
              )}
              {/* No `capture` attribute: on phones this lets the user choose
                  between recording a new clip and uploading an existing one.
                  Forcing `capture` would jump straight to the camera. */}
              <input
                ref={fileInputRef} type="file" accept="video/*"
                onChange={handleVideoPick} style={{ display: 'none' }}
              />

              <label className="lb-label" htmlFor="lb-notes">Note <span className="lb-optional">(optional)</span></label>
              <input
                id="lb-notes" type="text" maxLength={120} className="lb-input"
                placeholder="e.g. new PR, belt only, paused reps" value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              {error && (
                <div className="lb-error"><AlertCircle size={16} /> {error}</div>
              )}

              <button type="button" className="lb-submit-btn" onClick={handleSubmit}>
                <Check size={18} /> Post to Leaderboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubmitLiftModal;
