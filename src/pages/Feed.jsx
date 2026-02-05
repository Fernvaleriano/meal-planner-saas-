import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, Sun, Moon, Apple, Filter, ChevronDown, ChevronUp, User, Calendar, RefreshCw, MessageCircle, Send, Dumbbell, TrendingUp, Award, Clock, Zap, Mic, Play, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete, ensureFreshSession } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Available reaction emojis
const REACTIONS = ['👏', '💪', '🔥', '⭐', '❤️'];

// Meal type config
const getMealConfig = (mealType) => {
  switch (mealType) {
    case 'breakfast':
      return { icon: Sunrise, label: 'Breakfast', color: '#f59e0b' };
    case 'lunch':
      return { icon: Sun, label: 'Lunch', color: '#f97316' };
    case 'dinner':
      return { icon: Moon, label: 'Dinner', color: '#8b5cf6' };
    case 'snack':
      return { icon: Apple, label: 'Snack', color: '#10b981' };
    default:
      return { icon: Sun, label: mealType, color: '#64748b' };
  }
};

// Format relative time
const formatRelativeTime = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Meal card component - shows grouped food items
function MealCard({ meal, coachId, onUpdate }) {
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  // Get the first reaction for the meal (simplify to one reaction per meal)
  const [localReaction, setLocalReaction] = useState(
    meal.reactions.length > 0 ? meal.reactions[0].reaction : null
  );
  const [localComments, setLocalComments] = useState(meal.comments || []);

  // Use the first entry ID for reactions (could be enhanced to react to all)
  const primaryEntryId = meal.entryIds[0];

  const mealConfig = getMealConfig(meal.mealType);
  const MealIcon = mealConfig.icon;

  const handleReaction = async (reaction) => {
    if (loading || !primaryEntryId) return;
    setLoading(true);

    try {
      if (localReaction === reaction) {
        // Remove reaction
        await apiDelete('/.netlify/functions/react-to-diary-entry', {
          entryId: primaryEntryId,
          coachId
        });
        setLocalReaction(null);
      } else {
        // Add/update reaction
        await apiPost('/.netlify/functions/react-to-diary-entry', {
          entryId: primaryEntryId,
          coachId,
          clientId: meal.clientId,
          reaction
        });
        setLocalReaction(reaction);
      }
    } catch (err) {
      console.error('Error saving reaction:', err);
    } finally {
      setLoading(false);
      setShowReactions(false);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim() || loading || !primaryEntryId) return;

    setLoading(true);
    try {
      const result = await apiPost('/.netlify/functions/comment-on-diary-entry', {
        entryId: primaryEntryId,
        clientId: meal.clientId,
        coachId,
        comment: comment.trim(),
        authorType: 'coach'
      });

      if (result.success) {
        setLocalComments([...localComments, {
          ...result.comment,
          authorType: 'coach',
          authorName: 'You'
        }]);
        setComment('');
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feed-meal-card">
      {/* Header with client info and meal type */}
      <div className="feed-meal-header">
        <div className="feed-client-info">
          {meal.clientPhoto ? (
            <img src={meal.clientPhoto} alt="" className="feed-client-avatar" />
          ) : (
            <div className="feed-client-avatar-placeholder">
              <User size={20} />
            </div>
          )}
          <div className="feed-client-details">
            <span className="feed-client-name">{meal.clientName}</span>
            <div className="feed-meal-meta">
              <span
                className="feed-meal-type-badge"
                style={{ backgroundColor: `${mealConfig.color}20`, color: mealConfig.color }}
              >
                <MealIcon size={14} />
                {mealConfig.label}
              </span>
              <span className="feed-meal-time">{formatRelativeTime(meal.latestCreatedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Food items list */}
      <div className="feed-meal-content">
        <button
          className="feed-meal-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span className="feed-meal-item-count">
            {meal.items.length} item{meal.items.length !== 1 ? 's' : ''}
          </span>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expanded && (
          <div className="feed-meal-items">
            {meal.items.map((item, idx) => (
              <div key={item.id || idx} className="feed-meal-item">
                <span className="feed-item-name">{item.foodName}</span>
                {item.brand && <span className="feed-item-brand">{item.brand}</span>}
                <span className="feed-item-calories">{Math.round(item.calories)} cal</span>
              </div>
            ))}
          </div>
        )}

        {/* Total macros */}
        <div className="feed-meal-totals">
          <span className="macro-total calories">{meal.totalCalories} cal</span>
          <span className="macro-total protein">{meal.totalProtein}g P</span>
          <span className="macro-total carbs">{meal.totalCarbs}g C</span>
          <span className="macro-total fat">{meal.totalFat}g F</span>
        </div>
      </div>

      {/* Interaction buttons */}
      <div className="feed-entry-actions">
        <div className="feed-reactions-container">
          {localReaction ? (
            <button
              className="feed-reaction-btn active"
              onClick={() => setShowReactions(!showReactions)}
            >
              <span className="reaction-emoji">{localReaction}</span>
            </button>
          ) : (
            <button
              className="feed-reaction-btn"
              onClick={() => setShowReactions(!showReactions)}
            >
              <span className="reaction-add">+</span>
              React
            </button>
          )}

          {showReactions && (
            <div className="feed-reactions-picker">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  className={`feed-reaction-option ${localReaction === emoji ? 'selected' : ''}`}
                  onClick={() => handleReaction(emoji)}
                  disabled={loading}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`feed-comment-btn ${localComments.length > 0 ? 'has-comments' : ''}`}
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle size={18} />
          {localComments.length > 0 && (
            <span className="comment-count">{localComments.length}</span>
          )}
          Comment
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="feed-comments-section">
          {localComments.length > 0 && (
            <div className="feed-comments-list">
              {localComments.map((c, idx) => (
                <div key={c.id || idx} className={`feed-comment ${c.authorType}`}>
                  <span className="feed-comment-author">
                    {c.authorType === 'coach' ? 'You' : meal.clientName}
                  </span>
                  <span className="feed-comment-text">{c.comment}</span>
                  <span className="feed-comment-time">
                    {formatRelativeTime(c.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form className="feed-comment-input" onSubmit={handleComment}>
            <input
              type="text"
              placeholder="Write a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={loading}
              maxLength={500}
            />
            <button type="submit" disabled={!comment.trim() || loading}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Workout feed card component - shows workout completions
function WorkoutFeedCard({ workout, coachId, onUpdate, weightUnit = 'lbs' }) {
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [exercisesExpanded, setExercisesExpanded] = useState(workout.hasClientNotes || false);
  const [voiceNoteUrls, setVoiceNoteUrls] = useState({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const [localReaction, setLocalReaction] = useState(
    workout.reactions?.length > 0 ? workout.reactions[0].reaction : null
  );
  const [localComments, setLocalComments] = useState(workout.comments || []);

  const workoutId = workout.id || workout.workoutId;

  // Resolve signed URLs for client voice notes
  useEffect(() => {
    const voicePaths = (workout.exercises || [])
      .filter(ex => ex.clientVoiceNotePath)
      .map(ex => ex.clientVoiceNotePath);
    if (voicePaths.length === 0) return;

    const fetchUrls = async () => {
      try {
        const res = await apiPost('/.netlify/functions/get-signed-urls', {
          filePaths: voicePaths,
          coachId
        });
        if (res?.signedUrls) {
          setVoiceNoteUrls(res.signedUrls);
        }
      } catch (err) {
        console.error('Error fetching voice note URLs:', err);
      }
    };
    fetchUrls();
  }, [workout.exercises, coachId]);

  const handleReaction = async (reaction) => {
    if (loading || !workoutId) return;
    setLoading(true);

    try {
      if (localReaction === reaction) {
        await apiDelete('/.netlify/functions/react-to-diary-entry', {
          entryId: workoutId,
          coachId,
          entryType: 'workout'
        });
        setLocalReaction(null);
      } else {
        await apiPost('/.netlify/functions/react-to-diary-entry', {
          entryId: workoutId,
          coachId,
          clientId: workout.clientId,
          reaction,
          entryType: 'workout'
        });
        setLocalReaction(reaction);
      }
    } catch (err) {
      console.error('Error saving reaction:', err);
    } finally {
      setLoading(false);
      setShowReactions(false);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim() || loading || !workoutId) return;

    setLoading(true);
    try {
      const result = await apiPost('/.netlify/functions/comment-on-diary-entry', {
        entryId: workoutId,
        clientId: workout.clientId,
        coachId,
        comment: comment.trim(),
        authorType: 'coach',
        entryType: 'workout'
      });

      if (result.success) {
        setLocalComments([...localComments, {
          ...result.comment,
          authorType: 'coach',
          authorName: 'You'
        }]);
        setComment('');
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setLoading(false);
    }
  };

  const volumeChange = workout.volumeChangePercent;
  const newPRs = workout.newPRs || 0;

  return (
    <div className="workout-feed-card">
      {/* Header with client info */}
      <div className="workout-feed-header">
        <div className="feed-client-info">
          {workout.clientPhoto ? (
            <img src={workout.clientPhoto} alt="" className="feed-client-avatar" />
          ) : (
            <div className="feed-client-avatar-placeholder">
              <User size={20} />
            </div>
          )}
          <div className="feed-client-details">
            <span className="feed-client-name">{workout.clientName}</span>
            <div className="feed-meal-meta">
              <span
                className="feed-meal-type-badge"
                style={{ backgroundColor: '#6366f120', color: '#6366f1' }}
              >
                <Dumbbell size={14} />
                Workout
              </span>
              <span className="feed-meal-time">{formatRelativeTime(workout.completedAt || workout.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workout name and date */}
      <div className="feed-meal-content">
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>
          {workout.workoutName || 'Workout'}
        </h3>

        {/* Stats row */}
        <div className="workout-feed-stats">
          {workout.duration != null && (
            <div className="workout-feed-stat">
              <Clock size={14} />
              <span>{workout.duration} min</span>
            </div>
          )}
          {workout.totalVolume != null && (
            <div className="workout-feed-stat">
              <Zap size={14} />
              <span>{workout.totalVolume.toLocaleString()} {weightUnit} volume</span>
            </div>
          )}
          {workout.totalSets != null && (
            <div className="workout-feed-stat">
              <Dumbbell size={14} />
              <span>{workout.totalSets} sets</span>
            </div>
          )}
        </div>

        {/* Improvement indicators */}
        {(volumeChange != null || newPRs > 0) && (
          <div className="workout-feed-improvements">
            {volumeChange != null && (
              <span className={volumeChange >= 0 ? 'improvement-positive' : 'improvement-negative'}>
                <TrendingUp size={14} />
                {volumeChange >= 0 ? '+' : ''}{volumeChange.toFixed(1)}% volume
              </span>
            )}
            {newPRs > 0 && (
              <span className="improvement-positive">
                <Award size={14} />
                {newPRs} new PR{newPRs !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Exercises list (collapsible) */}
        {workout.exercises && workout.exercises.length > 0 && (
          <>
            <button
              className="feed-meal-toggle"
              onClick={() => setExercisesExpanded(!exercisesExpanded)}
              aria-expanded={exercisesExpanded}
            >
              <span className="feed-meal-item-count">
                {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                {workout.hasClientNotes && (
                  <span className="client-note-badge-inline">
                    <MessageCircle size={12} /> Notes
                  </span>
                )}
              </span>
              {exercisesExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {exercisesExpanded && (
              <div className="workout-feed-exercises">
                {workout.exercises.map((exercise, idx) => (
                  <div key={exercise.id || idx} className="workout-feed-exercise-detail">
                    <div className="workout-feed-exercise-header">
                      <span className="feed-item-name">{exercise.exerciseName || exercise.name}</span>
                      <div className="workout-feed-exercise-badges">
                        {exercise.maxWeight != null && exercise.maxWeight > 0 && (
                          <span className="feed-item-calories">{exercise.maxWeight} kg max</span>
                        )}
                        {(exercise.isPr || exercise.isPR) && (
                          <span className="improvement-positive" style={{ fontSize: '0.75rem', marginLeft: 4 }}>
                            <Award size={12} /> PR
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sets detail */}
                    {exercise.setsData && exercise.setsData.length > 0 && (
                      <div className="workout-feed-sets">
                        {(typeof exercise.setsData === 'string' ? JSON.parse(exercise.setsData) : exercise.setsData).map((set, si) => (
                          <span key={si} className="workout-feed-set-pill">
                            {set.isTimeBased
                              ? `${set.reps || 0}s`
                              : `${set.reps || 0}x${set.weight || 0}${set.weightUnit || 'kg'}`}
                            {set.rpe && <span className="set-rpe-mini"> RPE {set.rpe}</span>}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Client text note */}
                    {exercise.clientNotes && (
                      <div className="workout-feed-client-note">
                        <MessageCircle size={12} />
                        <span>{exercise.clientNotes}</span>
                      </div>
                    )}

                    {/* Client voice note */}
                    {exercise.clientVoiceNotePath && (
                      <div className="workout-feed-client-voice-note">
                        <Mic size={12} />
                        {voiceNoteUrls[exercise.clientVoiceNotePath] ? (
                          <audio
                            controls
                            src={voiceNoteUrls[exercise.clientVoiceNotePath]}
                            preload="metadata"
                            className="feed-voice-note-player"
                          />
                        ) : (
                          <span className="voice-note-loading">Loading...</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Interaction buttons - same as MealCard */}
      <div className="feed-entry-actions">
        <div className="feed-reactions-container">
          {localReaction ? (
            <button
              className="feed-reaction-btn active"
              onClick={() => setShowReactions(!showReactions)}
            >
              <span className="reaction-emoji">{localReaction}</span>
            </button>
          ) : (
            <button
              className="feed-reaction-btn"
              onClick={() => setShowReactions(!showReactions)}
            >
              <span className="reaction-add">+</span>
              React
            </button>
          )}

          {showReactions && (
            <div className="feed-reactions-picker">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  className={`feed-reaction-option ${localReaction === emoji ? 'selected' : ''}`}
                  onClick={() => handleReaction(emoji)}
                  disabled={loading}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`feed-comment-btn ${localComments.length > 0 ? 'has-comments' : ''}`}
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle size={18} />
          {localComments.length > 0 && (
            <span className="comment-count">{localComments.length}</span>
          )}
          Comment
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="feed-comments-section">
          {localComments.length > 0 && (
            <div className="feed-comments-list">
              {localComments.map((c, idx) => (
                <div key={c.id || idx} className={`feed-comment ${c.authorType}`}>
                  <span className="feed-comment-author">
                    {c.authorType === 'coach' ? 'You' : workout.clientName}
                  </span>
                  <span className="feed-comment-text">{c.comment}</span>
                  <span className="feed-comment-time">
                    {formatRelativeTime(c.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form className="feed-comment-input" onSubmit={handleComment}>
            <input
              type="text"
              placeholder="Write a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={loading}
              maxLength={500}
            />
            <button type="submit" disabled={!comment.trim() || loading}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Feed() {
  const { user, clientData } = useAuth();
  const navigate = useNavigate();

  // Get user's preferred weight unit (default to lbs)
  const weightUnit = clientData?.unit_preference === 'metric' ? 'kg' : 'lbs';
  const [meals, setMeals] = useState([]);
  const [workoutFeed, setWorkoutFeed] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterClient, setFilterClient] = useState('');
  const [filterMealType, setFilterMealType] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [clients, setClients] = useState([]);

  // AI Workout Insights
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSelectedClient, setAiSelectedClient] = useState('');

  // The coach ID is the user's ID
  const coachId = user?.id;

  // Fetch feed data
  const fetchFeed = useCallback(async (reset = false) => {
    console.log('Feed: fetchFeed called, reset=', reset, 'coachId=', coachId);

    if (!coachId) {
      console.log('Feed: No coachId, skipping fetch');
      // Still need to clear loading state even if we can't fetch
      setLoading(false);
      return;
    }

    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
      setError(null);
      setOffset(0); // Reset offset immediately when resetting
    } else {
      setLoadingMore(true);
    }

    try {
      await ensureFreshSession();

      let url = `/.netlify/functions/coach-activity-feed?coachId=${coachId}&limit=20&offset=${currentOffset}`;

      if (filterClient) url += `&clientId=${filterClient}`;
      if (filterMealType) url += `&mealType=${filterMealType}`;
      if (filterDate) url += `&date=${filterDate}`;

      console.log('Feed: Fetching from', url);
      const result = await apiGet(url);
      console.log('Feed: Got result, meals count:', result.meals?.length || 0);

      if (result.error) {
        throw new Error(result.error);
      }

      if (reset) {
        setMeals(result.meals || []);
      } else {
        setMeals(prev => [...prev, ...(result.meals || [])]);
      }

      setHasMore(result.hasMore || false);
      if (!reset) {
        setOffset(currentOffset + (result.meals?.length || 0));
      }

      // Extract unique clients for filter dropdown
      if (reset && result.clients) {
        const clientList = Object.entries(result.clients).map(([id, info]) => ({
          id,
          name: info.name
        }));
        setClients(clientList);
      }

      console.log('Feed: Fetch complete, hasMore=', result.hasMore);
    } catch (err) {
      console.error('Feed: Error fetching feed:', err);
      setError(err.message || 'Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [coachId, offset, filterClient, filterMealType, filterDate]);

  // Fetch workout feed data
  const fetchWorkoutFeed = useCallback(async (reset = false) => {
    if (!coachId) return;

    if (reset) {
      setLoading(true);
      setError(null);
    }

    try {
      await ensureFreshSession();

      let url = `/.netlify/functions/coach-workout-feed?coachId=${coachId}&limit=20`;
      if (filterClient) url += `&clientId=${filterClient}`;
      if (filterDate) url += `&date=${filterDate}`;

      const result = await apiGet(url);

      if (result.error) {
        throw new Error(result.error);
      }

      setWorkoutFeed(result.workouts || []);
    } catch (err) {
      console.error('Feed: Error fetching workout feed:', err);
      setError(err.message || 'Failed to load workout feed');
    } finally {
      setLoading(false);
    }
  }, [coachId, filterClient, filterDate]);

  // Fetch all data based on active tab
  const fetchAll = useCallback(async (reset = true) => {
    if (activeTab === 'meals') {
      await fetchFeed(reset);
    } else if (activeTab === 'workouts') {
      await fetchWorkoutFeed(reset);
    } else {
      // 'all' tab - fetch both in parallel
      await Promise.all([fetchFeed(reset), fetchWorkoutFeed(reset)]);
    }
  }, [activeTab, fetchFeed, fetchWorkoutFeed]);

  // Initial fetch
  useEffect(() => {
    console.log('Feed: useEffect triggered, calling fetchAll');
    fetchAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, filterClient, filterMealType, filterDate, activeTab]);

  // Pull to refresh
  const { isRefreshing, pullDistance, containerProps, threshold } = usePullToRefresh(() => fetchAll(true));

  // Load more
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchFeed(false);
    }
  };

  // Apply filters
  const handleApplyFilters = () => {
    setOffset(0);
    setShowFilters(false);
    fetchFeed(true);
  };

  // Clear filters
  const handleClearFilters = () => {
    setFilterClient('');
    setFilterMealType('');
    setFilterDate('');
    setOffset(0);
    setShowFilters(false);
  };

  // AI Workout Insights handler
  const askWorkoutAI = useCallback(async (question) => {
    const targetClientId = aiSelectedClient || filterClient;
    if (!targetClientId || !question?.trim()) return;

    const client = clients.find(c => String(c.id) === String(targetClientId));
    setAiLoading(true);
    setAiResponse('');

    try {
      const res = await apiPost('/.netlify/functions/coach-workout-ai', {
        clientId: targetClientId,
        question: question.trim(),
        clientName: client?.name || 'Client'
      });
      if (res?.response) {
        setAiResponse(res.response);
      } else {
        setAiResponse('Unable to generate insights. Please try again.');
      }
    } catch (err) {
      console.error('AI workout insights error:', err);
      setAiResponse('Error fetching insights. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }, [aiSelectedClient, filterClient, clients]);

  // Build merged feed for "all" tab, sorted chronologically
  const getMergedFeed = () => {
    const mealItems = meals.map(m => ({
      type: 'meal',
      data: m,
      key: `meal-${m.mealKey}`,
      date: new Date(m.latestCreatedAt)
    }));
    const workoutItems = workoutFeed.map(w => ({
      type: 'workout',
      data: w,
      key: `workout-${w.id || w.workoutId}`,
      date: new Date(w.completedAt || w.date)
    }));
    return [...mealItems, ...workoutItems].sort((a, b) => b.date - a.date);
  };

  if (loading && meals.length === 0 && workoutFeed.length === 0) {
    return (
      <div className="feed-page">
        <div className="feed-loading">
          <RefreshCw className="spin" size={24} />
          <span>Loading activity feed...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-page" {...containerProps}>
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={threshold}
      />

      {/* Header */}
      <div className="feed-header">
        <h1>Client Activity Feed</h1>
        <button
          className={`feed-filter-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={20} />
        </button>
      </div>

      {/* Tab buttons */}
      <div className="feed-tabs">
        <button
          className={`feed-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All
        </button>
        <button
          className={`feed-tab ${activeTab === 'meals' ? 'active' : ''}`}
          onClick={() => setActiveTab('meals')}
        >
          Meals
        </button>
        <button
          className={`feed-tab ${activeTab === 'workouts' ? 'active' : ''}`}
          onClick={() => setActiveTab('workouts')}
        >
          Workouts
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="feed-filters">
          <div className="feed-filter-row">
            <label>Client</label>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
            >
              <option value="">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="feed-filter-row">
            <label>Meal Type</label>
            <select
              value={filterMealType}
              onChange={(e) => setFilterMealType(e.target.value)}
            >
              <option value="">All Meals</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <div className="feed-filter-row">
            <label>Date</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          <div className="feed-filter-actions">
            <button className="feed-filter-clear" onClick={handleClearFilters}>
              Clear
            </button>
            <button className="feed-filter-apply" onClick={handleApplyFilters}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* AI Workout Insights Panel */}
      {(activeTab === 'workouts' || activeTab === 'all') && (
        <div className="ai-workout-insights-section">
          <button
            className={`ai-insights-toggle ${showAiInsights ? 'active' : ''}`}
            onClick={() => setShowAiInsights(!showAiInsights)}
          >
            <div className="ai-insights-toggle-left">
              <Zap size={16} />
              <span>AI Workout Insights</span>
            </div>
            {showAiInsights ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAiInsights && (
            <div className="ai-insights-panel">
              <div className="ai-insights-client-select">
                <label>Select Client</label>
                <select
                  value={aiSelectedClient}
                  onChange={(e) => { setAiSelectedClient(e.target.value); setAiResponse(''); }}
                >
                  <option value="">Choose a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {(aiSelectedClient || filterClient) && (
                <>
                  <div className="ai-quick-questions">
                    <button
                      className="ai-quick-btn"
                      onClick={() => askWorkoutAI('How is this client progressing overall? Any PRs, plateaus, or concerns?')}
                      disabled={aiLoading}
                    >
                      Overall Progress
                    </button>
                    <button
                      className="ai-quick-btn"
                      onClick={() => askWorkoutAI('Where is this client plateauing and what changes would you recommend?')}
                      disabled={aiLoading}
                    >
                      Plateaus
                    </button>
                    <button
                      className="ai-quick-btn"
                      onClick={() => askWorkoutAI('Did this client leave any notes? What are they saying about their training?')}
                      disabled={aiLoading}
                    >
                      Client Notes
                    </button>
                    <button
                      className="ai-quick-btn"
                      onClick={() => askWorkoutAI('Is this client training consistently? How is their workout frequency and volume trending?')}
                      disabled={aiLoading}
                    >
                      Consistency
                    </button>
                  </div>

                  <div className="ai-custom-question">
                    <textarea
                      placeholder="Ask anything about this client's training..."
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      rows={2}
                      maxLength={300}
                    />
                    <button
                      className="ai-ask-btn"
                      onClick={() => { askWorkoutAI(aiQuestion); setAiQuestion(''); }}
                      disabled={aiLoading || !aiQuestion.trim()}
                    >
                      {aiLoading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </>
              )}

              {aiLoading && (
                <div className="ai-insights-loading">
                  <Loader2 size={20} className="spin" />
                  <span>Analyzing workout data...</span>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <div className="ai-insights-response">
                  <div className="ai-response-header">
                    <Zap size={14} />
                    <span>AI Insights</span>
                  </div>
                  <p className="ai-response-text">{aiResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feed entries */}
      {error ? (
        <div className="feed-error">
          <p>Error loading feed: {error}</p>
          <button onClick={() => fetchAll(true)}>Try Again</button>
        </div>
      ) : activeTab === 'meals' && meals.length === 0 ? (
        <div className="feed-empty">
          <Calendar size={48} />
          <h3>No meal activity yet</h3>
          <p>When your clients log their meals, they'll appear here.</p>
        </div>
      ) : activeTab === 'workouts' && workoutFeed.length === 0 ? (
        <div className="feed-empty">
          <Dumbbell size={48} />
          <h3>No workout activity yet</h3>
          <p>When your clients complete workouts, they'll appear here.</p>
        </div>
      ) : activeTab === 'all' && meals.length === 0 && workoutFeed.length === 0 ? (
        <div className="feed-empty">
          <Calendar size={48} />
          <h3>No activity yet</h3>
          <p>When your clients log meals or complete workouts, they'll appear here.</p>
        </div>
      ) : (
        <div className="feed-entries">
          {activeTab === 'meals' && meals.map(meal => (
            <MealCard
              key={meal.mealKey}
              meal={meal}
              coachId={coachId}
              onUpdate={() => fetchAll(true)}
            />
          ))}

          {activeTab === 'workouts' && workoutFeed.map(workout => (
            <WorkoutFeedCard
              key={workout.id || workout.workoutId}
              workout={workout}
              coachId={coachId}
              onUpdate={() => fetchAll(true)}
              weightUnit={weightUnit}
            />
          ))}

          {activeTab === 'all' && getMergedFeed().map(item => (
            item.type === 'meal' ? (
              <MealCard
                key={item.key}
                meal={item.data}
                coachId={coachId}
                onUpdate={() => fetchAll(true)}
              />
            ) : (
              <WorkoutFeedCard
                key={item.key}
                workout={item.data}
                coachId={coachId}
                onUpdate={() => fetchAll(true)}
                weightUnit={weightUnit}
              />
            )
          ))}

          {hasMore && activeTab !== 'workouts' && (
            <button
              className="feed-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="spin" size={18} />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Feed;
