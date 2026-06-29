import { useState, useRef, useCallback } from 'react';
import { X, Video, Upload, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Eye, Sparkles } from 'lucide-react';
import Portal from '../Portal';
import { apiPost } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';

// AI Form Check (BETA)
// ---------------------------------------------------------------------------
// The client records (or uploads) a short clip of one set. We DON'T upload the
// video — Claude reasons over images, so we pull a handful of evenly-spaced
// still frames out of the clip right here in the browser, then send those tiny
// JPEGs to /analyze-form-video. This keeps the payload small/fast and means no
// video ever has to be stored.

const FRAME_COUNT = 6;
const FRAME_MAX_WIDTH = 512;

// iOS often reports duration as Infinity until the clip has been seeked once.
// Nudging currentTime far forward forces the browser to resolve the real value.
function resolveDuration(video) {
  return new Promise((resolve) => {
    if (video.duration && isFinite(video.duration)) return resolve(video.duration);
    const onDur = () => {
      if (video.duration && isFinite(video.duration)) {
        video.removeEventListener('durationchange', onDur);
        resolve(video.duration);
      }
    };
    video.addEventListener('durationchange', onDur);
    try { video.currentTime = 1e101; } catch (e) { /* ignore */ }
    setTimeout(() => resolve(video.duration && isFinite(video.duration) ? video.duration : 3), 3000);
  });
}

async function extractFrames(file, count = FRAME_COUNT, maxWidth = FRAME_MAX_WIDTH) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('Could not read video'));
      setTimeout(() => rej(new Error('Video load timed out')), 15000);
    });

    const duration = await resolveDuration(video);
    // Reset to start after the duration nudge above.
    await new Promise((res) => {
      const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
      video.addEventListener('seeked', onSeek);
      try { video.currentTime = 0; } catch (e) { res(); }
      setTimeout(res, 1500);
    });

    // Sample evenly across the clip, skipping the very first/last instants.
    const targets = [];
    for (let k = 0; k < count; k++) {
      targets.push(Math.max(0, (duration * (k + 0.5)) / count));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames = [];

    for (const t of targets) {
      await new Promise((res) => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
        video.addEventListener('seeked', onSeek);
        try { video.currentTime = t; } catch (e) { res(); }
        setTimeout(res, 2500); // never hang on a stuck seek
      });
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (!w || !h) continue;
      if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.7));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SEVERITY_COLOR = { minor: '#E8A33D', moderate: '#E07A3F', major: '#D9534F' };

export default function FormCheckModal({ exerciseName, onClose }) {
  const { t, language } = useLanguage();
  const [phase, setPhase] = useState('idle'); // idle | working | results | error
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const recordRef = useRef(null);
  const uploadRef = useRef(null);

  const tt = (key, fallback, vars) => {
    const v = t(key, vars);
    return v === key ? fallback : v;
  };

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setResult(null);
    setPhase('working');

    try {
      setStatusText(tt('formCheck.statusReading', 'Reading your clip…'));
      const frames = await extractFrames(file);
      if (!frames.length) {
        throw new Error('no-frames');
      }

      setStatusText(tt('formCheck.statusAnalyzing', 'Checking your form…'));
      const data = await apiPost('/.netlify/functions/analyze-form-video', {
        frames,
        exerciseName: exerciseName || undefined,
        language
      });
      setResult(data);
      setPhase('results');
    } catch (err) {
      console.error('Form check error:', err);
      if (err.message === 'no-frames' || err.message === 'Could not read video' || err.message === 'Video load timed out') {
        setError(tt('formCheck.errVideo', "Couldn't read that clip. Try a shorter video filmed side-on in good light."));
      } else if (err.isTimeout) {
        setError(tt('formCheck.errTimeout', 'That took too long. Try a shorter clip (5-10 seconds).'));
      } else if (err.status === 429) {
        setError(tt('formCheck.errRate', "You've run a few checks quickly — give it a minute and try again."));
      } else if (err.status === 503 || (err.message && err.message.includes('busy'))) {
        setError(tt('formCheck.errBusy', 'The AI is busy right now. Try again in a moment.'));
      } else {
        setError(tt('formCheck.errGeneric', 'Something went wrong. Please try again.'));
      }
      setPhase('error');
    }
  }, [exerciseName, language]);

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setStatusText('');
  };

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 100000,
    background: 'rgba(8,18,26,0.78)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
  };
  const card = {
    background: 'var(--card-bg, #fff)', color: 'var(--text-color, #0A1F2E)',
    width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 18px 28px',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.3)'
  };

  return (
    <Portal>
      <div style={overlay} onClick={onClose}>
        <div style={card} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#2EC4B6" />
              <h2 style={{ margin: 0, fontSize: 18 }}>{tt('formCheck.title', 'Form Check')}</h2>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: '#2EC4B6', border: '1px solid #2EC4B6', borderRadius: 6, padding: '1px 5px' }}>BETA</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 4 }}>
              <X size={22} />
            </button>
          </div>
          {exerciseName && (
            <p style={{ margin: '0 0 14px', fontSize: 14, opacity: 0.7 }}>{exerciseName}</p>
          )}

          {/* Idle — choose how to add the clip */}
          {phase === 'idle' && (
            <div>
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>
                {tt('formCheck.intro', 'Film one set and get a quick read on your form. For the best result: prop your phone side-on, full body in frame, good light.')}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button onClick={() => recordRef.current?.click()} style={btnPrimary}>
                  <Video size={22} />
                  <span>{tt('formCheck.record', 'Record a set')}</span>
                </button>
                <button onClick={() => uploadRef.current?.click()} style={btnSecondary}>
                  <Upload size={22} />
                  <span>{tt('formCheck.upload', 'Upload clip')}</span>
                </button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.6, marginTop: 16, lineHeight: 1.45 }}>
                {tt('formCheck.disclaimerIdle', 'A friendly second set of eyes — not medical or injury advice. Your coach has the final say.')}
              </p>
              <input ref={recordRef} type="file" accept="video/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
              <input ref={uploadRef} type="file" accept="video/*" onChange={handleFile} style={{ display: 'none' }} />
            </div>
          )}

          {/* Working */}
          {phase === 'working' && (
            <div style={{ textAlign: 'center', padding: '36px 0' }}>
              <Loader2 size={34} color="#2EC4B6" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: 14, fontSize: 15 }}>{statusText}</p>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <AlertTriangle size={30} color="#E07A3F" />
              <p style={{ marginTop: 12, fontSize: 15 }}>{error}</p>
              <button onClick={reset} style={{ ...btnPrimary, maxWidth: 200, margin: '16px auto 0' }}>
                {tt('formCheck.tryAgain', 'Try again')}
              </button>
            </div>
          )}

          {/* Results */}
          {phase === 'results' && result && (
            <div>
              {result.viewQuality === 'poor' && (
                <div style={noteBox}>
                  <Eye size={16} color="#E8A33D" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{tt('formCheck.poorView', 'The angle made this hard to judge — film side-on with your whole body in frame for a better read.')}</span>
                </div>
              )}

              {result.summary && (
                <p style={{ fontSize: 15, lineHeight: 1.55, marginTop: 8 }}>{result.summary}</p>
              )}

              {result.canAssess !== false && (
                <>
                  {result.goodPoints?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h3 style={sectionH}>{tt('formCheck.lookingGood', 'Looking good')}</h3>
                      {result.goodPoints.map((g, i) => (
                        <div key={i} style={rowStyle}>
                          <CheckCircle2 size={17} color="#2EC4B6" style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{g}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.issues?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h3 style={sectionH}>{tt('formCheck.worthAdjusting', 'Worth adjusting')}</h3>
                      {result.issues.map((iss, i) => (
                        <div key={i} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <AlertTriangle size={17} color={SEVERITY_COLOR[iss.severity] || '#E8A33D'} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontWeight: 600 }}>{iss.point}</span>
                          </div>
                          {iss.fix && (
                            <span style={{ fontSize: 13.5, opacity: 0.8, paddingLeft: 25 }}>→ {iss.fix}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {result.cues?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h3 style={sectionH}>{tt('formCheck.focusNext', 'Focus on next set')}</h3>
                      {result.cues.map((c, i) => (
                        <div key={i} style={rowStyle}>
                          <Lightbulb size={17} color="#2EC4B6" style={{ flexShrink: 0, marginTop: 1 }} />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {result.disclaimer && (
                <p style={{ fontSize: 11.5, opacity: 0.6, marginTop: 18, lineHeight: 1.45 }}>{result.disclaimer}</p>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                <button onClick={reset} style={btnSecondary}>{tt('formCheck.checkAnother', 'Check another')}</button>
                <button onClick={onClose} style={btnPrimary}>{tt('formCheck.done', 'Done')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

const btnBase = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 6, padding: '16px 12px', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  border: 'none'
};
const btnPrimary = { ...btnBase, background: '#2EC4B6', color: '#fff' };
const btnSecondary = { ...btnBase, background: 'rgba(46,196,182,0.12)', color: '#2EC4B6', border: '1px solid rgba(46,196,182,0.4)' };
const sectionH = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.55, margin: '0 0 8px' };
const rowStyle = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.45, marginBottom: 8 };
const noteBox = {
  display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45,
  background: 'rgba(232,163,61,0.1)', border: '1px solid rgba(232,163,61,0.3)',
  borderRadius: 10, padding: '10px 12px', marginBottom: 4
};
