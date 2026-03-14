import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Send, ExternalLink } from 'lucide-react';
import { apiPost } from '../utils/api';

const PROGRESS_DURATION = 6000; // 6 seconds per story

function StoryViewer({ stories, coachName, coachAvatar, clientId, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Start at first unseen story
    const firstUnseen = stories.findIndex(s => !s.viewed);
    return firstUnseen >= 0 ? firstUnseen : 0;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [reacted, setReacted] = useState(null);
  const [sending, setSending] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedRef = useRef(0);
  const containerRef = useRef(null);

  const story = stories[currentIndex];

  // Mark story as viewed
  useEffect(() => {
    if (story && !story.viewed) {
      apiPost('/.netlify/functions/view-story', {
        storyId: story.id,
        clientId
      }).catch(() => {});
    }
  }, [story?.id, clientId]);

  // Auto-advance timer
  const startTimer = useCallback(() => {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = elapsedRef.current + (Date.now() - startTimeRef.current);
      const pct = Math.min(elapsed / PROGRESS_DURATION, 1);
      setProgress(pct);

      if (pct >= 1) {
        goNext();
      } else {
        timerRef.current = requestAnimationFrame(tick);
      }
    };
    timerRef.current = requestAnimationFrame(tick);
  }, [currentIndex, stories.length]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    elapsedRef.current += Date.now() - (startTimeRef.current || Date.now());
  }, []);

  const resetAndStart = useCallback(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setReacted(null);
    setShowReplyInput(false);
    setReplyText('');
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (!paused && !showReplyInput) {
      resetAndStart();
    }
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [currentIndex, paused, showReplyInput]);

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    } else {
      elapsedRef.current = 0;
      setProgress(0);
      startTimer();
    }
  };

  // Tap left/right to navigate
  const handleTap = (e) => {
    if (showReplyInput) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) {
      goPrev();
    } else {
      goNext();
    }
  };

  // Hold to pause
  const handlePointerDown = () => {
    if (showReplyInput) return;
    setPaused(true);
    pauseTimer();
  };
  const handlePointerUp = () => {
    if (showReplyInput) return;
    setPaused(false);
  };

  // Reactions
  const handleReaction = async (emoji) => {
    setReacted(emoji);
    try {
      await apiPost('/.netlify/functions/react-to-story', {
        storyId: story.id,
        clientId,
        reaction: emoji
      });
    } catch (err) {
      console.error('Error reacting:', err);
    }
  };

  // Reply
  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await apiPost('/.netlify/functions/reply-to-story', {
        storyId: story.id,
        clientId,
        coachId: story.coachId || null,
        message: replyText.trim()
      });
      setReplyText('');
      setShowReplyInput(false);
    } catch (err) {
      console.error('Error replying:', err);
    } finally {
      setSending(false);
    }
  };

  const handleReplyKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  if (!story) return null;

  const avatarUrl = coachAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachName || 'Coach')}&background=0d9488&color=fff`;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={containerRef}
        style={styles.container}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Progress bars */}
        <div style={styles.progressBar}>
          {stories.map((_, i) => (
            <div key={i} style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: i < currentIndex ? '100%' : i === currentIndex ? `${progress * 100}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div style={styles.header}>
          <img src={avatarUrl} alt={coachName} style={styles.avatar} />
          <div style={styles.headerText}>
            <div style={styles.coachName}>{coachName}</div>
            <div style={styles.timeAgo}>{formatTimeAgo(story.createdAt)}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content} onClick={handleTap}>
          {story.type === 'image' && (
            <div style={styles.imageContainer}>
              <img src={story.imageUrl} alt={story.caption || 'Story'} style={styles.storyImage} />
              {story.caption && <div style={styles.caption}>{story.caption}</div>}
            </div>
          )}
          {story.type === 'quote' && (
            <div style={styles.quoteContainer}>
              <div style={styles.quoteText}>"{story.quoteText}"</div>
              {story.quoteAuthor && <div style={styles.quoteAuthor}>— {story.quoteAuthor}</div>}
            </div>
          )}
          {story.type === 'link' && (
            <div style={styles.linkContainer}>
              {story.linkPreviewImage && (
                <img src={story.linkPreviewImage} alt="" style={styles.linkImage} />
              )}
              <div style={styles.linkTitle}>{story.linkTitle || 'Shared Link'}</div>
              {story.caption && <div style={styles.caption}>{story.caption}</div>}
              <a
                href={story.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.linkButton}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={14} /> Open Link
              </a>
            </div>
          )}
        </div>

        {/* Navigation arrows (desktop) */}
        {currentIndex > 0 && (
          <button style={{ ...styles.navBtn, left: 8 }} onClick={goPrev} aria-label="Previous">
            <ChevronLeft size={24} />
          </button>
        )}
        {currentIndex < stories.length - 1 && (
          <button style={{ ...styles.navBtn, right: 8 }} onClick={goNext} aria-label="Next">
            <ChevronRight size={24} />
          </button>
        )}

        {/* Footer: reactions + reply */}
        <div style={styles.footer}>
          {!showReplyInput ? (
            <>
              <div style={styles.reactions}>
                {['❤️', '🔥', '👏', '💪'].map(emoji => (
                  <button
                    key={emoji}
                    style={{
                      ...styles.reactionBtn,
                      ...(reacted === emoji ? styles.reactionBtnActive : {})
                    }}
                    onClick={() => handleReaction(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                style={styles.replyBtn}
                onClick={() => {
                  pauseTimer();
                  setShowReplyInput(true);
                }}
              >
                Reply...
              </button>
            </>
          ) : (
            <div style={styles.replyInputRow}>
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleReplyKeyDown}
                placeholder="Send a reply..."
                style={styles.replyInput}
                autoFocus
              />
              <button
                style={styles.sendBtn}
                onClick={handleSendReply}
                disabled={!replyText.trim() || sending}
              >
                <Send size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.95)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    height: '100dvh',
    maxHeight: 750,
    background: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
    touchAction: 'manipulation',
  },
  progressBar: {
    display: 'flex',
    gap: 3,
    padding: '10px 12px 0',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    background: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#fff',
    borderRadius: 2,
    transition: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '28px 12px 10px',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  headerText: {
    flex: 1,
  },
  coachName: {
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
  },
  timeAgo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: 4,
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  caption: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    padding: '12px 16px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    color: '#fff',
    fontSize: 15,
    lineHeight: 1.4,
  },
  quoteContainer: {
    padding: '40px 28px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0d9488 0%, #065f46 100%)',
    width: '100%',
    height: '100%',
  },
  quoteText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.5,
    fontStyle: 'italic',
    maxWidth: 340,
  },
  quoteAuthor: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 16,
  },
  linkContainer: {
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    background: '#111',
  },
  linkImage: {
    width: '100%',
    maxHeight: 200,
    objectFit: 'cover',
    borderRadius: 8,
  },
  linkTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    textAlign: 'center',
  },
  linkButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    background: '#0d9488',
    color: '#fff',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    marginTop: 8,
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    borderRadius: '50%',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 5,
  },
  footer: {
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  reactions: {
    display: 'flex',
    gap: 4,
  },
  reactionBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: '50%',
    width: 40,
    height: 40,
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.15s',
  },
  reactionBtnActive: {
    transform: 'scale(1.25)',
    background: 'rgba(255,255,255,0.3)',
  },
  replyBtn: {
    flex: 1,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 20,
    color: 'rgba(255,255,255,0.7)',
    padding: '10px 16px',
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
  },
  replyInputRow: {
    display: 'flex',
    gap: 8,
    flex: 1,
  },
  replyInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 20,
    color: '#fff',
    padding: '10px 16px',
    fontSize: 14,
    outline: 'none',
  },
  sendBtn: {
    background: '#0d9488',
    border: 'none',
    borderRadius: '50%',
    width: 40,
    height: 40,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default StoryViewer;
