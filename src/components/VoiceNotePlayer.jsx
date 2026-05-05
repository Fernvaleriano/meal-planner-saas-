import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

const formatVoiceTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

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
    } else {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => { /* ignore */ });
      }
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !duration) return;
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
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(currentTime) || 0}
        onClick={handleSeek}
      >
        <div className="vn-progress-fill" style={{ width: `${progressPct}%` }} />
        <div className="vn-progress-thumb" style={{ left: `${progressPct}%` }} />
      </div>
      <span className="vn-time">
        {isPlaying || currentTime > 0 ? formatVoiceTime(currentTime) : `-${formatVoiceTime(remaining)}`}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onError={onMissing}
      />
    </div>
  );
}
