import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

const formatVoiceTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// iOS Safari only grants one active media session at a time. When several
// VoiceNotePlayers are mounted (e.g. one per exercise in the day), tapping
// play on a second one silently fails because the first hasn't released the
// session. Install a single document-level capture-phase listener (capture
// because 'play' does not bubble) that pauses every other audio when one
// starts, so the new tap always wins.
if (typeof window !== 'undefined' && !window.__voiceNoteAudioCoordinator) {
  window.__voiceNoteAudioCoordinator = true;
  document.addEventListener('play', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLAudioElement)) return;
    document.querySelectorAll('audio').forEach(a => {
      if (a !== target && !a.paused) a.pause();
    });
  }, true);
}

// Custom voice-note player — replaces native <audio controls> for a
// brand-consistent, dark-theme-friendly UI. Click the progress bar to seek;
// taps don't bubble so the surrounding card doesn't activate.
export default function VoiceNotePlayer({ src, onMissing }) {
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      return;
    }
    // Defense in depth: pause every other audio synchronously before we call
    // play(). The global coordinator handles this too once 'play' fires, but
    // pausing here first avoids the iOS race where the new play() rejects
    // with NotAllowedError before the coordinator gets a chance to run.
    document.querySelectorAll('audio').forEach(a => {
      if (a !== audio && !a.paused) a.pause();
    });
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        console.warn('[voice-note] play rejected', {
          name: err?.name,
          message: err?.message,
          src: audio.currentSrc || audio.src,
          userAgent: navigator.userAgent
        });
      });
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = barRef.current;
    // webm voice notes can report duration = Infinity — seeking is impossible
    // then (ratio * Infinity), so bail out until a finite duration is known.
    if (!audio || !bar || !duration || !Number.isFinite(duration)) return;
    const rect = bar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remaining = Math.max(0, duration - currentTime);

  return (
    <div className="vn-player" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="vn-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
      </button>
      <div
        className="vn-progress"
        ref={barRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(duration) ? Math.round(duration) : 0}
        aria-valuenow={Math.round(currentTime) || 0}
        onClick={handleSeek}
      >
        <div className="vn-progress-fill" style={{ width: `${progressPct}%` }} />
        <div className="vn-progress-thumb" style={{ left: `${progressPct}%` }} />
      </div>
      <span className="vn-time">
        {isPlaying || currentTime > 0 || !Number.isFinite(duration)
          ? formatVoiceTime(currentTime)
          : `-${formatVoiceTime(remaining)}`}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => {
          // webm reports Infinity at first; pick up the real duration once known
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onError={onMissing}
      />
    </div>
  );
}
