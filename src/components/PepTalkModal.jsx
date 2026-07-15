import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost, fetchWithTimeout } from '../utils/api';
import { useUnviewedPepTalks } from '../hooks/useUnviewedPepTalks';
import { useLanguage } from '../context/LanguageContext';

// Threshold for "watched" — the video has to play at least this fraction of
// its duration before the "Got it" button enables. Matches the product rule:
// "they can dismiss it but it keeps popping up until they watch it!"
const VIEWED_FRACTION = 0.9;

function PepTalkModal() {
  const { t } = useLanguage();
  const { clientData } = useAuth();
  const clientId = clientData?.id;
  const isCoach = clientData?.is_coach === true;

  const { pepTalks, refresh, dismissLocal, removeLocal } = useUnviewedPepTalks(isCoach ? null : clientId);

  const current = pepTalks[0] || null;
  // Mandatory pep talks (the default) can't be closed — the client must read /
  // watch and tap "Got it" before they can use the app. Coaches can toggle this
  // off per pep talk, which makes it a dismissible popup (X + tap-outside).
  const isMandatory = current ? current.mandatory !== false : false;
  const isQuiz = !!(current && current.isQuiz && Array.isArray(current.questions) && current.questions.length > 0);

  const [videoWatched, setVideoWatched] = useState(false);
  const [answers, setAnswers] = useState({});       // questionId -> { selectedOption, answerText, mediaFile, mediaType }
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState(null); // { score, results } after submit
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const openedRef = useRef(null);                // tracks which pep talk we've already logged "opened" for

  // When the active pep talk changes, reset the per-item UI state and log "opened".
  useEffect(() => {
    if (!current || !clientId) return;

    setVideoWatched(false);
    setAnswers({});
    setQuizResult(null);
    setSubmitting(false);
    setError(null);

    if (openedRef.current !== current.id) {
      openedRef.current = current.id;
      apiPost('/.netlify/functions/mark-pep-talk-viewed', {
        clientId,
        pepTalkId: current.id,
        action: 'opened'
      }).catch(() => { /* non-critical telemetry */ });
    }
  }, [current?.id, clientId]);

  const handleVideoProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || !current?.videoUrl) return;

    const duration = video.duration || current.videoDurationSeconds || 0;
    if (!duration || duration <= 0) return;

    // Mark as watched once the user has played ≥ VIEWED_FRACTION of the video.
    // We use currentTime, not the 'ended' event, because some players skip the
    // final 100-300ms and never fire 'ended' on iOS.
    if (video.currentTime / duration >= VIEWED_FRACTION) {
      setVideoWatched(true);
    }
  }, [current?.videoUrl, current?.videoDurationSeconds]);

  const setAnswer = useCallback((qid, patch) => {
    setAnswers(prev => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  }, []);

  // A quiz is complete when every question has at least one filled-in answer
  // among the modes the coach enabled for it.
  const videoGateOk = !current?.videoUrl || videoWatched;
  const quizComplete = isQuiz && current.questions.every(q => {
    const a = answers[q.id] || {};
    const hasOption = q.options && q.options.length > 0 && a.selectedOption != null;
    const hasText = q.allowText && a.answerText && a.answerText.trim().length > 0;
    const hasMedia = q.allowMedia && a.mediaFile;
    return hasOption || hasText || hasMedia;
  });

  // For text-only pep talks the "Got it" button is enabled immediately.
  const canAcknowledge = current && videoGateOk;

  // Upload one photo/video answer via a signed URL, returning its storage path.
  const uploadAnswerMedia = useCallback(async (file, pepTalkId) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const sign = await apiPost('/.netlify/functions/pep-talk-answers', {
      action: 'sign-upload',
      clientId,
      pepTalkId,
      ext,
      contentType: file.type
    });
    if (!sign?.uploadUrl) throw new Error('Could not prepare upload');
    const put = await fetchWithTimeout(sign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': sign.contentType || file.type || 'application/octet-stream' },
      body: file
    }, 60000);
    if (!put.ok) throw new Error('Upload failed');
    return sign.filePath;
  }, [clientId]);

  const handleSubmitQuiz = useCallback(async () => {
    if (!current || !clientId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = [];
      for (const q of current.questions) {
        const a = answers[q.id] || {};
        let answerMediaPath = null;
        let answerMediaType = null;
        if (q.allowMedia && a.mediaFile) {
          answerMediaType = (a.mediaFile.type || '').startsWith('video/') ? 'video' : 'image';
          answerMediaPath = await uploadAnswerMedia(a.mediaFile, current.id);
        }
        payload.push({
          questionId: q.id,
          selectedOption: a.selectedOption != null ? a.selectedOption : null,
          answerText: q.allowText && a.answerText ? a.answerText.trim() : null,
          answerMediaPath,
          answerMediaType
        });
      }
      const res = await apiPost('/.netlify/functions/pep-talk-answers', {
        action: 'submit',
        clientId,
        pepTalkId: current.id,
        answers: payload
      });
      // Server already flipped viewed_at, so this won't pop back up.
      setQuizResult({ score: res.score || { correct: 0, total: 0 }, results: res.results || {} });
    } catch (err) {
      console.error('Failed to submit quiz:', err);
      setError(t('pepTalk.submitFailed'));
      setSubmitting(false);
    }
  }, [current, clientId, submitting, answers, uploadAnswerMedia, t]);

  const handleAcknowledge = useCallback(async () => {
    if (!current || !clientId) return;
    // Close instantly (optimistic) — the old flow waited for the POST + a list
    // refetch before the modal disappeared, which on mobile felt like the
    // button needed several taps. If the server write below fails, refresh()
    // re-adds the pep talk to the list, so the mandatory guarantee still holds.
    const ackedId = current.id;
    removeLocal(ackedId);
    try {
      await apiPost('/.netlify/functions/mark-pep-talk-viewed', {
        clientId,
        pepTalkId: ackedId,
        action: 'viewed'
      });
    } catch (err) {
      console.error('Failed to mark pep talk viewed:', err);
      // Refresh below re-shows the modal if the row didn't actually flip.
    }
    refresh();
  }, [current, clientId, removeLocal, refresh]);

  // After a quiz is submitted + result shown, "Done" just clears it locally
  // (the server already marked it viewed on submit).
  const handleQuizDone = useCallback(() => {
    if (!current) return;
    removeLocal(current.id);
    refresh();
  }, [current, removeLocal, refresh]);

  const handleDismiss = useCallback(() => {
    if (!current || !clientId) return;
    // Mandatory pep talks can't be soft-dismissed — the only way out is "Got it".
    if (isMandatory) return;
    // Soft dismiss: hide it locally for this session so the user can use the
    // app. It still comes back on the next app resume / page reload because
    // viewed_at stays null on the server. Fire-and-forget the analytics call
    // so dismiss_count climbs.
    const dismissedId = current.id;
    dismissLocal(dismissedId);
    apiPost('/.netlify/functions/mark-pep-talk-viewed', {
      clientId,
      pepTalkId: dismissedId,
      action: 'dismissed'
    }).catch(() => { /* swallow — local hide is what matters */ });
  }, [current, clientId, dismissLocal, isMandatory]);

  if (!current) return null;

  // ---- Result view (after a quiz is submitted) ----------------------------
  if (quizResult) {
    const { score } = quizResult;
    return (
      <div style={overlayStyle}>
        <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
          <div style={titleStyle}>{current.title}</div>
          <div style={resultBox}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎉</div>
            {score.total > 0 ? (
              <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                {t('pepTalk.youScored', { correct: score.correct, total: score.total })}
              </div>
            ) : (
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{t('pepTalk.answersSubmitted')}</div>
            )}
          </div>
          <button onClick={handleQuizDone} style={acknowledgeBtnStyle}>
            {t('pepTalk.done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={isMandatory ? undefined : handleDismiss}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {!isMandatory && (
          <button
            aria-label={t('pepTalk.dismissAriaLabel')}
            onClick={handleDismiss}
            style={closeBtnStyle}
          >
            <X size={20} />
          </button>
        )}

        <div style={titleStyle}>{current.title}</div>

        {current.videoUrl && (
          <video
            ref={videoRef}
            src={current.videoUrl}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={handleVideoProgress}
            onEnded={() => setVideoWatched(true)}
            style={videoStyle}
          />
        )}

        {current.imageUrl && (
          <img src={current.imageUrl} alt="" style={imageStyle} />
        )}

        {current.body && (
          <div style={bodyStyle}>{current.body}</div>
        )}

        {isQuiz && current.questions.map((q, qi) => {
          const a = answers[q.id] || {};
          return (
            <div key={q.id} style={questionBox}>
              <div style={questionText}>{qi + 1}. {q.questionText}</div>

              {q.options && q.options.length > 0 && q.options.map((opt, oi) => (
                <label key={oi} style={optionRow}>
                  <input
                    type="radio"
                    name={`ptq-${q.id}`}
                    checked={a.selectedOption === oi}
                    onChange={() => setAnswer(q.id, { selectedOption: oi })}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <span>{opt}</span>
                </label>
              ))}

              {q.allowText && (
                <textarea
                  value={a.answerText || ''}
                  onChange={(e) => setAnswer(q.id, { answerText: e.target.value })}
                  placeholder={t('pepTalk.yourAnswer')}
                  rows={2}
                  style={answerTextarea}
                />
              )}

              {q.allowMedia && (
                <label style={mediaBtn}>
                  {a.mediaFile ? `✓ ${t('pepTalk.changePhotoVideo')}` : t('pepTalk.addPhotoVideo')}
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/quicktime,video/webm"
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (file) setAnswer(q.id, { mediaFile: file });
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          );
        })}

        {error && <div style={errorStyle}>{error}</div>}

        {isQuiz ? (
          <button
            onClick={handleSubmitQuiz}
            disabled={!quizComplete || !videoGateOk || submitting}
            style={{
              ...acknowledgeBtnStyle,
              opacity: (quizComplete && videoGateOk && !submitting) ? 1 : 0.5,
              cursor: (quizComplete && videoGateOk && !submitting) ? 'pointer' : 'not-allowed'
            }}
          >
            {submitting
              ? t('pepTalk.submitting')
              : (!quizComplete ? t('pepTalk.answerAllToContinue') : t('pepTalk.submitAnswers'))}
          </button>
        ) : (
          <button
            onClick={handleAcknowledge}
            disabled={!canAcknowledge}
            style={{
              ...acknowledgeBtnStyle,
              opacity: canAcknowledge ? 1 : 0.5,
              cursor: canAcknowledge ? 'pointer' : 'not-allowed'
            }}
          >
            {current.videoUrl && !videoWatched ? t('pepTalk.watchToContinue') : t('pepTalk.gotIt')}
          </button>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
};

const dialogStyle = {
  position: 'relative',
  background: '#111827',
  color: 'white',
  borderRadius: 16,
  maxWidth: 560,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: 24,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
};

const closeBtnStyle = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  color: 'white',
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer'
};

const titleStyle = {
  fontSize: '1.25rem',
  fontWeight: 700,
  marginBottom: 14,
  paddingRight: 36
};

const videoStyle = {
  width: '100%',
  borderRadius: 12,
  marginBottom: 14,
  background: 'black'
};

const imageStyle = {
  width: '100%',
  borderRadius: 12,
  marginBottom: 14,
  display: 'block'
};

const bodyStyle = {
  fontSize: '0.95rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  marginBottom: 18,
  color: '#e5e7eb'
};

const questionBox = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: 14,
  marginBottom: 12
};

const questionText = {
  fontSize: '0.95rem',
  fontWeight: 600,
  marginBottom: 10,
  color: '#f3f4f6'
};

const optionRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#e5e7eb'
};

const answerTextarea = {
  width: '100%',
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
  fontSize: '0.9rem',
  resize: 'vertical',
  boxSizing: 'border-box'
};

const mediaBtn = {
  display: 'inline-block',
  marginTop: 10,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed rgba(255,255,255,0.3)',
  color: '#e5e7eb',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const errorStyle = {
  color: '#fca5a5',
  fontSize: '0.85rem',
  marginBottom: 12
};

const resultBox = {
  textAlign: 'center',
  padding: '24px 12px',
  marginBottom: 18,
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 12,
  color: 'white'
};

const acknowledgeBtnStyle = {
  width: '100%',
  padding: '14px 20px',
  background: 'var(--brand-primary-darker, #0d9488)',
  color: 'white',
  border: 'none',
  borderRadius: 10,
  fontSize: '1rem',
  fontWeight: 600
};

export default PepTalkModal;
