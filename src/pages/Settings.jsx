import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { Moon, Camera, Lock, LogOut, ChevronRight, Loader, Users, Scale, User, Utensils, Edit3, X, Palette } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { supabase } from '../utils/supabase';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

import { useToast } from '../components/Toast';
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
  const { branding } = useBranding();
  const { showError, showSuccess } = useToast();
  const isCoach = clientData?.is_coach === true;

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

  // Exercise gender preference states
  const [exerciseGenderPref, setExerciseGenderPref] = useState(
    clientData?.preferred_exercise_gender || 'all'
  );
  const [exerciseGenderLoading, setExerciseGenderLoading] = useState(false);

  // Weight unit preference states
  const [unitPref, setUnitPref] = useState(
    clientData?.unit_preference || 'imperial'
  );
  const [unitPrefLoading, setUnitPrefLoading] = useState(false);

  // Profile edit states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({});

  const openProfileModal = () => {
    setProfileForm({
      age: clientData?.age || '',
      gender: clientData?.gender || '',
      weight: clientData?.weight || '',
      heightFt: clientData?.height_ft || '',
      heightIn: clientData?.height_in || '',
      activityLevel: clientData?.activity_level || '',
      dietType: clientData?.diet_type || '',
      allergies: clientData?.allergies || '',
      dislikedFoods: clientData?.disliked_foods || '',
      preferredFoods: clientData?.preferred_foods || '',
      mealCount: clientData?.meal_count || '',
      cookingEquipment: Array.isArray(clientData?.cooking_equipment) ? clientData.cooking_equipment.join(', ') : (clientData?.cooking_equipment || ''),
      useProteinPowder: clientData?.use_protein_powder || false,
      proteinPowderBrand: clientData?.protein_powder_brand || '',
      proteinPowderCalories: clientData?.protein_powder_calories || '',
      proteinPowderProtein: clientData?.protein_powder_protein || '',
      proteinPowderCarbs: clientData?.protein_powder_carbs || '',
      proteinPowderFat: clientData?.protein_powder_fat || '',
      budget: clientData?.budget || ''
    });
    setShowProfileModal(true);
  };

  const handleProfileSave = async () => {
    if (!clientData?.id) return;
    setProfileSaving(true);
    try {
      const equipmentArray = profileForm.cookingEquipment
        ? profileForm.cookingEquipment.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const response = await apiPut('/.netlify/functions/update-client-profile', {
        clientId: clientData.id,
        age: profileForm.age ? parseInt(profileForm.age) : null,
        gender: profileForm.gender || null,
        weight: profileForm.weight ? parseFloat(profileForm.weight) : null,
        heightFt: profileForm.heightFt ? parseInt(profileForm.heightFt) : null,
        heightIn: profileForm.heightIn ? parseInt(profileForm.heightIn) : null,
        activityLevel: profileForm.activityLevel ? parseFloat(profileForm.activityLevel) : null,
        dietType: profileForm.dietType || null,
        allergies: profileForm.allergies || null,
        dislikedFoods: profileForm.dislikedFoods || null,
        preferredFoods: profileForm.preferredFoods || null,
        mealCount: profileForm.mealCount ? parseInt(profileForm.mealCount) : null,
        cookingEquipment: equipmentArray,
        useProteinPowder: profileForm.useProteinPowder,
        proteinPowderBrand: profileForm.proteinPowderBrand || null,
        proteinPowderCalories: profileForm.proteinPowderCalories ? parseInt(profileForm.proteinPowderCalories) : null,
        proteinPowderProtein: profileForm.proteinPowderProtein ? parseInt(profileForm.proteinPowderProtein) : null,
        proteinPowderCarbs: profileForm.proteinPowderCarbs ? parseInt(profileForm.proteinPowderCarbs) : null,
        proteinPowderFat: profileForm.proteinPowderFat ? parseInt(profileForm.proteinPowderFat) : null,
        budget: profileForm.budget || null
      });

      if (response.success) {
        await refreshClientData();
        setShowProfileModal(false);
      } else {
        throw new Error(response.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      showError('Failed to save profile. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const activityLevelLabels = {
    '1.2': 'Sedentary',
    '1.375': 'Lightly Active',
    '1.55': 'Moderately Active',
    '1.725': 'Very Active',
    '1.9': 'Extra Active'
  };

  const getActivityLabel = (val) => {
    if (!val) return 'Not set';
    const key = String(parseFloat(val));
    return activityLevelLabels[key] || `${val}`;
  };

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(refreshClientData);

  // Sync exercise gender preference when clientData loads
  useEffect(() => {
    if (clientData?.preferred_exercise_gender) {
      setExerciseGenderPref(clientData.preferred_exercise_gender);
    }
  }, [clientData?.preferred_exercise_gender]);

  // Sync unit preference when clientData loads
  useEffect(() => {
    if (clientData?.unit_preference) {
      setUnitPref(clientData.unit_preference);
    }
  }, [clientData?.unit_preference]);

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
    return new Promise((resolve, reject) => {
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
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Handle profile photo selection
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!clientData?.id) {
      showError('Please wait for your profile to load');
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
        showSuccess('Profile photo updated!');
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      showError(err.message || 'Failed to upload photo. Please try again.');
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
      showError('No email address found for your account');
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clientData.email, {
        redirectTo: `${window.location.origin}/set-password.html`
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

  // Handle exercise gender preference change
  const handleExerciseGenderChange = async (newValue) => {
    if (!clientData?.id || exerciseGenderLoading) return;

    setExerciseGenderLoading(true);
    const previousValue = exerciseGenderPref;
    setExerciseGenderPref(newValue); // Optimistic update

    try {
      const response = await apiPost('/.netlify/functions/client-workout-preferences', {
        clientId: clientData.id,
        preferredExerciseGender: newValue
      });

      if (response.success) {
        // Refresh client data to update the context
        await refreshClientData();
      } else {
        throw new Error(response.error || 'Failed to update preference');
      }
    } catch (err) {
      console.error('Error updating exercise gender preference:', err);
      setExerciseGenderPref(previousValue); // Revert on error
      showError('Failed to update preference. Please try again.');
    } finally {
      setExerciseGenderLoading(false);
    }
  };

  // Handle weight unit preference change
  const handleUnitPrefChange = async (newValue) => {
    if (!clientData?.id || unitPrefLoading) return;

    setUnitPrefLoading(true);
    const previousValue = unitPref;
    setUnitPref(newValue); // Optimistic update

    try {
      const response = await apiPost('/.netlify/functions/client-workout-preferences', {
        clientId: clientData.id,
        unitPreference: newValue
      });

      if (response.success) {
        // Refresh client data to update the context
        await refreshClientData();
      } else {
        throw new Error(response.error || 'Failed to update preference');
      }
    } catch (err) {
      console.error('Error updating weight unit preference:', err);
      setUnitPref(previousValue); // Revert on error
      showError('Failed to update preference. Please try again.');
    } finally {
      setUnitPrefLoading(false);
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

      {/* My Profile Section */}
      <div className="settings-card">
        <div className="settings-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          MY PROFILE
          <button
            onClick={openProfileModal}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--teal-500, #0d9488)', fontSize: '0.75rem', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '4px', padding: 0
            }}
          >
            <Edit3 size={14} /> Edit
          </button>
        </div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box blue">
              <User size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Physical Stats</div>
              <div className="settings-item-subtitle">
                {[
                  clientData?.age ? `${clientData.age}yo` : null,
                  clientData?.gender ? clientData.gender.charAt(0).toUpperCase() + clientData.gender.slice(1) : null,
                  clientData?.weight ? `${clientData.weight} ${unitPref === 'metric' ? 'kg' : 'lbs'}` : null,
                  (clientData?.height_ft || clientData?.height_in) ? `${clientData.height_ft || 0}'${clientData.height_in || 0}"` : null,
                ].filter(Boolean).join(' / ') || 'Not set'}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-divider"></div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box green">
              <Utensils size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Activity Level</div>
              <div className="settings-item-subtitle">{getActivityLabel(clientData?.activity_level)}</div>
            </div>
          </div>
        </div>

        <div className="settings-divider"></div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box orange">
              <Utensils size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Diet & Food Preferences</div>
              <div className="settings-item-subtitle">
                {[
                  clientData?.diet_type ? clientData.diet_type.charAt(0).toUpperCase() + clientData.diet_type.slice(1) : null,
                  clientData?.meal_count ? `${clientData.meal_count} meals/day` : null,
                ].filter(Boolean).join(' / ') || 'Not set'}
              </div>
            </div>
          </div>
        </div>

        {clientData?.allergies && (
          <>
            <div className="settings-divider"></div>
            <div className="settings-item">
              <div className="settings-item-left">
                <div className="settings-item-text" style={{ marginLeft: '44px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Allergies</div>
                  <div className="settings-item-subtitle">{clientData.allergies}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {clientData?.disliked_foods && (
          <>
            <div className="settings-divider"></div>
            <div className="settings-item">
              <div className="settings-item-left">
                <div className="settings-item-text" style={{ marginLeft: '44px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Disliked Foods</div>
                  <div className="settings-item-subtitle">{clientData.disliked_foods}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {clientData?.preferred_foods && (
          <>
            <div className="settings-divider"></div>
            <div className="settings-item">
              <div className="settings-item-left">
                <div className="settings-item-text" style={{ marginLeft: '44px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Preferred Foods</div>
                  <div className="settings-item-subtitle">{clientData.preferred_foods}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {clientData?.use_protein_powder && (
          <>
            <div className="settings-divider"></div>
            <div className="settings-item">
              <div className="settings-item-left">
                <div className="settings-item-text" style={{ marginLeft: '44px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Protein Powder</div>
                  <div className="settings-item-subtitle">
                    {[
                      clientData.protein_powder_brand,
                      clientData.protein_powder_calories ? `${clientData.protein_powder_calories}cal` : null,
                      clientData.protein_powder_protein ? `${clientData.protein_powder_protein}g protein` : null,
                    ].filter(Boolean).join(' / ') || 'Yes'}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
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

        <div className="settings-divider"></div>

        {/* Exercise Demonstration Gender Preference */}
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box blue">
              <Users size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Exercise Demos</div>
              <div className="settings-item-subtitle">Choose demonstration style</div>
            </div>
          </div>
          <div className="gender-select-wrapper">
            {exerciseGenderLoading ? (
              <Loader size={20} className="spin" style={{ color: 'var(--gray-400)' }} />
            ) : (
              <select
                value={exerciseGenderPref}
                onChange={(e) => handleExerciseGenderChange(e.target.value)}
                className="gender-select"
                disabled={exerciseGenderLoading}
              >
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            )}
          </div>
        </div>

        <div className="settings-divider"></div>

        {/* Weight Unit Preference */}
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box green">
              <Scale size={20} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">Weight Unit</div>
              <div className="settings-item-subtitle">Kilograms or pounds</div>
            </div>
          </div>
          <div className="gender-select-wrapper">
            {unitPrefLoading ? (
              <Loader size={20} className="spin" style={{ color: 'var(--gray-400)' }} />
            ) : (
              <select
                value={unitPref}
                onChange={(e) => handleUnitPrefChange(e.target.value)}
                className="gender-select"
                disabled={unitPrefLoading}
              >
                <option value="metric">kg</option>
                <option value="imperial">lbs</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Branding Section - Coach Only */}
      {isCoach && (
        <div className="settings-card">
          <div className="settings-card-title">COACH TOOLS</div>
          <Link to="/branding" className="settings-item clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="settings-item-left">
              <div className="settings-icon-box purple">
                <Palette size={20} />
              </div>
              <div className="settings-item-text">
                <div className="settings-item-title">Branding Settings</div>
                <div className="settings-item-subtitle">Colors, fonts, modules, terminology</div>
              </div>
            </div>
            <ChevronRight size={20} className="settings-chevron" />
          </Link>
        </div>
      )}

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
        {branding?.brand_name || 'Zique Fitness Nutrition'} v1.0
      </div>


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

      {/* Edit Profile Modal */}
      {showProfileModal && (
        <div className="modal-overlay active" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowProfileModal(false)}><X size={20} /></button>
              <span style={{ fontWeight: 600 }}>Edit Profile</span>
            </div>
            <div className="modal-body" style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {/* Physical Stats */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>Physical Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Age</span>
                    <input type="number" value={profileForm.age} onChange={e => setProfileForm(f => ({ ...f, age: e.target.value }))} style={inputStyle} placeholder="e.g. 30" />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Gender</span>
                    <select value={profileForm.gender} onChange={e => setProfileForm(f => ({ ...f, gender: e.target.value }))} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Weight ({unitPref === 'metric' ? 'kg' : 'lbs'})</span>
                    <input type="number" step="0.1" value={profileForm.weight} onChange={e => setProfileForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} placeholder="e.g. 185" />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Height</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input type="number" value={profileForm.heightFt} onChange={e => setProfileForm(f => ({ ...f, heightFt: e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder="ft" />
                      <input type="number" value={profileForm.heightIn} onChange={e => setProfileForm(f => ({ ...f, heightIn: e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder="in" />
                    </div>
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Activity Level</span>
                  <select value={profileForm.activityLevel} onChange={e => setProfileForm(f => ({ ...f, activityLevel: e.target.value }))} style={inputStyle}>
                    <option value="">Select</option>
                    <option value="1.2">Sedentary</option>
                    <option value="1.375">Lightly Active</option>
                    <option value="1.55">Moderately Active</option>
                    <option value="1.725">Very Active</option>
                    <option value="1.9">Extra Active</option>
                  </select>
                </label>
              </div>

              {/* Diet Preferences */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>Diet & Food Preferences</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Diet Type</span>
                    <select value={profileForm.dietType} onChange={e => setProfileForm(f => ({ ...f, dietType: e.target.value }))} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="omnivore">Omnivore</option>
                      <option value="vegetarian">Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="keto">Keto</option>
                      <option value="paleo">Paleo</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Meals Per Day</span>
                    <select value={profileForm.mealCount} onChange={e => setProfileForm(f => ({ ...f, mealCount: e.target.value }))} style={inputStyle}>
                      <option value="">Select</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                    </select>
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Allergies</span>
                  <input type="text" value={profileForm.allergies} onChange={e => setProfileForm(f => ({ ...f, allergies: e.target.value }))} style={inputStyle} placeholder="e.g. Shellfish, Peanuts" />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Disliked Foods</span>
                  <input type="text" value={profileForm.dislikedFoods} onChange={e => setProfileForm(f => ({ ...f, dislikedFoods: e.target.value }))} style={inputStyle} placeholder="e.g. Mushrooms, Olives" />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Preferred Foods</span>
                  <input type="text" value={profileForm.preferredFoods} onChange={e => setProfileForm(f => ({ ...f, preferredFoods: e.target.value }))} style={inputStyle} placeholder="e.g. Chicken, Rice, Broccoli" />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Cooking Equipment</span>
                  <input type="text" value={profileForm.cookingEquipment} onChange={e => setProfileForm(f => ({ ...f, cookingEquipment: e.target.value }))} style={inputStyle} placeholder="e.g. Oven, Air Fryer, Stovetop" />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>Budget</span>
                  <select value={profileForm.budget} onChange={e => setProfileForm(f => ({ ...f, budget: e.target.value }))} style={inputStyle}>
                    <option value="">Select</option>
                    <option value="budget">Budget-Friendly</option>
                    <option value="moderate">Moderate</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
              </div>

              {/* Protein Powder */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>Protein Powder</div>
                <label style={{ ...labelStyle, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" checked={profileForm.useProteinPowder} onChange={e => setProfileForm(f => ({ ...f, useProteinPowder: e.target.checked }))} />
                  <span style={{ fontSize: '0.9rem', color: 'var(--gray-700)' }}>I use protein powder</span>
                </label>
                {profileForm.useProteinPowder && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Brand</span>
                      <input type="text" value={profileForm.proteinPowderBrand} onChange={e => setProfileForm(f => ({ ...f, proteinPowderBrand: e.target.value }))} style={inputStyle} placeholder="e.g. Optimum Nutrition" />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Calories</span>
                        <input type="number" value={profileForm.proteinPowderCalories} onChange={e => setProfileForm(f => ({ ...f, proteinPowderCalories: e.target.value }))} style={inputStyle} placeholder="120" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Protein (g)</span>
                        <input type="number" value={profileForm.proteinPowderProtein} onChange={e => setProfileForm(f => ({ ...f, proteinPowderProtein: e.target.value }))} style={inputStyle} placeholder="24" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Carbs (g)</span>
                        <input type="number" value={profileForm.proteinPowderCarbs} onChange={e => setProfileForm(f => ({ ...f, proteinPowderCarbs: e.target.value }))} style={inputStyle} placeholder="3" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Fat (g)</span>
                        <input type="number" value={profileForm.proteinPowderFat} onChange={e => setProfileForm(f => ({ ...f, proteinPowderFat: e.target.value }))} style={inputStyle} placeholder="1" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  background: profileSaving ? '#94a3b8' : '#0d9488',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: profileSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {profileSaving && <Loader size={18} className="spin" />}
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };
const labelTextStyle = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--gray-500)' };
const inputStyle = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--gray-200, #e2e8f0)',
  fontSize: '0.9rem',
  backgroundColor: 'var(--gray-50, #f8fafc)',
  color: 'var(--gray-800, #1e293b)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box'
};

export default Settings;
