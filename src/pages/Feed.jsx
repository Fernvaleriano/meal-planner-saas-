import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, Sun, Moon, Apple, Filter, ChevronDown, User, Calendar, RefreshCw, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete, ensureFreshSession } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Available reaction emojis
const REACTIONS = ['👏', '💪', '🔥', '⭐', '❤️'];

// Meal type icons
const getMealIcon = (mealType) => {
  switch (mealType) {
    case 'breakfast': return <Sunrise size={16} className="meal-icon breakfast" />;
    case 'lunch': return <Sun size={16} className="meal-icon lunch" />;
    case 'dinner': return <Moon size={16} className="meal-icon dinner" />;
    case 'snack': return <Apple size={16} className="meal-icon snack" />;
    default: return null;
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

// Feed entry card component
function FeedEntryCard({ entry, coachId, onUpdate }) {
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [localReaction, setLocalReaction] = useState(entry.reaction?.reaction || null);
  const [localComments, setLocalComments] = useState(entry.comments || []);

  const handleReaction = async (reaction) => {
    if (loading) return;
    setLoading(true);

    try {
      if (localReaction === reaction) {
        // Remove reaction
        await apiDelete('/.netlify/functions/react-to-diary-entry', {
          entryId: entry.id,
          coachId
        });
        setLocalReaction(null);
      } else {
        // Add/update reaction
        await apiPost('/.netlify/functions/react-to-diary-entry', {
          entryId: entry.id,
          coachId,
          clientId: entry.clientId,
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
    if (!comment.trim() || loading) return;

    setLoading(true);
    try {
      const result = await apiPost('/.netlify/functions/comment-on-diary-entry', {
        entryId: entry.id,
        clientId: entry.clientId,
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
    <div className="feed-entry-card">
      {/* Header with client info */}
      <div className="feed-entry-header">
        <div className="feed-client-info">
          {entry.clientPhoto ? (
            <img src={entry.clientPhoto} alt="" className="feed-client-avatar" />
          ) : (
            <div className="feed-client-avatar-placeholder">
              <User size={20} />
            </div>
          )}
          <div className="feed-client-details">
            <span className="feed-client-name">{entry.clientName}</span>
            <span className="feed-entry-time">
              {getMealIcon(entry.mealType)}
              {entry.mealType} • {formatRelativeTime(entry.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Food entry details */}
      <div className="feed-entry-content">
        <div className="feed-food-name">{entry.foodName}</div>
        {entry.brand && <div className="feed-food-brand">{entry.brand}</div>}
        <div className="feed-food-macros">
          <span className="macro calories">{entry.calories} cal</span>
          <span className="macro protein">{Math.round(entry.protein || 0)}g P</span>
          <span className="macro carbs">{Math.round(entry.carbs || 0)}g C</span>
          <span className="macro fat">{Math.round(entry.fat || 0)}g F</span>
        </div>
        {entry.numberOfServings && entry.numberOfServings !== 1 && (
          <div className="feed-serving-info">
            {entry.numberOfServings} servings
          </div>
        )}
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
                    {c.authorType === 'coach' ? 'You' : entry.clientName}
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
  const [entries, setEntries] = useState([]);
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
    if (!coachId) return;

    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      await ensureFreshSession();

      let url = `/.netlify/functions/coach-activity-feed?coachId=${coachId}&limit=20&offset=${currentOffset}`;

      if (filterClient) url += `&clientId=${filterClient}`;
      if (filterMealType) url += `&mealType=${filterMealType}`;
      if (filterDate) url += `&date=${filterDate}`;

      const result = await apiGet(url);

      if (reset) {
        setEntries(result.entries || []);
      } else {
        setEntries(prev => [...prev, ...(result.entries || [])]);
      }

      setHasMore(result.hasMore || false);
      setOffset(currentOffset + (result.entries?.length || 0));

      // Extract unique clients for filter dropdown
      if (reset && result.clients) {
        const clientList = Object.entries(result.clients).map(([id, info]) => ({
          id,
          name: info.name
        }));
        setClients(clientList);
      }
    } catch (err) {
      console.error('Error fetching feed:', err);
      setError(err.message);
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

  if (loading && entries.length === 0) {
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
        <h1>Client Activity</h1>
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
      ) : entries.length === 0 ? (
        <div className="feed-empty">
          <Calendar size={48} />
          <h3>No activity yet</h3>
          <p>When your clients log their meals, they'll appear here.</p>
        </div>
      ) : (
        <div className="feed-entries">
          {entries.map(entry => (
            <FeedEntryCard
              key={entry.id}
              entry={entry}
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
