import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding, DEFAULT_TUTORIAL_VIDEO_URL } from '../context/BrandingContext';
import { useLanguage } from '../context/LanguageContext';
import { Moon, Camera, Lock, LogOut, ChevronRight, Loader, Users, Scale, User, Utensils, Edit3, X, Palette, Droplets, CreditCard, PlayCircle, Download, Trash2, Globe } from 'lucide-react';
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

// Hide the client "Billing & Subscription" menu item everywhere for now.
// Flip this to true to bring it back (the /my-billing page itself is untouched).
const SHOW_CLIENT_BILLING = false;

function Settings() {
  const { clientData, theme, toggleTheme, logout, refreshClientData } = useAuth();
  const { branding, isModuleVisible } = useBranding();
  const { showError, showSuccess } = useToast();
  const { t, language, setLanguage, supportedLanguages } = useLanguage();
  const isCoach = clientData?.is_coach === true;
  // Gym (workout-only) members have the diary module off. For them we drop the
  // "coach"/"Nutrition Coach" wording and hide all the food & nutrition fields,
  // since a plain gym app has nothing to do with nutrition.
  const isGymMember = !isCoach && !isModuleVisible('diary');

  // Coach-controlled app tutorial video: built-in default, the coach's own
  // upload, or nothing — depending on their Branding Settings.
  const tutorialVideoUrl = branding?.use_default_tutorial_video
    ? DEFAULT_TUTORIAL_VIDEO_URL
    : (branding?.custom_tutorial_video_url || null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);

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
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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

  // Water intake preference states
  const [waterGoal, setWaterGoal] = useState(clientData?.water_goal || 8);
  const [waterGoalInput, setWaterGoalInput] = useState(String(clientData?.water_goal || 8));
  const [waterUnit, setWaterUnit] = useState(clientData?.water_unit || 'glasses');
  const [waterGoalLoading, setWaterGoalLoading] = useState(false);
  const [waterUnitLoading, setWaterUnitLoading] = useState(false);

  // Profile edit states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({});

  const openProfileModal = () => {
    let exerciseTypesArr = [];
    const raw = clientData?.exercise_types;
    if (Array.isArray(raw)) {
      exerciseTypesArr = raw;
    } else if (typeof raw === 'string' && raw) {
      try { const p = JSON.parse(raw); if (Array.isArray(p)) exerciseTypesArr = p; } catch (e) { /* ignore */ }
    }
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
      budget: clientData?.budget || '',
      macroPreference: clientData?.macro_preference || '',
      fitnessLevel: clientData?.fitness_level || '',
      exerciseFrequency: clientData?.exercise_frequency || '',
      workoutDuration: clientData?.workout_duration || '',
      equipmentAccess: clientData?.equipment_access || '',
      exerciseTypes: exerciseTypesArr,
      healthConcerns: clientData?.health_concerns || '',
      fitnessGoalDetails: clientData?.fitness_goal_details || ''
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
        budget: profileForm.budget || null,
        macroPreference: profileForm.macroPreference || null,
        fitnessLevel: profileForm.fitnessLevel || null,
        exerciseFrequency: profileForm.exerciseFrequency || null,
        workoutDuration: profileForm.workoutDuration || null,
        equipmentAccess: profileForm.equipmentAccess || null,
        exerciseTypes: Array.isArray(profileForm.exerciseTypes) ? profileForm.exerciseTypes : [],
        healthConcerns: profileForm.healthConcerns || null,
        fitnessGoalDetails: profileForm.fitnessGoalDetails || null
      });

      if (response.success) {
        await refreshClientData();
        setShowProfileModal(false);
      } else {
        throw new Error(response.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      showError(t('settings.profileSaveFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const activityLevelLabels = {
    '1.2': t('settings.activity.sedentary'),
    '1.375': t('settings.activity.lightlyActive'),
    '1.55': t('settings.activity.moderatelyActive'),
    '1.725': t('settings.activity.veryActive'),
    '1.9': t('settings.activity.extraActive')
  };

  const getActivityLabel = (val) => {
    if (!val) return t('common.notSet');
    const num = parseFloat(val);
    if (Number.isNaN(num)) return `${val}`;
    const key = String(num);
    if (activityLevelLabels[key]) return activityLevelLabels[key];
    // Snap to nearest known level so values like 1.73 resolve to "Very Active"
    const known = Object.keys(activityLevelLabels).map(parseFloat);
    const nearest = known.reduce((a, b) => Math.abs(b - num) < Math.abs(a - num) ? b : a);
    return activityLevelLabels[String(nearest)];
  };

  // Scroll position is managed centrally by Layout (per-path restoration).

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

  // Sync water preferences when clientData loads
  useEffect(() => {
    if (clientData?.water_goal) {
      setWaterGoal(clientData.water_goal);
      setWaterGoalInput(String(clientData.water_goal));
    }
    if (clientData?.water_unit) setWaterUnit(clientData.water_unit);
  }, [clientData?.water_goal, clientData?.water_unit]);

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
      showError(t('settings.photoWaitProfile'));
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
        showSuccess(t('settings.photoUpdated'));
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      showError(err.message || t('settings.photoFailed'));
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
      showError(t('settings.pwNoEmail'));
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
        text: t('settings.pwSent', { email: clientData.email })
      });
    } catch (err) {
      console.error('Password reset error:', err);
      setPasswordMessage({
        type: 'error',
        text: err.message || t('settings.pwFailed')
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle logout with confirmation
  const handleLogout = async () => {
    if (window.confirm(t('settings.logoutConfirm'))) {
      await logout();
    }
  };

  // Request a copy of all my data (GDPR export). The endpoint derives
  // identity from the auth token only and emails a short-lived link.
  const handleExportData = async () => {
    if (exportingData) return;
    setExportingData(true);
    try {
      const res = await apiPost('/.netlify/functions/export-my-data', {});
      showSuccess(res?.message || t('settings.exportSent'));
    } catch (err) {
      if (err?.status === 429) {
        showError(err.message || t('settings.exportRateLimited'));
      } else {
        showError(t('settings.exportFailed'));
      }
    } finally {
      setExportingData(false);
    }
  };

  // Request account deletion (GDPR). Soft-delete + 30-day grace; the
  // server revokes the session, so we log out locally afterwards.
  // Open the delete confirmation modal (requires typing DELETE).
  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  // Actually request deletion — only callable from the modal once the
  // user has typed DELETE. Soft-delete + 30-day grace; the server revokes
  // the session, so we log out locally afterwards.
  const confirmDeleteAccount = async () => {
    if (deletingAccount || deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const res = await apiPost('/.netlify/functions/request-account-deletion', {});
      setShowDeleteModal(false);
      showSuccess(res?.message || t('settings.deleteScheduled'));
      setTimeout(() => { logout(); }, 2500);
    } catch (err) {
      if (err?.status === 409) {
        showError(err.message || t('settings.deleteCannotYet'));
      } else {
        showError(t('settings.deleteFailed'));
      }
    } finally {
      setDeletingAccount(false);
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
      showError(t('settings.prefUpdateFailed'));
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
      showError(t('settings.prefUpdateFailed'));
    } finally {
      setUnitPrefLoading(false);
    }
  };

  // Handle water goal change (on blur from number input)
  const handleWaterGoalSave = async (value) => {
    const parsed = parseInt(value, 10);
    if (!clientData?.id || waterGoalLoading || isNaN(parsed) || parsed < 1 || parsed > 200) return;
    if (parsed === waterGoal) return; // No change

    setWaterGoalLoading(true);
    const previousGoal = waterGoal;
    setWaterGoal(parsed);

    try {
      const response = await apiPost('/.netlify/functions/client-workout-preferences', {
        clientId: clientData.id,
        waterGoal: parsed
      });
      if (response.success) {
        await refreshClientData();
      } else {
        throw new Error(response.error || 'Failed to update water goal');
      }
    } catch (err) {
      console.error('Error updating water goal:', err);
      setWaterGoal(previousGoal);
      setWaterGoalInput(String(previousGoal));
      showError(t('settings.waterGoalUpdateFailed'));
    } finally {
      setWaterGoalLoading(false);
    }
  };

  // Handle water unit change (from dropdown)
  const handleWaterUnitChange = async (newUnit) => {
    if (!clientData?.id || waterUnitLoading) return;

    setWaterUnitLoading(true);
    const previousUnit = waterUnit;
    setWaterUnit(newUnit);

    try {
      const response = await apiPost('/.netlify/functions/client-workout-preferences', {
        clientId: clientData.id,
        waterUnit: newUnit
      });
      if (response.success) {
        await refreshClientData();
      } else {
        throw new Error(response.error || 'Failed to update water unit');
      }
    } catch (err) {
      console.error('Error updating water unit:', err);
      setWaterUnit(previousUnit);
      showError(t('settings.waterUnitUpdateFailed'));
    } finally {
      setWaterUnitLoading(false);
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
        <h1 className="profile-header-name">{clientData?.client_name || t('settings.defaultUser')}</h1>
        <p className="profile-header-email">{clientData?.email || ''}</p>
      </div>

      {/* My Coach Section */}
      {clientData?.coach_id && (
        <div className="settings-card">
          <div className="settings-card-title">{isGymMember ? t('settings.myGym') : t('settings.myCoach')}</div>
          <div className="settings-item coach-item">
            <div className="coach-info">
              {coachData?.profile_photo_url ? (
                <img
                  src={coachData.profile_photo_url}
                  alt={coachData.coach_name}
                  className="coach-avatar-img"
                />
              ) : (
                <div className="coach-avatar">
                  {getCoachInitial(coachData?.coach_name)}
                </div>
              )}
              <div className="coach-details">
                <div className="coach-name">{coachData?.coach_name || t('common.loading')}</div>
                {!isGymMember && <div className="coach-label">{t('settings.nutritionCoach')}</div>}
              </div>
            </div>
            <Link to="/messages" className="coach-message-btn" aria-label={isGymMember ? t('settings.messageYourGym') : t('settings.messageYourCoach')}>
              {t('settings.message')}
            </Link>
          </div>
        </div>
      )}

      {/* My Profile Section */}
      <div className="settings-card">
        <div className="settings-card-title-row">
          <div className="settings-card-title">{t('settings.myProfile')}</div>
          <button
            type="button"
            onClick={openProfileModal}
            className="settings-inline-action"
            aria-label={t('settings.editProfileAria')}
          >
            <Edit3 size={14} /> {t('common.edit')}
          </button>
        </div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <User size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.physicalStats')}</div>
              <div className="settings-item-subtitle">
                {[
                  clientData?.age ? `${clientData.age}yo` : null,
                  clientData?.gender ? clientData.gender.charAt(0).toUpperCase() + clientData.gender.slice(1) : null,
                  clientData?.weight ? `${clientData.weight} ${unitPref === 'metric' ? 'kg' : 'lbs'}` : null,
                  (clientData?.height_ft || clientData?.height_in) ? `${clientData.height_ft || 0}'${clientData.height_in || 0}"` : null,
                ].filter(Boolean).join(' / ') || t('common.notSet')}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-divider"></div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Utensils size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.activityLevel')}</div>
              <div className="settings-item-subtitle">{getActivityLabel(clientData?.activity_level)}</div>
            </div>
          </div>
        </div>

        {!isGymMember && (<>
        <div className="settings-divider"></div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Utensils size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.dietFoodPreferences')}</div>
              <div className="settings-item-subtitle">
                {[
                  clientData?.diet_type ? clientData.diet_type.charAt(0).toUpperCase() + clientData.diet_type.slice(1) : null,
                  clientData?.meal_count ? t('settings.mealsPerDayShort', { count: clientData.meal_count }) : null,
                ].filter(Boolean).join(' / ') || t('common.notSet')}
              </div>
            </div>
          </div>
        </div>

        {clientData?.allergies && (
          <>
            <div className="settings-divider"></div>
            <div className="settings-item">
              <div className="settings-item-left">
                <div className="settings-item-text" style={{ marginLeft: '52px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{t('settings.allergies')}</div>
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
                <div className="settings-item-text" style={{ marginLeft: '52px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{t('settings.dislikedFoods')}</div>
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
                <div className="settings-item-text" style={{ marginLeft: '52px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{t('settings.preferredFoods')}</div>
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
                <div className="settings-item-text" style={{ marginLeft: '52px' }}>
                  <div className="settings-item-title" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{t('settings.proteinPowder')}</div>
                  <div className="settings-item-subtitle">
                    {[
                      clientData.protein_powder_brand,
                      clientData.protein_powder_calories ? `${clientData.protein_powder_calories}cal` : null,
                      clientData.protein_powder_protein ? `${clientData.protein_powder_protein}g protein` : null,
                    ].filter(Boolean).join(' / ') || t('common.yes')}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        </>)}
      </div>

      {/* Preferences Section */}
      <div className="settings-card">
        <div className="settings-card-title">{t('settings.preferences')}</div>
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Moon size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.darkMode')}</div>
              <div className="settings-item-subtitle">{t('settings.darkModeSub')}</div>
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

        {/* Language Preference */}
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Globe size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.languageRow')}</div>
              <div className="settings-item-subtitle">{t('settings.languageRowSub')}</div>
            </div>
          </div>
          <div className="gender-select-wrapper">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="gender-select"
              aria-label={t('settings.languageRow')}
            >
              {supportedLanguages.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-divider"></div>

        {/* Exercise Demonstration Gender Preference — hidden for gym (workout-only) members */}
        {!isGymMember && (<>
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Users size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.exerciseDemos')}</div>
              <div className="settings-item-subtitle">{t('settings.exerciseDemosSub')}</div>
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
                <option value="all">{t('settings.optAll')}</option>
                <option value="male">{t('settings.optMale')}</option>
                <option value="female">{t('settings.optFemale')}</option>
              </select>
            )}
          </div>
        </div>

        <div className="settings-divider"></div>
        </>)}

        {/* Weight Unit Preference */}
        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Scale size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.weightUnit')}</div>
              <div className="settings-item-subtitle">{t('settings.weightUnitSub')}</div>
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

        {/* Water Intake Goal — hidden for gym (workout-only) members */}
        {!isGymMember && (<>
        <div className="settings-divider"></div>

        <div className="settings-item">
          <div className="settings-item-left">
            <div className="settings-icon-box water">
              <Droplets size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.waterGoal')}</div>
              <div className="settings-item-subtitle">{t('settings.waterGoalSub')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {waterGoalLoading ? (
              <Loader size={20} className="spin" style={{ color: 'var(--gray-400)' }} />
            ) : (
              <input
                type="number"
                min="1"
                max="200"
                value={waterGoalInput}
                onChange={(e) => setWaterGoalInput(e.target.value)}
                onBlur={(e) => handleWaterGoalSave(e.target.value)}
                className="gender-select"
                style={{ width: '60px', textAlign: 'center' }}
                disabled={waterGoalLoading}
              />
            )}
            {waterUnitLoading ? (
              <Loader size={20} className="spin" style={{ color: 'var(--gray-400)' }} />
            ) : (
              <select
                value={waterUnit}
                onChange={(e) => handleWaterUnitChange(e.target.value)}
                className="gender-select"
                disabled={waterUnitLoading}
              >
                <option value="glasses">{t('settings.waterGlasses')}</option>
                <option value="oz">{t('settings.waterOz')}</option>
                <option value="ml">{t('settings.waterMl')}</option>
                <option value="L">{t('settings.waterLiters')}</option>
              </select>
            )}
          </div>
        </div>
        </>)}
      </div>

      {/* Branding Section - Coach Only */}
      {isCoach && (
        <div className="settings-card">
          <div className="settings-card-title">{t('settings.coachTools')}</div>
          <Link to="/branding" className="settings-item clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="settings-item-left">
              <div className="settings-icon-box brand">
                <Palette size={18} />
              </div>
              <div className="settings-item-text">
                <div className="settings-item-title">{t('settings.brandingSettings')}</div>
                <div className="settings-item-subtitle">{t('settings.brandingSettingsSub')}</div>
              </div>
            </div>
            <ChevronRight size={20} className="settings-chevron" />
          </Link>

          <div className="settings-divider"></div>

          <Link to="/billing" className="settings-item clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="settings-item-left">
              <div className="settings-icon-box brand">
                <CreditCard size={18} />
              </div>
              <div className="settings-item-text">
                <div className="settings-item-title">{t('settings.clientBilling')}</div>
                <div className="settings-item-subtitle">{t('settings.clientBillingSub')}</div>
              </div>
            </div>
            <ChevronRight size={20} className="settings-chevron" />
          </Link>
        </div>
      )}

      {/* Client Billing - Non-coach users (hidden for gym-only members) */}
      {SHOW_CLIENT_BILLING && !isCoach && !isGymMember && (
        <div className="settings-card">
          <div className="settings-card-title">{t('settings.billing')}</div>
          <Link to="/my-billing" className="settings-item clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="settings-item-left">
              <div className="settings-icon-box brand">
                <CreditCard size={18} />
              </div>
              <div className="settings-item-text">
                <div className="settings-item-title">{t('settings.billingSubscription')}</div>
                <div className="settings-item-subtitle">{t('settings.billingSubscriptionSub')}</div>
              </div>
            </div>
            <ChevronRight size={20} className="settings-chevron" />
          </Link>
        </div>
      )}

      {/* Help & Support Section */}
      {tutorialVideoUrl && (
        <div className="settings-card">
          <div className="settings-card-title">{t('settings.helpSupport')}</div>
          <div className="settings-item clickable" onClick={() => setShowTutorialModal(true)}>
            <div className="settings-item-left">
              <div className="settings-icon-box neutral">
                <PlayCircle size={18} />
              </div>
              <div className="settings-item-text">
                <div className="settings-item-title">{t('settings.appTutorial')}</div>
                <div className="settings-item-subtitle">{t('settings.appTutorialSub')}</div>
              </div>
            </div>
            <ChevronRight size={20} className="settings-chevron" />
          </div>
        </div>
      )}

      {/* Account Section */}
      <div className="settings-card">
        <div className="settings-card-title">{t('settings.account')}</div>
        <div className="settings-item clickable" onClick={() => setShowPasswordModal(true)}>
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Lock size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.changePassword')}</div>
              <div className="settings-item-subtitle">{t('settings.changePasswordSub')}</div>
            </div>
          </div>
          <ChevronRight size={20} className="settings-chevron" />
        </div>

        <div className="settings-divider"></div>

        <div
          className="settings-item clickable"
          onClick={handleExportData}
          style={exportingData ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          <div className="settings-item-left">
            <div className="settings-icon-box neutral">
              <Download size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.exportData')}</div>
              <div className="settings-item-subtitle">
                {t('settings.exportDataSub')}
              </div>
            </div>
          </div>
          {exportingData
            ? <Loader size={20} className="settings-chevron spin" />
            : <ChevronRight size={20} className="settings-chevron" />}
        </div>

        <div className="settings-divider"></div>

        <div
          className="settings-item clickable"
          onClick={handleDeleteAccount}
          style={deletingAccount ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          <div className="settings-item-left">
            <div className="settings-icon-box danger">
              <Trash2 size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title">{t('settings.deleteAccount')}</div>
              <div className="settings-item-subtitle">
                {t('settings.deleteAccountSub')}
              </div>
            </div>
          </div>
          {deletingAccount
            ? <Loader size={20} className="settings-chevron spin" />
            : <ChevronRight size={20} className="settings-chevron" />}
        </div>

        <div className="settings-divider"></div>

        <div className="settings-item clickable logout-item" onClick={handleLogout}>
          <div className="settings-item-left">
            <div className="settings-icon-box danger">
              <LogOut size={18} />
            </div>
            <div className="settings-item-text">
              <div className="settings-item-title logout-text">{t('settings.logOut')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Version Footer */}
      <div className="settings-version">
        {t('settings.version', { brand: branding?.brand_name || 'Ziquecoach' })}
      </div>


      {/* App Tutorial Modal */}
      {showTutorialModal && tutorialVideoUrl && (
        <div className="modal-overlay active" onClick={() => setShowTutorialModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowTutorialModal(false)}><X size={20} /></button>
              <span style={{ fontWeight: 600 }}>{t('settings.appTutorial')}</span>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <video
                src={tutorialVideoUrl}
                controls
                playsInline
                preload="metadata"
                style={{ width: '100%', borderRadius: 12, background: '#000' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="modal-overlay active" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>{t('settings.changePassword')}</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--gray-600)' }}>
                {t('settings.pwSendLinkIntro')}
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
                  background: passwordLoading ? '#94a3b8' : 'var(--brand-primary, #2cb5a5)',
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
                {passwordLoading ? t('settings.pwSending') : t('settings.pwSend')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal — requires typing DELETE */}
      {showDeleteModal && (
        <div className="modal-overlay active" onClick={() => !deletingAccount && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
            <div className="modal-header">
              <button className="modal-close" onClick={() => !deletingAccount && setShowDeleteModal(false)}>&times;</button>
              <span style={{ fontWeight: 600 }}>{t('settings.deleteAccount')}</span>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ marginBottom: '12px', color: 'var(--gray-700, #374151)' }}>
                {t('settings.deleteIntro')}
              </p>
              <p style={{ marginBottom: '8px', color: 'var(--gray-700, #374151)' }}>
                {t('settings.deleteTypeToConfirm')}
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('settings.deleteConfirmPlaceholder')}
                disabled={deletingAccount}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--gray-300, #d1d5db)',
                  fontSize: '1rem',
                  marginBottom: '20px',
                  boxSizing: 'border-box'
                }}
              />
              <button
                onClick={confirmDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  background: (deleteConfirmText !== 'DELETE' || deletingAccount) ? '#94a3b8' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: (deleteConfirmText !== 'DELETE' || deletingAccount) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {deletingAccount && <Loader size={18} className="spin" />}
                {deletingAccount ? t('settings.deleting') : t('settings.deleteConfirmBtn')}
              </button>
              <button
                onClick={() => !deletingAccount && setShowDeleteModal(false)}
                disabled={deletingAccount}
                style={{
                  width: '100%',
                  padding: '12px',
                  marginTop: '10px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: 'var(--gray-600, #4b5563)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: deletingAccount ? 'not-allowed' : 'pointer'
                }}
              >
                {t('common.cancel')}
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
              <span style={{ fontWeight: 600 }}>{t('settings.editProfile')}</span>
            </div>
            <div className="modal-body" style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {/* Physical Stats */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>{t('settings.physicalStats')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.age')}</span>
                    <input type="number" value={profileForm.age} onChange={e => setProfileForm(f => ({ ...f, age: e.target.value }))} style={inputStyle} placeholder={t('settings.agePlaceholder')} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.gender')}</span>
                    <select value={profileForm.gender} onChange={e => setProfileForm(f => ({ ...f, gender: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="male">{t('settings.optMale')}</option>
                      <option value="female">{t('settings.optFemale')}</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.weightWithUnit', { unit: unitPref === 'metric' ? 'kg' : 'lbs' })}</span>
                    <input type="number" step="0.1" value={profileForm.weight} onChange={e => setProfileForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} placeholder={t('settings.weightPlaceholder')} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.height')}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input type="number" value={profileForm.heightFt} onChange={e => setProfileForm(f => ({ ...f, heightFt: e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder={t('settings.heightFt')} />
                      <input type="number" value={profileForm.heightIn} onChange={e => setProfileForm(f => ({ ...f, heightIn: e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder={t('settings.heightIn')} />
                    </div>
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.activityLevel')}</span>
                  <select value={profileForm.activityLevel} onChange={e => setProfileForm(f => ({ ...f, activityLevel: e.target.value }))} style={inputStyle}>
                    <option value="">{t('common.select')}</option>
                    <option value="1.2">{t('settings.activity.sedentary')}</option>
                    <option value="1.375">{t('settings.activity.lightlyActive')}</option>
                    <option value="1.55">{t('settings.activity.moderatelyActive')}</option>
                    <option value="1.725">{t('settings.activity.veryActive')}</option>
                    <option value="1.9">{t('settings.activity.extraActive')}</option>
                  </select>
                </label>
              </div>

              {/* Fitness & Workout Preferences */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>{t('settings.fitnessWorkout')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.fitnessLevel')}</span>
                    <select value={profileForm.fitnessLevel} onChange={e => setProfileForm(f => ({ ...f, fitnessLevel: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="beginner">{t('settings.fitnessLevelBeginner')}</option>
                      <option value="some_experience">{t('settings.fitnessLevelSome')}</option>
                      <option value="intermediate">{t('settings.fitnessLevelIntermediate')}</option>
                      <option value="advanced">{t('settings.fitnessLevelAdvanced')}</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.exerciseFrequency')}</span>
                    <select value={profileForm.exerciseFrequency} onChange={e => setProfileForm(f => ({ ...f, exerciseFrequency: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="none">{t('settings.freqNone')}</option>
                      <option value="1-2">{t('settings.freq12')}</option>
                      <option value="3-4">{t('settings.freq34')}</option>
                      <option value="5+">{t('settings.freq5')}</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.workoutDuration')}</span>
                    <select value={profileForm.workoutDuration} onChange={e => setProfileForm(f => ({ ...f, workoutDuration: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="15-30">{t('settings.dur1530')}</option>
                      <option value="30-45">{t('settings.dur3045')}</option>
                      <option value="45-60">{t('settings.dur4560')}</option>
                      <option value="60+">{t('settings.dur60')}</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.equipmentAccess')}</span>
                    <select value={profileForm.equipmentAccess} onChange={e => setProfileForm(f => ({ ...f, equipmentAccess: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="full_gym">{t('settings.equipFullGym')}</option>
                      <option value="home_gym">{t('settings.equipHomeGym')}</option>
                      <option value="minimal">{t('settings.equipMinimal')}</option>
                      <option value="bodyweight">{t('settings.equipBodyweight')}</option>
                    </select>
                  </label>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.exerciseTypesEnjoy')}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                    {[
                      { v: 'weight_training', l: t('settings.typeWeightTraining') },
                      { v: 'cardio', l: t('settings.typeCardio') },
                      { v: 'hiit', l: t('settings.typeHiit') },
                      { v: 'yoga_pilates', l: t('settings.typeYoga') },
                      { v: 'group_classes', l: t('settings.typeGroup') },
                      { v: 'sports', l: t('settings.typeSports') },
                      { v: 'walking_hiking', l: t('settings.typeWalking') },
                      { v: 'swimming', l: t('settings.typeSwimming') }
                    ].map(opt => {
                      const checked = Array.isArray(profileForm.exerciseTypes) && profileForm.exerciseTypes.includes(opt.v);
                      return (
                        <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--gray-700)' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              setProfileForm(f => {
                                const current = Array.isArray(f.exerciseTypes) ? f.exerciseTypes : [];
                                const next = e.target.checked ? [...current, opt.v] : current.filter(v => v !== opt.v);
                                return { ...f, exerciseTypes: next };
                              });
                            }}
                          />
                          <span>{opt.l}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.healthConcerns')}</span>
                  <textarea
                    value={profileForm.healthConcerns}
                    onChange={e => setProfileForm(f => ({ ...f, healthConcerns: e.target.value }))}
                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder={t('settings.healthConcernsPlaceholder')}
                  />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.fitnessGoals')}</span>
                  <textarea
                    value={profileForm.fitnessGoalDetails}
                    onChange={e => setProfileForm(f => ({ ...f, fitnessGoalDetails: e.target.value }))}
                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder={t('settings.fitnessGoalsPlaceholder')}
                  />
                </label>
              </div>

              {/* Diet Preferences — hidden for gym (workout-only) members */}
              {!isGymMember && (<>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>{t('settings.dietFoodPreferences')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.dietType')}</span>
                    <select value={profileForm.dietType} onChange={e => setProfileForm(f => ({ ...f, dietType: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="omnivore">{t('settings.dietOmnivore')}</option>
                      <option value="vegetarian">{t('settings.dietVegetarian')}</option>
                      <option value="vegan">{t('settings.dietVegan')}</option>
                      <option value="keto">{t('settings.dietKeto')}</option>
                      <option value="paleo">{t('settings.dietPaleo')}</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>{t('settings.mealsPerDay')}</span>
                    <select value={profileForm.mealCount} onChange={e => setProfileForm(f => ({ ...f, mealCount: e.target.value }))} style={inputStyle}>
                      <option value="">{t('common.select')}</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                    </select>
                  </label>
                </div>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.macroPreference')}</span>
                  <select value={profileForm.macroPreference} onChange={e => setProfileForm(f => ({ ...f, macroPreference: e.target.value }))} style={inputStyle}>
                    <option value="">{t('settings.macroBalancedDefault')}</option>
                    <option value="balanced">{t('settings.macroBalanced')}</option>
                    <option value="high_protein">{t('settings.macroHighProtein')}</option>
                    <option value="low_carb">{t('settings.macroLowCarb')}</option>
                    <option value="high_carb">{t('settings.macroHighCarb')}</option>
                    <option value="low_fat">{t('settings.macroLowFat')}</option>
                  </select>
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.allergies')}</span>
                  <input type="text" value={profileForm.allergies} onChange={e => setProfileForm(f => ({ ...f, allergies: e.target.value }))} style={inputStyle} placeholder={t('settings.allergiesPlaceholder')} />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.dislikedFoods')}</span>
                  <input type="text" value={profileForm.dislikedFoods} onChange={e => setProfileForm(f => ({ ...f, dislikedFoods: e.target.value }))} style={inputStyle} placeholder={t('settings.dislikedFoodsPlaceholder')} />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.preferredFoods')}</span>
                  <input type="text" value={profileForm.preferredFoods} onChange={e => setProfileForm(f => ({ ...f, preferredFoods: e.target.value }))} style={inputStyle} placeholder={t('settings.preferredFoodsPlaceholder')} />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.cookingEquipment')}</span>
                  <input type="text" value={profileForm.cookingEquipment} onChange={e => setProfileForm(f => ({ ...f, cookingEquipment: e.target.value }))} style={inputStyle} placeholder={t('settings.cookingEquipmentPlaceholder')} />
                </label>
                <label style={{ ...labelStyle, marginTop: '12px' }}>
                  <span style={labelTextStyle}>{t('settings.budget')}</span>
                  <select value={profileForm.budget} onChange={e => setProfileForm(f => ({ ...f, budget: e.target.value }))} style={inputStyle}>
                    <option value="">{t('common.select')}</option>
                    <option value="budget">{t('settings.budgetFriendly')}</option>
                    <option value="moderate">{t('settings.budgetModerate')}</option>
                    <option value="premium">{t('settings.budgetPremium')}</option>
                  </select>
                </label>
              </div>

              {/* Protein Powder */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '12px', textTransform: 'uppercase' }}>{t('settings.proteinPowder')}</div>
                <label style={{ ...labelStyle, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" checked={profileForm.useProteinPowder} onChange={e => setProfileForm(f => ({ ...f, useProteinPowder: e.target.checked }))} />
                  <span style={{ fontSize: '0.9rem', color: 'var(--gray-700)' }}>{t('settings.iUseProteinPowder')}</span>
                </label>
                {profileForm.useProteinPowder && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>{t('settings.brand')}</span>
                      <input type="text" value={profileForm.proteinPowderBrand} onChange={e => setProfileForm(f => ({ ...f, proteinPowderBrand: e.target.value }))} style={inputStyle} placeholder={t('settings.brandPlaceholder')} />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>{t('settings.calories')}</span>
                        <input type="number" value={profileForm.proteinPowderCalories} onChange={e => setProfileForm(f => ({ ...f, proteinPowderCalories: e.target.value }))} style={inputStyle} placeholder="120" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>{t('settings.proteinG')}</span>
                        <input type="number" value={profileForm.proteinPowderProtein} onChange={e => setProfileForm(f => ({ ...f, proteinPowderProtein: e.target.value }))} style={inputStyle} placeholder="24" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>{t('settings.carbsG')}</span>
                        <input type="number" value={profileForm.proteinPowderCarbs} onChange={e => setProfileForm(f => ({ ...f, proteinPowderCarbs: e.target.value }))} style={inputStyle} placeholder="3" />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>{t('settings.fatG')}</span>
                        <input type="number" value={profileForm.proteinPowderFat} onChange={e => setProfileForm(f => ({ ...f, proteinPowderFat: e.target.value }))} style={inputStyle} placeholder="1" />
                      </label>
                    </div>
                  </div>
                )}
              </div>
              </>)}

              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  background: profileSaving ? '#94a3b8' : 'var(--brand-primary, #2cb5a5)',
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
                {profileSaving ? t('common.saving') : t('common.saveChanges')}
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
