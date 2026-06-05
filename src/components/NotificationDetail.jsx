import { useState } from 'react';
import { X, MessageCircle, ExternalLink, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { apiPost } from '../utils/api';
import { getDateLocale } from '../utils/dateLocale';

function NotificationDetail({ notification, clientId, onClose, onReplySuccess }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const metadata = notification.metadata || {};
  const isReaction = notification.type === 'diary_reaction';
  const isComment = notification.type === 'diary_comment';
  const isCoachResponse = notification.type === 'coach_responded';

  // Format the entry date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(getDateLocale(), {
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
          <h3>{t('notificationDetail.heading')}</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="notification-detail-content">
          {/* Coach Response to Check-in */}
          {isCoachResponse && (
            <>
              <div className="coach-action">
                <div className="comment-display">
                  <div className="comment-header">
                    <MessageCircle size={16} />
                    <span>{t('notificationDetail.coachRespondedToCheckin')}</span>
                  </div>
                  <div className="comment-text" style={{ whiteSpace: 'pre-wrap' }}>
                    "{metadata.coach_feedback || notification.message?.replace(/^Your coach responded to your check-in: /, '').replace(/^"|"$/g, '')}"
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Meal Info Card */}
          {!isCoachResponse && (
            <div className="meal-info-card">
              <div className="meal-type-badge">{metadata.meal_type || t('notificationDetail.mealFallback')}</div>
              <div className="meal-name">{metadata.food_name || t('notificationDetail.mealNameFallback')}</div>
              {metadata.entry_date && (
                <div className="meal-date">{formatDate(metadata.entry_date)}</div>
              )}
            </div>
          )}

          {/* Coach Action */}
          {!isCoachResponse && (
            <div className="coach-action">
              {isReaction && (
                <div className="reaction-display">
                  <span className="reaction-emoji">{metadata.reaction}</span>
                  <span className="reaction-text">
                    {metadata.coach_name || t('notificationDetail.coachFallbackName')} {t('notificationDetail.reactedToYour')} {metadata.meal_type || t('notificationDetail.mealFallback')}
                  </span>
                </div>
              )}

              {isComment && (
                <div className="comment-display">
                  <div className="comment-header">
                    <MessageCircle size={16} />
                    <span>{metadata.coach_name || t('notificationDetail.coachFallbackName')}</span>
                  </div>
                  <div className="comment-text">
                    {metadata.full_comment || notification.message?.replace(/^"|"$/g, '')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reply Section */}
          {isComment && !isCoachResponse && notification.related_entry_id && (
            <div className="reply-section">
              {!showReplyInput ? (
                <button
                  className="reply-toggle-btn"
                  onClick={() => setShowReplyInput(true)}
                >
                  <MessageCircle size={16} />
                  {t('notificationDetail.replyToCoach')}
                </button>
              ) : (
                <div className="reply-input-container">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('notificationDetail.replyPlaceholder')}
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
                      {t('notificationDetail.cancel')}
                    </button>
                    <button
                      className="send-btn"
                      onClick={handleSubmitReply}
                      disabled={!replyText.trim() || isSubmitting}
                    >
                      <Send size={14} />
                      {isSubmitting ? t('notificationDetail.sending') : t('notificationDetail.send')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="notification-detail-footer">
          {isCoachResponse ? (
            <button className="view-entry-btn" onClick={onClose}>
              {t('notificationDetail.gotIt')}
            </button>
          ) : (
            <button className="view-entry-btn" onClick={handleViewEntry}>
              <ExternalLink size={16} />
              {t('notificationDetail.viewInDiary')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationDetail;
