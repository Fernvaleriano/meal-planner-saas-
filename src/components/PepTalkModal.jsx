import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../utils/api';
import { useUnviewedPepTalks } from '../hooks/useUnviewedPepTalks';

// Threshold for "watched" — the video has to play at least this fraction of
// its duration before the "Got it" button enables. Matches the product rule:
// "they can dismiss it but it keeps popping up until they watch it!"
const VIEWED_FRACTION = 0.9;

function PepTalkModal() {
  const { clientData } = useAuth();
  const clientId = clientData?.id;
  const isCoach = clientData?.is_coach === true;

  const { pepTalks, refresh, dismissLocal } = useUnviewedPepTalks(isCoach ? null : clientId);

  const current = pepTalks[0] || null;
  const [videoWatched, setVideoWatched] = useState(false);
  const videoRef = useRef(null);
  const openedRef = useRef(null);                // tracks which pep talk we've already logged "opened" for

  // When the active pep talk changes, reset the watched gate and log "opened".
  useEffect(() => {
    if (!current || !clientId) return;

    setVideoWatched(false);

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

  // For text-only pep talks the "Got it" button is enabled immediately.
  const canAcknowledge = current && (!current.videoUrl || videoWatched);

  const handleAcknowledge = useCallback(async () => {
    if (!current || !clientId) return;
    try {
      await apiPost('/.netlify/functions/mark-pep-talk-viewed', {
        clientId,
        pepTalkId: current.id,
        action: 'viewed'
      });
    } catch (err) {
      console.error('Failed to mark pep talk viewed:', err);
      // Even if the server call fails, refresh — the list endpoint will tell us
      // whether the row actually flipped, so we don't end up stuck on a dead modal.
    }
    refresh();
  }, [current, clientId, refresh]);

  const handleDismiss = useCallback(() => {
    if (!current || !clientId) return;
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
  }, [current, clientId, dismissLocal]);

  if (!current) return null;

  return (
    <div style={overlayStyle} onClick={handleDismiss}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="Dismiss"
          onClick={handleDismiss}
          style={closeBtnStyle}
        >
          <X size={20} />
        </button>

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

        {current.body && (
          <div style={bodyStyle}>{current.body}</div>
        )}

        <button
          onClick={handleAcknowledge}
          disabled={!canAcknowledge}
          style={{
            ...acknowledgeBtnStyle,
            opacity: canAcknowledge ? 1 : 0.5,
            cursor: canAcknowledge ? 'pointer' : 'not-allowed'
          }}
        >
          {current.videoUrl && !videoWatched ? 'Watch the video to continue' : "Got it"}
        </button>
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

const bodyStyle = {
  fontSize: '0.95rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  marginBottom: 18,
  color: '#e5e7eb'
};

const acknowledgeBtnStyle = {
  width: '100%',
  padding: '14px 20px',
  background: '#0d9488',
  color: 'white',
  border: 'none',
  borderRadius: 10,
  fontSize: '1rem',
  fontWeight: 600
};

export default PepTalkModal;
