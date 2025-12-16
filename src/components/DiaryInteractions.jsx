import { useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { apiPost, apiDelete } from '../utils/api';

// Available reaction emojis
const REACTIONS = ['👏', '💪', '🔥', '⭐', '❤️'];

// Reaction button component - shows emoji options for coach to react
export function DiaryReactionPicker({ entryId, clientId, coachId, currentReaction, onReactionChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReaction = async (reaction) => {
    if (loading) return;

    setLoading(true);
    try {
      // If clicking the same reaction, remove it
      if (currentReaction === reaction) {
        await apiDelete('/.netlify/functions/react-to-diary-entry', {
          entryId,
          coachId
        });
        onReactionChange(null);
      } else {
        // Add or change reaction
        await apiPost('/.netlify/functions/react-to-diary-entry', {
          entryId,
          coachId,
          clientId,
          reaction
        });
        onReactionChange(reaction);
      }
    } catch (err) {
      console.error('Error saving reaction:', err);
    } finally {
      setLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="diary-reaction-picker">
      {currentReaction ? (
        <button
          className="diary-reaction-current"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
        >
          <span className="reaction-emoji">{currentReaction}</span>
        </button>
      ) : (
        <button
          className="diary-reaction-add"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
        >
          <span className="reaction-placeholder">+</span>
        </button>
      )}

      {isOpen && (
        <div className="diary-reaction-options">
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              className={`diary-reaction-option ${currentReaction === emoji ? 'selected' : ''}`}
              onClick={() => handleReaction(emoji)}
              disabled={loading}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Display reactions for client view (read-only, shows who reacted)
export function DiaryReactionDisplay({ reactions = [] }) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="diary-reactions-display">
      {reactions.map((r, idx) => (
        <span key={idx} className="diary-reaction-badge" title={r.coachName}>
          {r.reaction}
        </span>
      ))}
    </div>
  );
}

// Comment input for adding new comments
export function DiaryCommentInput({ entryId, clientId, coachId, authorType = 'coach', onCommentAdded }) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim() || loading) return;

    setLoading(true);
    try {
      const result = await apiPost('/.netlify/functions/comment-on-diary-entry', {
        entryId,
        clientId,
        coachId,
        comment: comment.trim(),
        authorType
      });

      if (result.success) {
        setComment('');
        onCommentAdded?.(result.comment);
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="diary-comment-input" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Add a comment..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={loading}
        maxLength={500}
      />
      <button type="submit" disabled={!comment.trim() || loading}>
        <Send size={18} />
      </button>
    </form>
  );
}

// Display comments list
export function DiaryCommentsDisplay({ comments = [], onReply }) {
  if (!comments || comments.length === 0) return null;

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="diary-comments-list">
      {comments.map(c => (
        <div key={c.id} className={`diary-comment ${c.authorType}`}>
          <div className="diary-comment-header">
            <span className="diary-comment-author">{c.authorName}</span>
            <span className="diary-comment-time">{formatTime(c.createdAt)}</span>
          </div>
          <p className="diary-comment-text">{c.comment}</p>
          {onReply && c.authorType === 'coach' && (
            <button className="diary-comment-reply-btn" onClick={() => onReply(c)}>
              Reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Combined interaction component for feed items
export function DiaryEntryInteractions({
  entryId,
  clientId,
  coachId,
  reaction,
  comments = [],
  isCoach = false,
  onReactionChange,
  onCommentAdded
}) {
  const [showComments, setShowComments] = useState(false);
  const commentCount = comments?.length || 0;

  return (
    <div className="diary-entry-interactions">
      <div className="diary-interactions-row">
        {isCoach ? (
          <DiaryReactionPicker
            entryId={entryId}
            clientId={clientId}
            coachId={coachId}
            currentReaction={reaction}
            onReactionChange={onReactionChange}
          />
        ) : (
          <DiaryReactionDisplay reactions={reaction ? [{ reaction }] : []} />
        )}

        <button
          className={`diary-comments-toggle ${commentCount > 0 ? 'has-comments' : ''}`}
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle size={18} />
          {commentCount > 0 && <span className="comment-count">{commentCount}</span>}
        </button>
      </div>

      {showComments && (
        <div className="diary-comments-section">
          <DiaryCommentsDisplay comments={comments} />
          {isCoach && (
            <DiaryCommentInput
              entryId={entryId}
              clientId={clientId}
              coachId={coachId}
              authorType="coach"
              onCommentAdded={onCommentAdded}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default DiaryEntryInteractions;
