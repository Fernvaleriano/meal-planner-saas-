import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function TopNav() {
  const { clientData } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [coachData, setCoachData] = useState(null);

  // Load coach data
  useEffect(() => {
    if (!clientData?.id || !clientData?.coach_id) return;

    // Check cache first
    const cached = sessionStorage.getItem(`coach_nav_${clientData.id}`);
    if (cached) {
      setCoachData(JSON.parse(cached));
      return;
    }

    apiGet(`/.netlify/functions/get-coach-stories?clientId=${clientData.id}&coachId=${clientData.coach_id}`)
      .then(data => {
        if (data) {
          const coach = {
            name: data.coachName,
            avatar: data.coachAvatar
          };
          setCoachData(coach);
          sessionStorage.setItem(`coach_nav_${clientData.id}`, JSON.stringify(coach));
        }
      })
      .catch(err => console.error('Error loading coach:', err));
  }, [clientData?.id, clientData?.coach_id]);

  return (
    <nav className="top-nav">
      {/* Left: Coach Avatar */}
      <div className="nav-left">
        {coachData?.avatar ? (
          <Link to="/settings" className="nav-coach-avatar">
            <img src={coachData.avatar} alt={coachData.name || 'Coach'} />
          </Link>
        ) : (
          <div className="nav-coach-avatar placeholder">
            <span>{coachData?.name?.[0] || 'C'}</span>
          </div>
        )}
      </div>

      {/* Center: Logo */}
      <Link to="/" className="nav-center">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg"
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
            aria-label="Notifications"
          >
            <Bell size={20} />
          </button>
          {showNotifications && (
            <div className="notification-dropdown show">
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-500)' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
