import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, Sun, Moon, Apple, Filter, ChevronDown, ChevronUp, User, Calendar, RefreshCw, MessageCircle, Send } from 'lucide-react';
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

function Feed() {
  const { user, clientData } = useAuth();
  const navigate = useNavigate();
  const [meals, setMeals] = useState([]);
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

  // The coach ID is the user's ID
  const coachId = user?.id;

  // Fetch feed data
  const fetchFeed = useCallback(async (reset = false) => {
    if (!coachId) {
      console.log('Feed: No coachId, skipping fetch');
      return;
    }

    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
      setError(null);
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
      console.log('Feed: Got result', result);

      if (result.error) {
        throw new Error(result.error);
      }

      if (reset) {
        setMeals(result.meals || []);
      } else {
        setMeals(prev => [...prev, ...(result.meals || [])]);
      }

      setHasMore(result.hasMore || false);
      setOffset(currentOffset + (result.meals?.length || 0));

      // Extract unique clients for filter dropdown
      if (reset && result.clients) {
        const clientList = Object.entries(result.clients).map(([id, info]) => ({
          id,
          name: info.name
        }));
        setClients(clientList);
      }
    } catch (err) {
      console.error('Feed: Error fetching feed:', err);
      setError(err.message || 'Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [coachId, offset, filterClient, filterMealType, filterDate]);

  // Initial fetch
  useEffect(() => {
    fetchFeed(true);
  }, [coachId, filterClient, filterMealType, filterDate]);

  // Pull to refresh
  const { isRefreshing, pullDistance, containerProps, threshold } = usePullToRefresh(() => fetchFeed(true));

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

  if (loading && meals.length === 0) {
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

      {/* Feed entries */}
      {error ? (
        <div className="feed-error">
          <p>Error loading feed: {error}</p>
          <button onClick={() => fetchFeed(true)}>Try Again</button>
        </div>
      ) : meals.length === 0 ? (
        <div className="feed-empty">
          <Calendar size={48} />
          <h3>No activity yet</h3>
          <p>When your clients log their meals, they'll appear here.</p>
        </div>
      ) : (
        <div className="feed-entries">
          {meals.map(meal => (
            <MealCard
              key={meal.mealKey}
              meal={meal}
              coachId={coachId}
              onUpdate={() => fetchFeed(true)}
            />
          ))}

          {hasMore && (
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
