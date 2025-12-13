import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';
import StoryViewer from './StoryViewer';

function TopNav() {
  const { clientData } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [coachData, setCoachData] = useState(null);
  const [hasStories, setHasStories] = useState(false);
  const [stories, setStories] = useState([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);

  // Load coach data and stories
  useEffect(() => {
    if (!clientData?.id || !clientData?.coach_id) return;

    // Check cache first
    const cached = sessionStorage.getItem(`coach_nav_${clientData.id}`);
    if (cached) {
      const data = JSON.parse(cached);
      setCoachData(data.coach);
      setHasStories(data.hasStories);
      if (data.stories) setStories(data.stories);
      return;
    }

    apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`)
      .then(data => {
        if (data) {
          const coach = {
            name: data.coachName,
            avatar: data.coachAvatar
          };
          const storyList = data.stories || [];
          const hasStoriesFlag = data.hasUnseenStories || storyList.length > 0;
          setCoachData(coach);
          setHasStories(hasStoriesFlag);
          setStories(storyList);
          sessionStorage.setItem(`coach_nav_${clientData.id}`, JSON.stringify({
            coach,
            hasStories: hasStoriesFlag,
            stories: storyList
          }));
        }
      })
      .catch(err => console.error('Error loading coach:', err));
  }, [clientData?.id, clientData?.coach_id]);

  const handleStoryClick = () => {
    if (hasStories && stories.length > 0) {
      setShowStoryViewer(true);
    }
  };

  const handleCloseStoryViewer = () => {
    setShowStoryViewer(false);
    // Clear cache to refresh stories on next load
    sessionStorage.removeItem(`coach_nav_${clientData?.id}`);
  };

  return (
    <nav className="top-nav">
      {/* Left: Coach Story (only shows if there are stories) */}
      <div className="nav-left">
        {hasStories && coachData?.avatar && (
          <div
            className="nav-coach-story"
            onClick={handleStoryClick}
            role="button"
            tabIndex={0}
            aria-label="View coach stories"
            onKeyDown={(e) => e.key === 'Enter' && handleStoryClick()}
          >
            <div className="story-ring unseen">
              <img src={coachData.avatar} alt={`Coach ${coachData.name}'s profile photo`} />
            </div>
          </div>
        )}
      </div>

      {/* Center: Logo */}
      <Link to="/" className="nav-center" aria-label="Go to home">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(7).svg"
          alt="Zique Fitness"
          className="nav-logo-centered"
        />
      </Link>

      {/* Right: Notifications */}
      <div className="nav-right">
        <div className="notification-wrapper">
          <button
            className="nav-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="View notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={20} aria-hidden="true" />
          </button>
          {showNotifications && (
            <div className="notification-dropdown show" role="menu" aria-label="Notifications">
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-500)' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Story Viewer Modal */}
      {showStoryViewer && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          coachName={coachData?.name}
          coachAvatar={coachData?.avatar}
          clientId={clientData?.id}
          onClose={handleCloseStoryViewer}
        />
      )}
    </nav>
  );
}

export default TopNav;
