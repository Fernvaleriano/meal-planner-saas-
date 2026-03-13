import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Ruler, Camera, X, Plus, Minus, ChevronDown, Trash2, Columns2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

// Get today's date in local timezone (NOT UTC)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Image compression utility
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
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

function Progress() {
  const navigate = useNavigate();
  const { clientData } = useAuth();

  // Get user's preferred weight unit (default to lbs)
  const weightUnit = clientData?.unit_preference === 'metric' ? 'kg' : 'lbs';

  const [activeTab, setActiveTab] = useState('measurements');
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loadingMeasurements, setLoadingMeasurements] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Measurement modal
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [measurementForm, setMeasurementForm] = useState({
    date: getLocalDateString(),
    weight: '',
    bodyFat: '',
    chest: '',
    waist: '',
    hips: '',
    leftArm: '',
    rightArm: '',
    leftThigh: '',
    rightThigh: '',
    notes: ''
  });
  const [savingMeasurement, setSavingMeasurement] = useState(false);

  // Photo modal
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoType, setPhotoType] = useState('progress');
  const [photoDate, setPhotoDate] = useState(getLocalDateString());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Pull-to-refresh: Refresh progress data
  const refreshProgressData = useCallback(async () => {
    if (!clientData?.id) return;

    try {
      const [measurementsData, photosData] = await Promise.all([
        apiGet(`/.netlify/functions/get-measurements?clientId=${clientData.id}&limit=20`).catch(() => null),
        apiGet(`/.netlify/functions/get-progress-photos?clientId=${clientData.id}`).catch(() => null)
      ]);

      if (measurementsData?.measurements) setMeasurements(measurementsData.measurements);
      if (photosData?.photos) setPhotos(photosData.photos);
    } catch (err) {
      console.error('Error refreshing progress data:', err);
    }
  }, [clientData?.id]);

  // Setup pull-to-refresh
  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshProgressData);

  useEffect(() => {
    if (clientData?.id) {
      loadMeasurements();
      loadPhotos();
    }
  }, [clientData?.id]);

  const loadMeasurements = async () => {
    setLoadingMeasurements(true);
    try {
      const data = await apiGet(`/.netlify/functions/get-measurements?clientId=${clientData.id}&limit=20`);
      setMeasurements(data?.measurements || []);
    } catch (err) {
      console.error('Error loading measurements:', err);
    } finally {
      setLoadingMeasurements(false);
    }
  };

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const data = await apiGet(`/.netlify/functions/get-progress-photos?clientId=${clientData.id}`);
      setPhotos(data?.photos || []);
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  // Stats calculations
  const currentWeight = measurements[0]?.weight || null;
  const firstWeight = measurements[measurements.length - 1]?.weight || null;
  const weightChange = currentWeight && firstWeight ? (currentWeight - firstWeight).toFixed(1) : null;

  // Measurement form handlers
  const handleMeasurementChange = (field, value) => {
    setMeasurementForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveMeasurement = async (e) => {
    e.preventDefault();

    // Validate required data
    if (!clientData?.id || !clientData?.coach_id) {
      alert('Session data missing. Please refresh the page and try again.');
      return;
    }

    setSavingMeasurement(true);
    try {
      await apiPost('/.netlify/functions/save-measurement', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        measuredDate: measurementForm.date,
        weight: parseFloat(measurementForm.weight) || null,
        bodyFatPercentage: parseFloat(measurementForm.bodyFat) || null,
        chest: parseFloat(measurementForm.chest) || null,
        waist: parseFloat(measurementForm.waist) || null,
        hips: parseFloat(measurementForm.hips) || null,
        leftArm: parseFloat(measurementForm.leftArm) || null,
        rightArm: parseFloat(measurementForm.rightArm) || null,
        leftThigh: parseFloat(measurementForm.leftThigh) || null,
        rightThigh: parseFloat(measurementForm.rightThigh) || null,
        notes: measurementForm.notes || null
      });

      alert('Measurement saved!');
      setShowMeasurementModal(false);
      setMeasurementForm({
        date: getLocalDateString(),
        weight: '', bodyFat: '', chest: '', waist: '', hips: '',
        leftArm: '', rightArm: '', leftThigh: '', rightThigh: '', notes: ''
      });
      loadMeasurements();
    } catch (err) {
      console.error('Error saving measurement:', err);
      alert(err.message || 'Error saving measurement. Please try again.');
    } finally {
      setSavingMeasurement(false);
    }
  };

  // Delete measurement handler
  const handleDeleteMeasurement = async (measurementId) => {
    if (!clientData?.id) return;

    try {
      await apiDelete(`/.netlify/functions/delete-measurement?measurementId=${measurementId}&clientId=${clientData.id}`);
      // Remove from local state immediately
      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
    } catch (err) {
      console.error('Error deleting measurement:', err);
      alert('Failed to delete measurement. Please try again.');
    }
  };

  // Measurement entry with visible delete button
  const MeasurementEntry = ({ measurement }) => {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = () => {
      const dateStr = new Date(measurement.measured_date).toLocaleDateString();
      if (window.confirm(`Delete measurement from ${dateStr}?`)) {
        setDeleting(true);
        handleDeleteMeasurement(measurement.id);
      }
    };

    return (
      <div className={`measurement-entry ${deleting ? 'deleting' : ''}`}>
        <div className="measurement-entry-header">
          <span className="measurement-date">
            {new Date(measurement.measured_date).toLocaleDateString()}
          </span>
          <div className="measurement-header-right">
            <span className="measurement-primary">
              {measurement.weight && <span>{measurement.weight} {weightUnit}</span>}
              {measurement.body_fat_percentage && <span> | {measurement.body_fat_percentage}% BF</span>}
            </span>
            <button className="measurement-trash-btn" onClick={handleDelete} disabled={deleting}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {(measurement.chest || measurement.waist || measurement.hips) && (
          <div className="measurement-secondary">
            {measurement.chest && <span>Chest: {measurement.chest}"</span>}
            {measurement.waist && <span>Waist: {measurement.waist}"</span>}
            {measurement.hips && <span>Hips: {measurement.hips}"</span>}
          </div>
        )}
      </div>
    );
  };

  // Delete photo handler
  const handleDeletePhoto = async (photoId) => {
    if (!clientData?.id || !clientData?.coach_id) return;

    try {
      await apiDelete(`/.netlify/functions/delete-progress-photo?photoId=${photoId}&coachId=${clientData.coach_id}`);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Failed to delete photo. Please try again.');
    }
  };

  // Photo handlers
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setPhotoFile(file);
      const compressed = await compressImage(file);
      setPhotoPreview(compressed);
    } catch (err) {
      console.error('Error processing photo:', err);
      alert('Error processing photo. Please try a different image.');
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoPreview) {
      alert('Please select a photo first.');
      return;
    }

    // Validate required data
    if (!clientData?.id || !clientData?.coach_id) {
      alert('Session data missing. Please refresh the page and try again.');
      return;
    }

    setUploadingPhoto(true);
    try {
      await apiPost('/.netlify/functions/upload-progress-photo', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        photoData: photoPreview,
        photoType: photoType,
        takenDate: photoDate
      });

      alert('Photo uploaded!');
      setShowPhotoModal(false);
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoType('progress');
      setPhotoDate(getLocalDateString());
      loadPhotos();
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert(err.message || 'Error uploading photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Compare mode handlers
  const toggleCompareMode = () => {
    if (compareMode) {
      setCompareMode(false);
      setSelectedPhotos([]);
    } else {
      setCompareMode(true);
      setSelectedPhotos([]);
    }
  };

  const handlePhotoClick = (photo) => {
    if (!compareMode) {
      window.open(photo.url || photo.photo_url, '_blank');
      return;
    }

    const isSelected = selectedPhotos.some(p => p.id === photo.id);
    if (isSelected) {
      setSelectedPhotos(prev => prev.filter(p => p.id !== photo.id));
    } else if (selectedPhotos.length < 2) {
      const updated = [...selectedPhotos, photo];
      setSelectedPhotos(updated);
      if (updated.length === 2) {
        // Sort by date so earlier photo is first
        updated.sort((a, b) => new Date(a.taken_date || a.date_taken) - new Date(b.taken_date || b.date_taken));
        setSelectedPhotos(updated);
        setShowComparison(true);
        setAiAnalysis('');
        document.body.style.overflow = 'hidden';
      }
    }
  };

  const closeComparison = () => {
    setShowComparison(false);
    setAiAnalysis('');
    setAnalyzingPhotos(false);
    setSelectedPhotos([]);
    setCompareMode(false);
    document.body.style.overflow = '';
  };

  const handleAiAnalysis = async () => {
    if (selectedPhotos.length !== 2) return;

    setAnalyzingPhotos(true);
    setAiAnalysis('');
    try {
      const [photo1, photo2] = selectedPhotos;
      const data = await apiPost('/.netlify/functions/analyze-progress-photos', {
        photoUrl1: photo1.url || photo1.photo_url,
        photoUrl2: photo2.url || photo2.photo_url,
        photoType: photo1.photo_type || 'progress',
        date1: photo1.taken_date || photo1.date_taken,
        date2: photo2.taken_date || photo2.date_taken
      });
      setAiAnalysis(data.analysis || 'Unable to generate analysis.');
    } catch (err) {
      console.error('Error analyzing photos:', err);
      setAiAnalysis('Unable to analyze photos right now. Please try again later.');
    } finally {
      setAnalyzingPhotos(false);
    }
  };

  const photoTypeLabels = { front: 'Front', side: 'Side', back: 'Back', progress: 'Progress' };

  return (
    <div className="progress-page" ref={bindToContainer}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        indicatorRef={indicatorRef}
        threshold={threshold}
      />

      {/* Header */}
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">My Progress</h1>
      </div>

      {/* Tabs */}
      <div className="progress-tabs">
        <button
          className={`progress-tab ${activeTab === 'measurements' ? 'active' : ''}`}
          onClick={() => setActiveTab('measurements')}
        >
          <Ruler size={18} /> Measurements
        </button>
        <button
          className={`progress-tab ${activeTab === 'photos' ? 'active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          <Camera size={18} /> Photos
        </button>
      </div>

      {/* Content */}
      <div className="progress-content">
        {activeTab === 'measurements' ? (
          <>
            <button className="btn-primary full-width add-btn" onClick={() => setShowMeasurementModal(true)}>
              + Log Measurement
            </button>

            {/* Stats */}
            <div className="section-card">
              <h3 className="section-title">Current Stats</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{currentWeight ? `${currentWeight} ${weightUnit}` : '--'}</div>
                  <div className="stat-label">Current Weight</div>
                </div>
                <div className="stat-card">
                  <div className={`stat-value ${weightChange && weightChange < 0 ? 'negative' : weightChange && weightChange > 0 ? 'positive' : ''}`}>
                    {weightChange ? `${weightChange > 0 ? '+' : ''}${weightChange} ${weightUnit}` : '--'}
                  </div>
                  <div className="stat-label">Total Change</div>
                </div>
              </div>
            </div>

            {/* Recent Entries */}
            <div className="section-card">
              <h3 className="section-title">Recent Entries</h3>
              {loadingMeasurements ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading measurements...</p>
                </div>
              ) : measurements.length === 0 ? (
                <div className="empty-state-inline">
                  <span>📊</span>
                  <p>No measurements yet. Tap "+ Log Measurement" to add your first entry!</p>
                </div>
              ) : (
                <div className="measurements-list">
                  {measurements.slice(0, 10).map((m) => (
                    <MeasurementEntry key={m.id} measurement={m} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="photos-action-bar">
              <button className="btn-primary full-width add-btn" onClick={() => setShowPhotoModal(true)}>
                + Add Photo
              </button>
              {photos.length >= 2 && (
                <button
                  className={`compare-btn ${compareMode ? 'active' : ''}`}
                  onClick={toggleCompareMode}
                >
                  <Columns2 size={18} />
                  {compareMode ? 'Cancel' : 'Compare'}
                </button>
              )}
            </div>

            {compareMode && (
              <div className="compare-hint">
                Tap 2 photos to compare them side by side
              </div>
            )}

            <div className="section-card">
              <h3 className="section-title">Progress Photos</h3>
              {loadingPhotos ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading photos...</p>
                </div>
              ) : photos.length === 0 ? (
                <div className="empty-state-inline">
                  <Camera size={40} strokeWidth={1.5} className="empty-state-icon" />
                  <p>No photos yet. Tap "+ Add Photo" to upload!</p>
                </div>
              ) : (
                <div className="photos-grid">
                  {photos.map((photo, idx) => {
                    const isSelected = selectedPhotos.some(p => p.id === photo.id);
                    const selectedIndex = selectedPhotos.findIndex(p => p.id === photo.id);
                    return (
                      <div
                        key={photo.id || idx}
                        className={`photo-item ${compareMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handlePhotoClick(photo)}
                      >
                        <img src={photo.url || photo.photo_url} alt="Progress" loading="lazy" />
                        {isSelected && (
                          <div className="photo-selected-badge">{selectedIndex + 1}</div>
                        )}
                        {!compareMode && (
                          <button
                            className="photo-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const dateStr = new Date(photo.taken_date || photo.date_taken).toLocaleDateString();
                              if (window.confirm(`Delete photo from ${dateStr}?`)) {
                                handleDeletePhoto(photo.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <div className="photo-date-overlay">
                          {new Date(photo.taken_date || photo.date_taken).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Measurement Modal */}
      {showMeasurementModal && (
        <div className="modal-overlay" onClick={() => setShowMeasurementModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log Measurement</h2>
              <button className="modal-close" onClick={() => setShowMeasurementModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveMeasurement}>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={measurementForm.date}
                    onChange={(e) => handleMeasurementChange('date', e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Weight ({weightUnit})</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder={weightUnit === 'kg' ? '68.0' : '150.0'}
                      value={measurementForm.weight}
                      onChange={(e) => handleMeasurementChange('weight', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Body Fat %</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="20.0"
                      value={measurementForm.bodyFat}
                      onChange={(e) => handleMeasurementChange('bodyFat', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Chest (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="40.0"
                      value={measurementForm.chest}
                      onChange={(e) => handleMeasurementChange('chest', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Waist (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="32.0"
                      value={measurementForm.waist}
                      onChange={(e) => handleMeasurementChange('waist', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Hips (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="38.0"
                      value={measurementForm.hips}
                      onChange={(e) => handleMeasurementChange('hips', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Left Arm (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="14.0"
                      value={measurementForm.leftArm}
                      onChange={(e) => handleMeasurementChange('leftArm', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Right Arm (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="14.0"
                      value={measurementForm.rightArm}
                      onChange={(e) => handleMeasurementChange('rightArm', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Left Thigh (in)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="22.0"
                      value={measurementForm.leftThigh}
                      onChange={(e) => handleMeasurementChange('leftThigh', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Right Thigh (in)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="22.0"
                    value={measurementForm.rightThigh}
                    onChange={(e) => handleMeasurementChange('rightThigh', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    placeholder="Any notes..."
                    rows={2}
                    value={measurementForm.notes}
                    onChange={(e) => handleMeasurementChange('notes', e.target.value)}
                  />
                </div>

                <button type="submit" className="btn-primary full-width" disabled={savingMeasurement}>
                  {savingMeasurement ? 'Saving...' : 'Save Measurement'}
                </button>
                <button type="button" className="btn-secondary full-width" onClick={() => setShowMeasurementModal(false)}>
                  Cancel
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && (
        <div className="modal-overlay" onClick={() => setShowPhotoModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Photo</h2>
              <button className="modal-close" onClick={() => setShowPhotoModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="photo-preview-large" />
              ) : (
                <div
                  className="upload-area"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <div className="upload-icon">
                    <Camera size={48} strokeWidth={1.5} />
                  </div>
                  <div className="upload-text">Tap to select photo</div>
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                style={{ display: 'none' }}
              />

              <div className="form-group">
                <label>Photo Type</label>
                <select value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
                  <option value="progress">Progress</option>
                  <option value="front">Front View</option>
                  <option value="side">Side View</option>
                  <option value="back">Back View</option>
                </select>
              </div>

              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={photoDate}
                  onChange={(e) => setPhotoDate(e.target.value)}
                />
              </div>

              <button
                className="btn-primary full-width"
                onClick={() => {
                  if (photoPreview) {
                    handleUploadPhoto();
                  } else {
                    photoInputRef.current?.click();
                  }
                }}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? 'Uploading...' : photoPreview ? 'Upload Photo' : 'Select Photo'}
              </button>
              {photoPreview && (
                <button
                  className="btn-secondary full-width"
                  onClick={() => {
                    setPhotoPreview(null);
                    setPhotoFile(null);
                  }}
                >
                  Choose Different Photo
                </button>
              )}
              <button className="btn-secondary full-width" onClick={() => setShowPhotoModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal — portaled to body so it renders above everything */}
      {showComparison && selectedPhotos.length === 2 && createPortal(
        <div className="comparison-modal-overlay" onClick={closeComparison}>
          <div className="comparison-modal-content" onClick={e => e.stopPropagation()}>
            <div className="comparison-header">
              <h2>Photo Comparison</h2>
              <button className="comparison-close-btn" onClick={closeComparison}>
                <X size={20} />
              </button>
            </div>

            <div className="comparison-photos">
              {selectedPhotos.map((photo, i) => (
                <div key={photo.id} className="comparison-photo-card">
                  <div className="comparison-photo-label">
                    <strong>{i === 0 ? 'Before' : 'After'}</strong>
                    {new Date(photo.taken_date || photo.date_taken).toLocaleDateString()}
                  </div>
                  <img src={photo.url || photo.photo_url} alt={i === 0 ? 'Before' : 'After'} />
                  <div className="comparison-photo-badge">
                    {photoTypeLabels[photo.photo_type] || photo.photo_type || 'Progress'}
                  </div>
                </div>
              ))}
            </div>

            <div className="ai-analysis-section">
              {!aiAnalysis && (
                <button
                  className="ai-analysis-btn"
                  onClick={handleAiAnalysis}
                  disabled={analyzingPhotos}
                >
                  <Sparkles size={18} />
                  {analyzingPhotos ? 'Analyzing...' : 'Get AI Analysis'}
                </button>
              )}
              {aiAnalysis && (
                <div>
                  <div className="ai-analysis-label">AI Coach Analysis</div>
                  <div className="ai-analysis-text">{aiAnalysis}</div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Progress;
