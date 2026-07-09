import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Video, Upload, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Eye, Sparkles, Copy, Check, Send } from 'lucide-react';
import Portal from '../Portal';
import { apiPost } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

// AI Form Check (BETA)
// ---------------------------------------------------------------------------
// The client records (or uploads) a short clip of one set. We DON'T upload the
// video — Claude reasons over images, so we pull a handful of evenly-spaced
// still frames out of the clip right here in the browser, then send those tiny
// JPEGs to /analyze-form-video. This keeps the payload small/fast and means no
// video ever has to be stored.
//
// People don't always trim their clip, so a "full" video can include walking
// up, setting up, resting or racking. Two things guard against that:
//   1. We up-front ask for just one set (~5-10s) and grab MORE frames than we
//      strictly need, so even a loose clip still lands several frames on the
//      actual lift.
//   2. The server prompt is told the frames may include non-exercise moments
//      and to judge ONLY the frames that clearly show the working reps.

const FRAME_COUNT = 10;
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

// Cheap average brightness (0-255) of a captured frame, sampled so it stays
// fast even across a dozen frames. Used to catch the iOS "black frame" decode
// failure before we waste an AI call on all-black images.
function frameBrightness(ctx, w, h) {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    const px = w * h;
    const step = Math.max(1, Math.floor(px / 1500));
    let sum = 0, n = 0;
    for (let i = 0; i < px; i += step) {
      const o = i * 4;
      sum += (data[o] + data[o + 1] + data[o + 2]) / 3;
      n++;
    }
    return n ? sum / n : NaN;
  } catch (e) {
    return NaN; // couldn't sample (shouldn't happen for same-origin blob) — treat as unknown
  }
}

// Capture frames by PLAYING the clip and grabbing painted frames as they go by.
//
// Why not just seek+draw: on iOS Safari, drawing a video that is paused/seeked
// and not actually on screen produces BLACK frames — the decoder never paints
// to the compositor. The fix is to (a) attach the <video> to the DOM so it's
// renderable (display:none also blanks it, so we hide it with near-zero size/
// opacity instead), (b) play it muted/inline, and (c) capture via
// requestVideoFrameCallback, which only fires once a real frame is presented.
// Seek-based capture is kept as a fallback for environments that block autoplay.
async function extractFrames(file, count = FRAME_COUNT, maxWidth = FRAME_MAX_WIDTH, onProgress) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  // Must be renderable for iOS to decode to canvas — NOT display:none / visibility:hidden.
  video.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
  document.body.appendChild(video);
  video.src = url;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frames = [];
  const brightness = [];

  const grab = () => {
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (!w || !h) return false;
    if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
    canvas.width = w;
    canvas.height = h;
    try {
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.7));
      brightness.push(frameBrightness(ctx, w, h));
      if (onProgress) onProgress(frames.length, count);
      return true;
    } catch (e) {
      return false;
    }
  };

  const cleanup = () => {
    try { video.pause(); } catch (e) { /* ignore */ }
    URL.revokeObjectURL(url);
    if (video.parentNode) video.parentNode.removeChild(video);
  };

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('Could not read video'));
      setTimeout(() => rej(new Error('Video load timed out')), 15000);
    });

    const duration = await resolveDuration(video);
    try { video.currentTime = 0; } catch (e) { /* ignore */ }

    // Evenly spaced capture points across the clip.
    const targets = [];
    for (let k = 0; k < count; k++) {
      targets.push(Math.max(0, (duration * (k + 0.5)) / count));
    }

    const hasRVFC = typeof video.requestVideoFrameCallback === 'function';

    // Seek-based fallback (used if playback/autoplay is blocked).
    const seekCapture = async () => {
      for (const t of targets) {
        await new Promise((res) => {
          const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
          video.addEventListener('seeked', onSeek);
          try { video.currentTime = t; } catch (e) { res(); }
          setTimeout(res, 2500);
        });
        if (hasRVFC) {
          await new Promise((res) => {
            let done = false;
            video.requestVideoFrameCallback(() => { done = true; res(); });
            setTimeout(() => { if (!done) res(); }, 400);
          });
        }
        grab();
      }
    };

    await new Promise((resolve) => {
      let ti = 0;
      let finished = false;
      const finish = () => { if (!finished) { finished = true; resolve(); } };

      // Overall safety cap so a stuck decode can never hang the UI.
      const safety = setTimeout(() => {
        while (ti < targets.length && grab()) ti++;
        finish();
      }, Math.min(25000, duration * 1000 + 8000));

      const onFrame = () => {
        if (finished) return;
        // Grab every target the playhead has now passed.
        while (ti < targets.length && video.currentTime >= targets[ti]) {
          grab();
          ti++;
        }
        if (ti >= targets.length) { clearTimeout(safety); finish(); return; }
        if (hasRVFC) video.requestVideoFrameCallback(onFrame);
      };

      video.onended = () => {
        while (ti < targets.length) { grab(); ti++; }
        clearTimeout(safety);
        finish();
      };

      // Play a touch faster than realtime to keep capture snappy (muted allows >1x).
      try { video.playbackRate = 2; } catch (e) { /* ignore */ }

      video.play().then(() => {
        if (hasRVFC) video.requestVideoFrameCallback(onFrame);
        else video.ontimeupdate = onFrame; // fallback frame pump
      }).catch(async () => {
        // Autoplay refused — fall back to seek-based capture.
        try { await seekCapture(); } catch (e) { /* ignore */ }
        clearTimeout(safety);
        finish();
      });
    });

    // Flag an all-black capture (iOS decode miss) so we can ask for a re-record
    // instead of sending black images to the model.
    const valid = brightness.filter((v) => !Number.isNaN(v));
    const darkCount = valid.filter((v) => v < 12).length;
    const darkRatio = valid.length ? darkCount / valid.length : 0;

    return { frames, darkRatio };
  } finally {
    cleanup();
  }
}

const SEVERITY_COLOR = { minor: '#E8A33D', moderate: '#E07A3F', major: '#D9534F' };

export default function FormCheckModal({ exerciseName, onClose }) {
  const { t, language } = useLanguage();
  const { clientData } = useAuth();
  // The client and their coach — needed to drop the clip into the existing
  // coach<->client chat. A coach previewing their own builder has no coach_id,
  // so the "Send to coach" button simply hides in that case.
  const coachId = clientData?.coach_id || null;
  const clientId = clientData?.id || null;
  const canSendToCoach = !!(coachId && clientId);

  const [phase, setPhase] = useState('idle'); // idle | working | results | error
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [thumbs, setThumbs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState('idle'); // idle | sending | sent | error
  const recordRef = useRef(null);
  const uploadRef = useRef(null);
  const framesRef = useRef(null); // last successfully-extracted frames, for retry without re-filming
  const fileRef = useRef(null); // the raw clip, kept so it can be sent to the coach

  const tt = (key, fallback, vars) => {
    const v = t(key, vars);
    return v === key ? fallback : v;
  };

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mapError = useCallback((err) => {
    if (err.message === 'blank-frames') {
      return tt('formCheck.errBlank', "Couldn't capture your video clearly — it came out dark. Try recording again in good light, side-on.");
    }
    if (err.message === 'no-frames' || err.message === 'Could not read video' || err.message === 'Video load timed out') {
      return tt('formCheck.errVideo', "Couldn't read that clip. Try a shorter video filmed side-on in good light.");
    }
    if (err.isTimeout) {
      return tt('formCheck.errTimeout', 'That took too long. Try a shorter clip (5-10 seconds).');
    }
    if (err.status === 429) {
      return tt('formCheck.errRate', "You've run a few checks quickly — give it a minute and try again.");
    }
    if (err.status === 503 || (err.message && err.message.includes('busy'))) {
      return tt('formCheck.errBusy', 'The AI is busy right now. Try again in a moment.');
    }
    return tt('formCheck.errGeneric', 'Something went wrong. Please try again.');
  }, [language]);

  // Send frames to the AI. Split out from extraction so a failed check can be
  // retried without re-filming / re-extracting.
  const analyzeFrames = useCallback(async (frames) => {
    setError(null);
    setResult(null);
    setPhase('working');
    setStatusText(tt('formCheck.statusAnalyzing', 'Checking your form…'));
    try {
      const data = await apiPost('/.netlify/functions/analyze-form-video', {
        frames,
        exerciseName: exerciseName || undefined,
        language
      });
      setResult(data);
      setPhase('results');
    } catch (err) {
      console.error('Form check error:', err);
      setError(mapError(err));
      setPhase('error');
    }
  }, [exerciseName, language, mapError]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setResult(null);
    setThumbs([]);
    setSendState('idle');
    framesRef.current = null;
    fileRef.current = file; // keep the clip in case they send it to their coach
    setPhase('working');

    try {
      setStatusText(tt('formCheck.statusReading', 'Reading your clip…'));
      const { frames, darkRatio } = await extractFrames(file, FRAME_COUNT, FRAME_MAX_WIDTH, (done, total) => {
        setStatusText(`${tt('formCheck.statusReading', 'Reading your clip…')} ${done}/${total}`);
      });
      if (!frames.length) throw new Error('no-frames');
      if (darkRatio >= 0.7) throw new Error('blank-frames');

      framesRef.current = frames;
      setThumbs(frames);
      await analyzeFrames(frames);
    } catch (err) {
      console.error('Form check error:', err);
      setError(mapError(err));
      setPhase('error');
    }
  }, [analyzeFrames, mapError]);

  // Error retry: if we still have good frames, re-run the AI on them (network /
  // rate-limit / busy). Otherwise (couldn't read the video) go back to filming.
  const handleRetry = useCallback(() => {
    if (framesRef.current?.length) {
      analyzeFrames(framesRef.current);
    } else {
      reset();
    }
  }, [analyzeFrames]);

  // Turn the AI result into a plain-text summary. Shared by "Copy feedback"
  // and "Send to coach" so both read identically.
  const buildFeedbackText = useCallback(() => {
    if (!result) return '';
    const lines = [];
    lines.push(exerciseName ? `Form check — ${exerciseName}` : 'Form check');
    if (result.summary) { lines.push('', result.summary); }
    if (result.goodPoints?.length) {
      lines.push('', 'Looking good:');
      result.goodPoints.forEach((g) => lines.push(`• ${g}`));
    }
    if (result.issues?.length) {
      lines.push('', 'Worth adjusting:');
      result.issues.forEach((i) => lines.push(`• ${i.point}${i.fix ? ` → ${i.fix}` : ''}`));
    }
    if (result.cues?.length) {
      lines.push('', 'Focus next set:');
      result.cues.forEach((c) => lines.push(`• ${c}`));
    }
    return lines.join('\n');
  }, [result, exerciseName]);

  const copyFeedback = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildFeedbackText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { /* clipboard blocked — no-op */ }
  }, [result, buildFeedbackText]);

  // Send the actual clip + the AI notes to the coach, landing as a normal
  // video message in their existing Messages inbox. We reuse the same two-step
  // upload the chat screen uses: grab a signed URL, PUT the file straight to
  // storage (bypasses the function body-size limit), then post the message.
  const sendToCoach = useCallback(async () => {
    const file = fileRef.current;
    if (!file || !canSendToCoach || sendState === 'sending' || sendState === 'sent') return;

    setSendState('sending');
    try {
      const ext = file.name?.split('.').pop() || file.type.split('/')[1] || 'mp4';
      const urlResult = await apiPost('/.netlify/functions/get-chat-upload-url', {
        coachId,
        clientId,
        contentType: file.type || 'video/mp4',
        fileExtension: ext
      });
      if (!urlResult.success || !urlResult.uploadUrl) {
        throw new Error(urlResult.error || 'upload-url-failed');
      }

      const uploadRes = await fetch(urlResult.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file
      });
      if (!uploadRes.ok) throw new Error('upload-failed');

      const prefix = tt('formCheck.coachMsgPrefix', 'Form check for you to review 👇');
      const feedback = buildFeedbackText();
      const message = `${prefix}\n\n${feedback}`;

      await apiPost('/.netlify/functions/chat', {
        action: 'send',
        coachId,
        clientId,
        senderType: 'client',
        message,
        mediaUrl: urlResult.publicUrl,
        mediaType: urlResult.mediaType || 'video'
      });

      setSendState('sent');
    } catch (err) {
      console.error('Send form check to coach failed:', err);
      setSendState('error');
    }
  }, [canSendToCoach, coachId, clientId, sendState, buildFeedbackText]);

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setThumbs([]);
    setStatusText('');
    setSendState('idle');
    framesRef.current = null;
    fileRef.current = null;
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

  const ThumbStrip = () => (
    thumbs.length > 0 ? (
      <div style={thumbStripStyle}>
        {thumbs.map((src, i) => (
          <img key={i} src={src} alt="" style={thumbStyle} />
        ))}
      </div>
    ) : null
  );

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
            <button onClick={onClose} aria-label={tt('formCheck.close', 'Close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 4 }}>
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
                {tt('formCheck.intro', 'Film just one set — about 5–10 seconds of the actual lift, nothing before or after. Prop your phone side-on, full body in frame, good light.')}
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
              <button onClick={handleRetry} style={{ ...btnPrimary, maxWidth: 200, margin: '16px auto 0' }}>
                {tt('formCheck.tryAgain', 'Try again')}
              </button>
            </div>
          )}

          {/* Results */}
          {phase === 'results' && result && (
            <div>
              <ThumbStrip />

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

              {/* Send the clip + notes straight to the coach's chat. Shown
                  whenever we still have the clip and the client has a coach —
                  even if the AI couldn't fully assess, the coach can still
                  watch the video. */}
              {canSendToCoach && fileRef.current && (
                <button
                  onClick={sendToCoach}
                  disabled={sendState === 'sending' || sendState === 'sent'}
                  style={{
                    ...btnPrimary,
                    marginTop: 16,
                    width: '100%',
                    flexDirection: 'row',
                    opacity: sendState === 'sending' ? 0.8 : 1,
                    cursor: sendState === 'sending' || sendState === 'sent' ? 'default' : 'pointer',
                    background: sendState === 'sent' ? 'rgba(46,196,182,0.15)' : '#2EC4B6',
                    color: sendState === 'sent' ? '#2EC4B6' : '#fff'
                  }}
                >
                  {sendState === 'sending' ? (
                    <>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>{tt('formCheck.sending', 'Sending to your coach…')}</span>
                      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
                    </>
                  ) : sendState === 'sent' ? (
                    <>
                      <Check size={18} />
                      <span>{tt('formCheck.sent', 'Sent to your coach')}</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>{tt('formCheck.sendToCoach', 'Send to coach')}</span>
                    </>
                  )}
                </button>
              )}
              {sendState === 'error' && (
                <p style={{ fontSize: 13, color: '#D9534F', marginTop: 8, textAlign: 'center' }}>
                  {tt('formCheck.sendError', "Couldn't send that to your coach — please try again.")}
                </p>
              )}

              {result.canAssess !== false && (
                <button onClick={copyFeedback} style={copyBtn}>
                  {copied ? <Check size={15} color="#2EC4B6" /> : <Copy size={15} />}
                  <span>{copied ? tt('formCheck.copied', 'Copied — paste it to your coach') : tt('formCheck.copy', 'Copy feedback')}</span>
                </button>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
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
const thumbStripStyle = {
  display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6,
  WebkitOverflowScrolling: 'touch'
};
const thumbStyle = {
  height: 48, width: 'auto', borderRadius: 6, flexShrink: 0, objectFit: 'cover',
  border: '1px solid rgba(0,0,0,0.08)'
};
const copyBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16,
  background: 'none', border: 'none', cursor: 'pointer', color: '#2EC4B6',
  fontSize: 13.5, fontWeight: 600, padding: '4px 0'
};
