import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { apiPost } from '../utils/api';

const STORY_DURATION = 5000; // 5 seconds per story

function StoryViewer({ stories, coachName, coachAvatar, clientId, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyPlaceholder, setReplyPlaceholder] = useState('Send a message...');
  const timerRef = useRef(null);
  const timerStartRef = useRef(null);
  const timerRemainingRef = useRef(STORY_DURATION);
  const progressRef = useRef([]);

  const currentStory = stories[currentIndex];

  // Get time ago string
  const getTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Close viewer
  const handleClose = useCallback(() => {
    clearTimeout(timerRef.current);
    document.body.style.overflow = '';
    onClose();
  }, [onClose]);

  // Go to next story
  const nextStory = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  }, [currentIndex, stories.length, handleClose]);

  // Go to previous story
  const prevStory = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  // Start timer for current story
  const startTimer = useCallback((duration = STORY_DURATION) => {
    clearTimeout(timerRef.current);
    timerRemainingRef.current = duration;
    timerStartRef.current = Date.now();

    // Animate progress bar
    const progressEl = progressRef.current[currentIndex];
    if (progressEl) {
      progressEl.style.transition = `width ${duration}ms linear`;
      setTimeout(() => {
        progressEl.style.width = '100%';
      }, 50);
    }

    timerRef.current = setTimeout(() => {
      nextStory();
    }, duration);
  }, [currentIndex, nextStory]);

  // Pause timer
  const pauseTimer = useCallback(() => {
    if (isPaused) return;
    setIsPaused(true);
    clearTimeout(timerRef.current);
    timerRemainingRef.current = timerRemainingRef.current - (Date.now() - timerStartRef.current);

    // Pause progress bar
    const progressEl = progressRef.current[currentIndex];
    if (progressEl) {
      const computedWidth = getComputedStyle(progressEl).width;
      progressEl.style.transition = 'none';
      progressEl.style.width = computedWidth;
    }
  }, [isPaused, currentIndex]);

  // Resume timer
  const resumeTimer = useCallback(() => {
    if (!isPaused) return;
    setIsPaused(false);
    timerStartRef.current = Date.now();

    // Resume progress bar
    const progressEl = progressRef.current[currentIndex];
    if (progressEl && timerRemainingRef.current > 0) {
      progressEl.style.transition = `width ${timerRemainingRef.current}ms linear`;
      setTimeout(() => {
        progressEl.style.width = '100%';
      }, 50);
    }

    if (timerRemainingRef.current > 0) {
      timerRef.current = setTimeout(() => {
        nextStory();
      }, timerRemainingRef.current);
    } else {
      nextStory();
    }
  }, [isPaused, currentIndex, nextStory]);

  // Reset progress bars and start timer when story changes
  useEffect(() => {
    // Reset all progress bars
    progressRef.current.forEach((el, i) => {
      if (el) {
        el.style.transition = 'none';
        el.style.width = i < currentIndex ? '100%' : '0%';
      }
    });

    // Mark story as viewed
    if (currentStory?.id) {
      apiPost('/.netlify/functions/view-story', {
        storyId: currentStory.id,
        clientId
      }).catch(err => console.error('Error marking story viewed:', err));
    }

    // Start timer
    startTimer();

    return () => clearTimeout(timerRef.current);
  }, [currentIndex, currentStory?.id, clientId, startTimer]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft') prevStory();
      if (e.key === 'ArrowRight') nextStory();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, prevStory, nextStory]);

  // React to story
  const handleReaction = async (emoji) => {
    if (!currentStory?.id) return;

    try {
      await apiPost('/.netlify/functions/react-to-story', {
        storyId: currentStory.id,
        clientId,
        reaction: emoji
      });
    } catch (err) {
      console.error('Error reacting to story:', err);
    }
  };

  // Send reply
  const handleSendReply = async () => {
    if (!replyText.trim() || !currentStory?.id) return;

    try {
      await apiPost('/.netlify/functions/reply-to-story', {
        storyId: currentStory.id,
        clientId,
        coachId: currentStory.coachId,
        message: replyText
      });

      setReplyText('');
      setReplyPlaceholder('Message sent!');
      setTimeout(() => setReplyPlaceholder('Send a message...'), 2000);
    } catch (err) {
      console.error('Error sending reply:', err);
    }
  };

  // Render story content based on type
  const renderContent = () => {
    if (!currentStory) return null;

    if (currentStory.type === 'image') {
      return (
        <div style={{ textAlign: 'center' }}>
          <img
            src={currentStory.imageUrl}
            alt="Story"
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px' }}
          />
          {currentStory.caption && (
            <p style={{ color: 'white', marginTop: '16px', fontSize: '16px' }}>
              {currentStory.caption}
            </p>
          )}
        </div>
      );
    }

    if (currentStory.type === 'quote') {
      return (
        <div className="story-quote-card">
          <div className="story-quote-text">"{currentStory.quoteText}"</div>
          {currentStory.quoteAuthor && (
            <div className="story-quote-author">— {currentStory.quoteAuthor}</div>
          )}
        </div>
      );
    }

    if (currentStory.type === 'link') {
      return (
        <a
          href={currentStory.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="story-link-card"
          style={{ textDecoration: 'none' }}
        >
          {currentStory.linkPreviewImage && (
            <img src={currentStory.linkPreviewImage} className="story-link-preview" alt="" />
          )}
          <div className="story-link-info">
            <div className="story-link-title">{currentStory.linkTitle || 'Check this out'}</div>
            <div className="story-link-url">
              {new URL(currentStory.linkUrl).hostname}
            </div>
          </div>
        </a>
      );
    }

    return null;
  };

  return (
    <div className="story-viewer-overlay" onClick={handleClose}>
      <div className="story-viewer" onClick={(e) => e.stopPropagation()}>
        {/* Progress bars */}
        <div className="story-progress-container">
          {stories.map((_, i) => (
            <div key={i} className="story-progress-bar">
              <div
                className="story-progress-fill"
                ref={el => progressRef.current[i] = el}
                style={{ width: i < currentIndex ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="story-header">
          <div className="story-user-info">
            <img
              className="story-header-avatar"
              src={coachAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachName || 'Coach')}&background=0d9488&color=fff`}
              alt={coachName || 'Coach'}
            />
            <div className="story-user-details">
              <span className="story-username">{coachName || 'Your Coach'}</span>
              <span className="story-time">
                {currentStory?.createdAt ? getTimeAgo(currentStory.createdAt) : 'Just now'}
              </span>
            </div>
          </div>
          <button className="story-close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="story-content">
          {renderContent()}
        </div>

        {/* Navigation areas */}
        <div className="story-nav story-nav-prev" onClick={prevStory} />
        <div className="story-nav story-nav-next" onClick={nextStory} />

        {/* Footer with reactions */}
        <div className="story-footer">
          <div className="story-reactions">
            {['🔥', '💪', '❤️', '👏'].map(emoji => (
              <button
                key={emoji}
                className="reaction-btn"
                onClick={() => handleReaction(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="story-reply-container">
            <input
              type="text"
              className="story-reply-input"
              placeholder={replyPlaceholder}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={pauseTimer}
              onBlur={resumeTimer}
              onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
            />
            <button className="story-reply-btn" onClick={handleSendReply}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoryViewer;
