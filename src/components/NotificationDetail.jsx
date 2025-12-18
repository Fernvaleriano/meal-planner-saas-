import { useState } from 'react';
import { X, MessageCircle, ExternalLink, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api';

function NotificationDetail({ notification, clientId, onClose, onReplySuccess }) {
  const navigate = useNavigate();
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const metadata = notification.metadata || {};
  const isReaction = notification.type === 'diary_reaction';
  const isComment = notification.type === 'diary_comment';

  // Format the entry date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  };

  // Navigate to the diary entry
  const handleViewEntry = () => {
    const dateParam = metadata.entry_date || '';
    onClose();
    if (dateParam) {
      navigate(`/diary?date=${dateParam}&highlight=${notification.related_entry_id}`);
    } else {
      navigate('/diary');
    }
  };

  // Submit reply
  const handleSubmitReply = async () => {
    if (!replyText.trim() || !notification.related_entry_id) return;

    setIsSubmitting(true);
    try {
      await apiPost('/.netlify/functions/comment-on-diary-entry', {
        entryId: notification.related_entry_id,
        clientId: clientId,
        comment: replyText.trim(),
        authorType: 'client'
      });

      setReplyText('');
      setShowReplyInput(false);
      if (onReplySuccess) {
        onReplySuccess();
      }
    } catch (err) {
      console.error('Error submitting reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="notification-detail-overlay" onClick={onClose}>
      <div className="notification-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="notification-detail-header">
          <h3>Notification</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="notification-detail-content">
          {/* Meal Info Card */}
          <div className="meal-info-card">
            <div className="meal-type-badge">{metadata.meal_type || 'Meal'}</div>
            <div className="meal-name">{metadata.food_name || 'Your meal'}</div>
            {metadata.entry_date && (
              <div className="meal-date">{formatDate(metadata.entry_date)}</div>
            )}
          </div>

          {/* Coach Action */}
          <div className="coach-action">
            {isReaction && (
              <div className="reaction-display">
                <span className="reaction-emoji">{metadata.reaction}</span>
                <span className="reaction-text">
                  {metadata.coach_name || 'Your coach'} reacted to your {metadata.meal_type || 'meal'}
                </span>
              </div>
            )}

            {isComment && (
              <div className="comment-display">
                <div className="comment-header">
                  <MessageCircle size={16} />
                  <span>{metadata.coach_name || 'Your coach'}</span>
                </div>
                <div className="comment-text">
                  {metadata.full_comment || notification.message?.replace(/^"|"$/g, '')}
                </div>
              </div>
            )}
          </div>

          {/* Reply Section */}
          {isComment && notification.related_entry_id && (
            <div className="reply-section">
              {!showReplyInput ? (
                <button
                  className="reply-toggle-btn"
                  onClick={() => setShowReplyInput(true)}
                >
                  <MessageCircle size={16} />
                  Reply to coach
                </button>
              ) : (
                <div className="reply-input-container">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    maxLength={500}
                    rows={3}
                    autoFocus
                  />
                  <div className="reply-actions">
                    <span className="char-count">{replyText.length}/500</span>
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setShowReplyInput(false);
                        setReplyText('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="send-btn"
                      onClick={handleSubmitReply}
                      disabled={!replyText.trim() || isSubmitting}
                    >
                      <Send size={14} />
                      {isSubmitting ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="notification-detail-footer">
          <button className="view-entry-btn" onClick={handleViewEntry}>
            <ExternalLink size={16} />
            View in Diary
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotificationDetail;
