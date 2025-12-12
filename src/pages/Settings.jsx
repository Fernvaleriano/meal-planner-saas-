import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Moon, Camera, Lock, LogOut, ChevronRight } from 'lucide-react';
import { apiGet } from '../utils/api';

// localStorage cache helpers
const getCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* ignore */ }
  return null;
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) { /* ignore */ }
};

function Settings() {
  const { clientData, theme, toggleTheme, logout } = useAuth();

  // Load from cache for instant display
  const cachedCoach = clientData?.coach_id ? getCache(`coach_branding_${clientData.coach_id}`) : null;
  const [coachData, setCoachData] = useState(cachedCoach);

  // Load coach data with caching
  useEffect(() => {
    if (!clientData?.coach_id) return;

    apiGet(`/.netlify/functions/get-coach-branding?coachId=${clientData.coach_id}`)
      .then(data => {
        setCoachData(data);
        setCache(`coach_branding_${clientData.coach_id}`, data);
      })
      .catch(err => console.error('Error loading coach data:', err));
  }, [clientData?.coach_id]);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getCoachInitial = (name) => {
    if (!name) return '🏋️';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="settings-page">
      {/* Profile Header */}
      <div className="profile-header">
        {clientData?.profile_photo_url ? (
          <img
            src={clientData.profile_photo_url}
            alt={clientData.client_name}
            className="profile-header-avatar-img"
          />
        ) : (
          <div className="profile-header-avatar">
            {getInitials(clientData?.client_name)}
          </div>
        )}
        <h1 className="profile-header-name">{clientData?.client_name || 'User'}</h1>
        <p className="profile-header-email">{clientData?.email || ''}</p>
      </div>

      {/* My Coach Section */}
      <div className="settings-card">
        <div className="settings-card-title">MY COACH</div>
        <div className="settings-item coach-item">
          <div className="coach-info">
            {coachData?.brand_logo_url ? (
              <img
                src={coachData.brand_logo_url}
                alt={coachData.coach_name}
                className="coach-avatar-img"
              />
            ) : (
              <div className="coach-avatar">
                {getCoachInitial(coachData?.coach_name)}
              </div>
            )}
            <div className="coach-details">
              <div className="coach-name">{coachData?.coach_name || 'Loading...'}</div>
              <div className="coach-label">Nutrition Coach</div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="settings-card">
        <div className="settings-card-title">PROFILE</div>
        <div className="settings-item clickable">
          <div className="settings-item-left">
            <div className="settings-icon-box teal">
              <Camera size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Profile Photo</div>
              <div className="settings-item-subtitle">Change your profile photo</div>
            </div>
          </div>
          <ChevronRight size={20} className="settings-chevron" />
        </div>
      </div>

      {/* Preferences Section */}
      <div className="settings-card">
        <div className="settings-card-title">PREFERENCES</div>
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box purple">
              <Moon size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Dark Mode</div>
              <div className="settings-item-subtitle">Easier on the eyes at night</div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={`toggle-switch ${theme === 'dark' ? 'active' : ''}`}
            aria-label="Toggle dark mode"
          >
            <span className="toggle-knob"></span>
          </button>
        </div>
      </div>

      {/* Account Section */}
      <div className="settings-card">
        <div className="settings-card-title">ACCOUNT</div>
        <div className="settings-item clickable">
          <div className="settings-item-left">
            <div className="settings-icon-box orange">
              <Lock size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Change Password</div>
              <div className="settings-item-subtitle">Update your account password</div>
            </div>
          </div>
          <ChevronRight size={20} className="settings-chevron" />
        </div>

        <div className="settings-divider"></div>

        <button className="settings-item logout-item" onClick={logout}>
          <div className="settings-item-left">
            <div className="settings-icon-box logout">
              <LogOut size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title logout-text">Log Out</div>
            </div>
          </div>
        </button>
      </div>

      {/* Version Footer */}
      <div className="settings-version">
        Zique Fitness Nutrition v1.0
      </div>
    </div>
  );
}

export default Settings;
