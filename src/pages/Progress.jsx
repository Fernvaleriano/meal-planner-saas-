import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Ruler, Camera, X, Plus, Minus, ChevronDown, Trash2, Columns2, Sparkles, TrendingDown, TrendingUp, ChevronRight, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';

import { useToast } from '../components/Toast';
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

// Time frame options
const TIME_FRAMES = [
  { label: '1 Week', value: '1w', days: 7 },
  { label: '1 Month', value: '1m', days: 30 },
  { label: '3 Months', value: '3m', days: 90 },
  { label: '6 Months', value: '6m', days: 180 },
  { label: '1 Year', value: '1y', days: 365 },
  { label: 'All Time', value: 'all', days: null },
];

// Metric definitions
const METRIC_CONFIGS = [
  { key: 'weight', label: 'Weight', dbField: 'weight', unitKey: 'weight' },
  { key: 'bodyFat', label: 'Body Fat', dbField: 'body_fat_percentage', unitKey: 'percent' },
  { key: 'waist', label: 'Waist', dbField: 'waist', unitKey: 'circumference' },
  { key: 'chest', label: 'Chest', dbField: 'chest', unitKey: 'circumference' },
  { key: 'hips', label: 'Hips', dbField: 'hips', unitKey: 'circumference' },
  { key: 'leftArm', label: 'Left Arm', dbField: 'left_arm', unitKey: 'circumference' },
  { key: 'rightArm', label: 'Right Arm', dbField: 'right_arm', unitKey: 'circumference' },
  { key: 'leftThigh', label: 'Left Thigh', dbField: 'left_thigh', unitKey: 'circumference' },
  { key: 'rightThigh', label: 'Right Thigh', dbField: 'right_thigh', unitKey: 'circumference' },
  { key: 'bpSystolic', label: 'Blood Pressure - Systolic', dbField: 'blood_pressure_systolic', unitKey: 'mmHg' },
  { key: 'bpDiastolic', label: 'Blood Pressure - Diastolic', dbField: 'blood_pressure_diastolic', unitKey: 'mmHg' },
];

// Mini line chart component (pure SVG)
function MiniChart({ dataPoints, color = '#14b8a6' }) {
  if (!dataPoints || dataPoints.length < 2) return null;

  const width = 320;
  const height = 120;
  const paddingX = 8;
  const paddingTop = 10;
  const paddingBottom = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const values = dataPoints.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Add 5% padding to value range
  const padded = range * 0.05;
  const yMin = minVal - padded;
  const yMax = maxVal + padded;
  const yRange = yMax - yMin;

  const points = dataPoints.map((d, i) => ({
    x: paddingX + (i / (dataPoints.length - 1)) * chartWidth,
    y: paddingTop + chartHeight - ((d.value - yMin) / yRange) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Gradient fill area
  const areaPath = `${linePath} L${points[points.length - 1].x},${height - paddingBottom} L${points[0].x},${height - paddingBottom} Z`;

  // Y-axis labels (3 values)
  const yLabels = [
    { value: maxVal, y: paddingTop + 4 },
    { value: ((maxVal + minVal) / 2), y: paddingTop + chartHeight / 2 + 4 },
    { value: minVal, y: paddingTop + chartHeight + 4 },
  ];

  // Date labels
  const firstDate = dataPoints[0].date;
  const lastDate = dataPoints[dataPoints.length - 1].date;
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="metric-chart-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map((yl, i) => (
        <line key={i} x1={paddingX} y1={yl.y - 4 + (i === 2 ? 0 : 0)} x2={width - paddingX} y2={yl.y - 4}
          stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#1e293b" stroke={color} strokeWidth="1.5" />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((yl, i) => (
        <text key={i} x={width - paddingX} y={yl.y} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)">
          {Number(yl.value).toFixed(1)}
        </text>
      ))}

      {/* Date labels */}
      <text x={paddingX} y={height - 4} fontSize="10" fill="rgba(255,255,255,0.4)">{formatDate(firstDate)}</text>
      <text x={width - paddingX} y={height - 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)">{formatDate(lastDate)}</text>
    </svg>
  );
}

function Progress() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { showError, showSuccess } = useToast();

  // Get user's preferred units
  const isMetric = clientData?.unit_preference === 'metric';
  const weightUnit = isMetric ? 'kg' : 'lbs';
  const circumUnit = isMetric ? 'cm' : 'in';

  const [activeTab, setActiveTab] = useState('measurements');
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loadingMeasurements, setLoadingMeasurements] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Time frame
  const [timeFrame, setTimeFrame] = useState('1y');
  const [showTimeFrameDropdown, setShowTimeFrameDropdown] = useState(false);

  // Quick log modal
  const [quickLogMetric, setQuickLogMetric] = useState(null);
  const [quickLogValue, setQuickLogValue] = useState('');
  const [quickLogDate, setQuickLogDate] = useState(getLocalDateString());
  const [savingQuickLog, setSavingQuickLog] = useState(false);

  // Full measurement modal
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [measurementForm, setMeasurementForm] = useState({
    date: getLocalDateString(),
    weight: '', bodyFat: '', chest: '', waist: '', hips: '',
    leftArm: '', rightArm: '', leftThigh: '', rightThigh: '',
    bpSystolic: '', bpDiastolic: '', notes: ''
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
  const [pendingPhoto, setPendingPhoto] = useState(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Close time frame dropdown on outside click
  useEffect(() => {
    if (!showTimeFrameDropdown) return;
    const handleClick = () => setShowTimeFrameDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showTimeFrameDropdown]);

  // Pull-to-refresh
  const refreshProgressData = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const [measurementsData, photosData] = await Promise.all([
        apiGet(`/.netlify/functions/get-measurements?clientId=${clientData.id}&limit=200`).catch(() => null),
        apiGet(`/.netlify/functions/get-progress-photos?clientId=${clientData.id}`).catch(() => null)
      ]);
      if (measurementsData?.measurements) setMeasurements(measurementsData.measurements);
      if (photosData?.photos) setPhotos(photosData.photos);
    } catch (err) {
      console.error('Error refreshing progress data:', err);
    }
  }, [clientData?.id]);

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
      const data = await apiGet(`/.netlify/functions/get-measurements?clientId=${clientData.id}&limit=200`);
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

  // Filter measurements by time frame
  const filteredMeasurements = useMemo(() => {
    const tf = TIME_FRAMES.find(t => t.value === timeFrame);
    if (!tf || !tf.days) return measurements; // "All Time"
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - tf.days);
    return measurements.filter(m => new Date(m.measured_date) >= cutoff);
  }, [measurements, timeFrame]);

  // Get data for a specific metric
  const getMetricData = useCallback((dbField) => {
    const points = filteredMeasurements
      .filter(m => m[dbField] != null)
      .map(m => ({ date: m.measured_date, value: parseFloat(m[dbField]) }))
      .reverse(); // oldest first for chart

    if (points.length === 0) return null;

    const current = points[points.length - 1].value;
    const first = points[0].value;
    const change = points.length >= 2 ? parseFloat((current - first).toFixed(1)) : null;

    return { points, current, change };
  }, [filteredMeasurements]);

  // Get unit for metric
  const getUnit = (unitKey) => {
    if (unitKey === 'weight') return weightUnit;
    if (unitKey === 'percent') return '%';
    if (unitKey === 'mmHg') return 'mmHg';
    return circumUnit;
  };

  // Quick log handlers
  const openQuickLog = (metricConfig) => {
    setQuickLogMetric(metricConfig);
    setQuickLogValue('');
    setQuickLogDate(getLocalDateString());
  };

  const handleQuickLogSave = async () => {
    if (!quickLogMetric || !quickLogValue || !clientData?.id || !clientData?.coach_id) return;

    setSavingQuickLog(true);
    try {
      const payload = {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        measuredDate: quickLogDate,
      };

      // Map metric key to the correct API field
      const fieldMap = {
        weight: 'weight',
        bodyFat: 'bodyFatPercentage',
        chest: 'chest',
        waist: 'waist',
        hips: 'hips',
        leftArm: 'leftArm',
        rightArm: 'rightArm',
        leftThigh: 'leftThigh',
        rightThigh: 'rightThigh',
        bpSystolic: 'bloodPressureSystolic',
        bpDiastolic: 'bloodPressureDiastolic',
      };

      const apiField = fieldMap[quickLogMetric.key];
      if (apiField) {
        payload[apiField] = parseFloat(quickLogValue);
      }

      await apiPost('/.netlify/functions/save-measurement', payload);
      setQuickLogMetric(null);
      setQuickLogValue('');
      loadMeasurements();
    } catch (err) {
      console.error('Error saving measurement:', err);
      alert(err.message || 'Error saving. Please try again.');
    } finally {
      setSavingQuickLog(false);
    }
  };

  // Full measurement form handlers
  const handleMeasurementChange = (field, value) => {
    setMeasurementForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveMeasurement = async (e) => {
    e.preventDefault();
    if (!clientData?.id || !clientData?.coach_id) {
      showError('Session data missing. Please refresh the page and try again.');
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
        bloodPressureSystolic: parseFloat(measurementForm.bpSystolic) || null,
        bloodPressureDiastolic: parseFloat(measurementForm.bpDiastolic) || null,
        notes: measurementForm.notes || null
      });

      showSuccess('Measurement saved!');
      setShowMeasurementModal(false);
      setMeasurementForm({
        date: getLocalDateString(),
        weight: '', bodyFat: '', chest: '', waist: '', hips: '',
        leftArm: '', rightArm: '', leftThigh: '', rightThigh: '',
        bpSystolic: '', bpDiastolic: '', notes: ''
      });
      loadMeasurements();
    } catch (err) {
      console.error('Error saving measurement:', err);
      showError(err.message || 'Error saving measurement. Please try again.');
    } finally {
      setSavingMeasurement(false);
    }
  };

  // Delete measurement handler
  const handleDeleteMeasurement = async (measurementId) => {
    if (!clientData?.id) return;
    try {
      await apiDelete(`/.netlify/functions/delete-measurement?measurementId=${measurementId}&clientId=${clientData.id}`);
      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
    } catch (err) {
      console.error('Error deleting measurement:', err);
      showError('Failed to delete measurement. Please try again.');
    }
  };

  // Delete photo handler
  const handleDeletePhoto = async (photoId) => {
    if (!clientData?.id || !clientData?.coach_id) return;
    try {
      await apiDelete(`/.netlify/functions/delete-progress-photo?photoId=${photoId}&coachId=${clientData.coach_id}`);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      console.error('Error deleting photo:', err);
      showError('Failed to delete photo. Please try again.');
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
      showError('Error processing photo. Please try a different image.');
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoPreview) {
      showError('Please select a photo first.');
      return;
    }

    // Validate required data
    if (!clientData?.id || !clientData?.coach_id) {
      showError('Session data missing. Please refresh the page and try again.');
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

      showSuccess('Photo uploaded!');
      setShowPhotoModal(false);
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoType('progress');
      setPhotoDate(getLocalDateString());
      loadPhotos();
    } catch (err) {
      console.error('Error uploading photo:', err);
      showError(err.message || 'Error uploading photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Compare mode handlers
  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setSelectedPhotos([]);
    setPendingPhoto(null);
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
      setPendingPhoto(photo);
    }
  };

  const confirmPhotoSelection = () => {
    if (!pendingPhoto) return;
    const updated = [...selectedPhotos, pendingPhoto];
    setSelectedPhotos(updated);
    setPendingPhoto(null);
    if (updated.length === 2) {
      setShowComparison(true);
      setAiAnalysis('');
      document.body.style.overflow = 'hidden';
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
  const currentTimeFrameLabel = TIME_FRAMES.find(t => t.value === timeFrame)?.label || '1 Year';

  // Metric card component
  const MetricCard = ({ config }) => {
    const data = getMetricData(config.dbField);
    const unit = getUnit(config.unitKey);

    return (
      <div className="metric-card">
        <div className="metric-card-header">
          <span className="metric-card-title">{config.label.toUpperCase()}</span>
          {data && data.change !== null && (
            <div className={`metric-change ${data.change < 0 ? 'decrease' : data.change > 0 ? 'increase' : ''}`}>
              {data.change < 0 ? <TrendingDown size={14} /> : data.change > 0 ? <TrendingUp size={14} /> : null}
              <span>{data.change > 0 ? '+' : ''}{data.change} {unit}</span>
            </div>
          )}
        </div>

        {data ? (
          <>
            <div className="metric-current-value">
              {data.current} <span className="metric-unit">{unit}</span>
            </div>
            <div className="metric-chart-container">
              <MiniChart dataPoints={data.points} />
            </div>
          </>
        ) : (
          <div className="metric-no-data">
            No data for selected time frame
          </div>
        )}

        <button className="metric-log-btn" onClick={() => openQuickLog(config)}>
          <span>Log Value</span>
          <ChevronRight size={18} />
        </button>
      </div>
    );
  };

  return (
    <div className="progress-page" ref={bindToContainer}>
      <PullToRefreshIndicator indicatorRef={indicatorRef} threshold={threshold} />

      {/* Header */}
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">Progress</h1>
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
            {/* Time Frame Selector */}
            <div className="time-frame-bar">
              <span className="time-frame-label">Time frame</span>
              <div className="time-frame-selector" onClick={(e) => { e.stopPropagation(); setShowTimeFrameDropdown(!showTimeFrameDropdown); }}>
                <span className="time-frame-value">{currentTimeFrameLabel}</span>
                <ChevronDown size={16} />
                {showTimeFrameDropdown && (
                  <div className="time-frame-dropdown">
                    {TIME_FRAMES.map(tf => (
                      <button
                        key={tf.value}
                        className={`time-frame-option ${timeFrame === tf.value ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setTimeFrame(tf.value); setShowTimeFrameDropdown(false); }}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Log All Button */}
            <button className="btn-log-all" onClick={() => setShowMeasurementModal(true)}>
              <Plus size={18} />
              <span>Log All Measurements</span>
            </button>

            {loadingMeasurements ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading measurements...</p>
              </div>
            ) : (
              <div className="metric-cards-list">
                {METRIC_CONFIGS.map(config => (
                  <MetricCard key={config.key} config={config} />
                ))}
              </div>
            )}
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
                {selectedPhotos.length === 0
                  ? '① Select your BEFORE photo'
                  : '② Now select your AFTER photo'}
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
                  <p className="empty-state-title">No progress photos yet</p>
                  <p className="empty-state-subtitle">Take your first photo to track your transformation journey!</p>
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
                          <div className="photo-selected-badge">{selectedIndex === 0 ? 'Before' : 'After'}</div>
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

      {/* Quick Log Modal */}
      {quickLogMetric && (
        <div className="modal-overlay" onClick={() => setQuickLogMetric(null)}>
          <div className="quick-log-modal" onClick={e => e.stopPropagation()}>
            <div className="quick-log-header">
              <h2>{quickLogMetric.label}</h2>
              <button className="modal-close" onClick={() => setQuickLogMetric(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="quick-log-body">
              <div className="quick-log-input-group">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="0.0"
                  value={quickLogValue}
                  onChange={(e) => setQuickLogValue(e.target.value)}
                  className="quick-log-input"
                  autoFocus
                />
                <span className="quick-log-unit">{getUnit(quickLogMetric.unitKey)}</span>
              </div>
              <div className="quick-log-date-row">
                <Calendar size={16} />
                <input
                  type="date"
                  value={quickLogDate}
                  onChange={(e) => setQuickLogDate(e.target.value)}
                  className="quick-log-date"
                />
              </div>
              <button
                className="btn-primary full-width"
                onClick={handleQuickLogSave}
                disabled={savingQuickLog || !quickLogValue}
              >
                {savingQuickLog ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Measurement Modal */}
      {showMeasurementModal && (
        <div className="modal-overlay" onClick={() => setShowMeasurementModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log All Measurements</h2>
              <button className="modal-close" onClick={() => setShowMeasurementModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveMeasurement}>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={measurementForm.date}
                    onChange={(e) => handleMeasurementChange('date', e.target.value)} required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Weight ({weightUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      placeholder={weightUnit === 'kg' ? '68.0' : '150.0'}
                      value={measurementForm.weight}
                      onChange={(e) => handleMeasurementChange('weight', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Body Fat %</label>
                    <input type="number" inputMode="decimal" step="0.1" placeholder="20.0"
                      value={measurementForm.bodyFat}
                      onChange={(e) => handleMeasurementChange('bodyFat', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Chest ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.chest}
                      onChange={(e) => handleMeasurementChange('chest', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Waist ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.waist}
                      onChange={(e) => handleMeasurementChange('waist', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Hips ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.hips}
                      onChange={(e) => handleMeasurementChange('hips', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Left Arm ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.leftArm}
                      onChange={(e) => handleMeasurementChange('leftArm', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Right Arm ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.rightArm}
                      onChange={(e) => handleMeasurementChange('rightArm', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Left Thigh ({circumUnit})</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.leftThigh}
                      onChange={(e) => handleMeasurementChange('leftThigh', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Right Thigh ({circumUnit})</label>
                  <input type="number" inputMode="decimal" step="0.1"
                    value={measurementForm.rightThigh}
                    onChange={(e) => handleMeasurementChange('rightThigh', e.target.value)} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>BP Systolic (mmHg)</label>
                    <input type="number" inputMode="decimal" step="1" placeholder="120"
                      value={measurementForm.bpSystolic}
                      onChange={(e) => handleMeasurementChange('bpSystolic', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>BP Diastolic (mmHg)</label>
                    <input type="number" inputMode="decimal" step="1" placeholder="80"
                      value={measurementForm.bpDiastolic}
                      onChange={(e) => handleMeasurementChange('bpDiastolic', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea placeholder="Any notes..." rows={2}
                    value={measurementForm.notes}
                    onChange={(e) => handleMeasurementChange('notes', e.target.value)} />
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
                <div className="upload-area" onClick={() => photoInputRef.current?.click()}>
                  <div className="upload-icon"><Camera size={48} strokeWidth={1.5} /></div>
                  <div className="upload-text">Tap to select photo</div>
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />

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
                <input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} />
              </div>

              <button className="btn-primary full-width"
                onClick={() => { if (photoPreview) { handleUploadPhoto(); } else { photoInputRef.current?.click(); } }}
                disabled={uploadingPhoto}>
                {uploadingPhoto ? 'Uploading...' : photoPreview ? 'Upload Photo' : 'Select Photo'}
              </button>
              {photoPreview && (
                <button className="btn-secondary full-width"
                  onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}>
                  Choose Different Photo
                </button>
              )}
              <button className="btn-secondary full-width" onClick={() => setShowPhotoModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Selection Confirmation Modal */}
      {pendingPhoto && createPortal(
        <div className="delete-confirm-overlay" onClick={() => setPendingPhoto(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <img
              src={pendingPhoto.url || pendingPhoto.photo_url}
              alt="Selected"
              style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '12px', marginBottom: '16px' }}
            />
            <h3>{selectedPhotos.length === 0 ? 'Use as your BEFORE photo?' : 'Use as your AFTER photo?'}</h3>
            <p>
              {selectedPhotos.length === 0
                ? 'This will be your starting point for comparison.'
                : 'This will be compared against your before photo.'}
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-cancel-btn" onClick={() => setPendingPhoto(null)}>
                Cancel
              </button>
              <button
                className="delete-confirm-btn"
                style={{ background: 'var(--teal-500, #14b8a6)' }}
                onClick={confirmPhotoSelection}
              >
                {selectedPhotos.length === 0 ? 'Yes, Before' : 'Yes, After'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Comparison Modal */}
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
                <button className="ai-analysis-btn" onClick={handleAiAnalysis} disabled={analyzingPhotos}>
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
