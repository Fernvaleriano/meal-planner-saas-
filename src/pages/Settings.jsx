import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Moon, Camera, Lock, LogOut, ChevronRight, Loader, Dumbbell } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import { supabase } from '../utils/supabase';

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
  const { clientData, theme, toggleTheme, logout, refreshClientData } = useAuth();

  // Load from cache for instant display
  const cachedCoach = clientData?.coach_id ? getCache(`coach_branding_${clientData.coach_id}`) : null;
  const [coachData, setCoachData] = useState(cachedCoach);

  // Profile photo states
  const fileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Password reset states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  // Compress image before upload
  const compressImage = (file, maxWidth = 400, quality = 0.8) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down if needed
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxWidth) {
            width = (width * maxWidth) / height;
            height = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle profile photo selection
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!clientData?.id) {
      alert('Please wait for your profile to load');
      return;
    }

    setUploadingPhoto(true);

    try {
      // Compress the image
      const compressedData = await compressImage(file);

      // Upload to server
      const response = await apiPost('/.netlify/functions/upload-profile-photo', {
        userId: clientData.id,
        userType: 'client',
        photoData: compressedData
      });

      if (response.success && response.photoUrl) {
        // Refresh client data to get updated photo
        await refreshClientData();
        alert('Profile photo updated!');
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Trigger file input click
  const handlePhotoClick = () => {
    if (!uploadingPhoto) {
      fileInputRef.current?.click();
    }
  };

  // Handle password reset
  const handlePasswordReset = async () => {
    if (!clientData?.email) {
      alert('No email address found for your account');
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clientData.email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        throw error;
      }

      setPasswordMessage({
        type: 'success',
        text: `Password reset email sent to ${clientData.email}. Check your inbox!`
      });
    } catch (err) {
      console.error('Password reset error:', err);
      setPasswordMessage({
        type: 'error',
        text: err.message || 'Failed to send reset email. Please try again.'
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle logout with confirmation
  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
    }
  };

  return (
    <div className="settings-page">
      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        onChange={handlePhotoSelect}
        style={{ display: 'none' }}
      />

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-wrapper" onClick={handlePhotoClick}>
          {uploadingPhoto ? (
            <div className="profile-header-avatar uploading">
              <Loader size={24} className="spin" />
            </div>
          ) : clientData?.profile_photo_url ? (
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
          <div className="profile-avatar-edit">
            <Camera size={14} />
          </div>
        </div>
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
        <div className="settings-item clickable" onClick={handlePhotoClick}>
          <div className="settings-item-left">
            <div className="settings-icon-box teal">
              {uploadingPhoto ? <Loader size={20} className="spin" /> : <Camera size={20} />}
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Profile Photo</div>
              <div className="settings-item-subtitle">
                {uploadingPhoto ? 'Uploading...' : 'Change your profile photo'}
              </div>
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
        <div className="settings-item clickable" onClick={() => setShowPasswordModal(true)}>
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

        <div className="settings-item clickable logout-item" onClick={handleLogout}>
          <div className="settings-item-left">
            <div className="settings-icon-box logout">
              <LogOut size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title logout-text">Log Out</div>
            </div>
          </div>
        </div>
      </div>

      {/* Version Footer */}
      <div className="settings-version">
        Zique Fitness Nutrition v1.0
      </div>

      {/* Hidden Workouts Link (Beta) */}
      <Link
        to="/workouts"
        className="hidden-workouts-link"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '12px',
          marginTop: '8px',
          marginBottom: '20px',
          color: 'var(--gray-400)',
          fontSize: '12px',
          textDecoration: 'none',
          opacity: 0.5
        }}
      >
        <Dumbbell size={14} />
        <span>Workouts (Beta)</span>
      </Link>

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="modal-overlay active" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>Change Password</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--gray-600)' }}>
                We'll send a password reset link to your email address:
              </p>
              <p style={{ marginBottom: '20px', fontWeight: 600, color: 'var(--gray-800)' }}>
                {clientData?.email}
              </p>

              {passwordMessage && (
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  backgroundColor: passwordMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
                  color: passwordMessage.type === 'success' ? '#065f46' : '#991b1b'
                }}>
                  {passwordMessage.text}
                </div>
              )}

              <button
                onClick={handlePasswordReset}
                disabled={passwordLoading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  background: passwordLoading ? '#94a3b8' : '#0d9488',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: passwordLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {passwordLoading && <Loader size={18} className="spin" />}
                {passwordLoading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
