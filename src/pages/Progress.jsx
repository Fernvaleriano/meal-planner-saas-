import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Ruler, Camera, X, Plus, Minus, ChevronDown, Trash2, Columns2, Sparkles, TrendingDown, TrendingUp, ChevronRight, Calendar, Award, Share2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { BADGE_TIERS, getEarnedTiers, getNextTier, generateBadgeShareCard, shareOrDownloadBadge } from '../utils/badges';
import BadgeCelebrationModal from '../components/BadgeCelebrationModal';
import BadgeIcon from '../components/BadgeIcon';

import { useToast } from '../components/Toast';
import CoachReactionBadge from '../components/CoachReactionBadge';
import { useClientReactions } from '../hooks/useClientReactions';
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

// Time frame options.
// 'label' / 'shortLabel' are the original English strings kept for reference.
// At render time, use t('progressPage.' + tf.labelKey) / t('progressPage.' + tf.shortLabelKey).
const TIME_FRAMES = [
  { labelKey: 'timeframe1wLabel',   shortLabelKey: 'timeframe1wShort',   value: '1w',  days: 7 },
  { labelKey: 'timeframe1mLabel',   shortLabelKey: 'timeframe1mShort',   value: '1m',  days: 30 },
  { labelKey: 'timeframe3mLabel',   shortLabelKey: 'timeframe3mShort',   value: '3m',  days: 90 },
  { labelKey: 'timeframe6mLabel',   shortLabelKey: 'timeframe6mShort',   value: '6m',  days: 180 },
  { labelKey: 'timeframe1yLabel',   shortLabelKey: 'timeframe1yShort',   value: '1y',  days: 365 },
  { labelKey: 'timeframeAllLabel',  shortLabelKey: 'timeframeAllShort',  value: 'all', days: null },
];

// Metric definitions.
// 'labelKey' is used to look up the translated label via t('progressPage.' + config.labelKey).
// The underlying key/dbField/unitKey values used in logic are UNCHANGED.
const METRIC_CONFIGS = [
  { key: 'weight',     labelKey: 'metricWeight',      dbField: 'weight',                   unitKey: 'weight' },
  { key: 'bodyFat',    labelKey: 'metricBodyFat',      dbField: 'body_fat_percentage',       unitKey: 'percent' },
  { key: 'waist',      labelKey: 'metricWaist',        dbField: 'waist',                     unitKey: 'circumference' },
  { key: 'chest',      labelKey: 'metricChest',        dbField: 'chest',                     unitKey: 'circumference' },
  { key: 'hips',       labelKey: 'metricHips',         dbField: 'hips',                      unitKey: 'circumference' },
  { key: 'leftArm',    labelKey: 'metricLeftArm',      dbField: 'left_arm',                  unitKey: 'circumference' },
  { key: 'rightArm',   labelKey: 'metricRightArm',     dbField: 'right_arm',                 unitKey: 'circumference' },
  { key: 'leftThigh',  labelKey: 'metricLeftThigh',    dbField: 'left_thigh',                unitKey: 'circumference' },
  { key: 'rightThigh', labelKey: 'metricRightThigh',   dbField: 'right_thigh',               unitKey: 'circumference' },
  { key: 'bpSystolic', labelKey: 'metricBpSystolic',   dbField: 'blood_pressure_systolic',   unitKey: 'mmHg' },
  { key: 'bpDiastolic',labelKey: 'metricBpDiastolic',  dbField: 'blood_pressure_diastolic',  unitKey: 'mmHg' },
];

// Mini line chart component (pure SVG)
function MiniChart({ dataPoints, color = '#4ec5b7' }) {
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
  const [searchParams] = useSearchParams();
  const { clientData } = useAuth();
  const { t, language } = useLanguage();
  const { showError, showSuccess } = useToast();

  // Get user's preferred units
  const isMetric = clientData?.unit_preference === 'metric';
  const weightUnit = isMetric ? 'kg' : 'lbs';
  const circumUnit = isMetric ? 'cm' : 'in';

  const initialTab = ['measurements', 'photos', 'achievements'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'measurements';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Coach reactions on measurements / photos so we can show a small badge
  // on the entries the coach reacted to.
  const { getReaction: getMeasurementReaction } = useClientReactions('measurement');
  const { getReaction: getPhotoReaction } = useClientReactions('photo');
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loadingMeasurements, setLoadingMeasurements] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Time frame
  const [timeFrame, setTimeFrame] = useState('1y');

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

  // Achievements / badges
  const [totalCheckinCount, setTotalCheckinCount] = useState(0);
  const [loadingCheckinCount, setLoadingCheckinCount] = useState(true);
  const [sharingBadge, setSharingBadge] = useState(false);
  // Share-card background. Auto-set to the most recent gym check-in photo
  // on load (see loadCheckinCount). User can override via "Change photo"
  // in the celebration modal.
  const [shareBgImage, setShareBgImage] = useState(null);
  // When non-null, the celebration modal is open in "re-share" mode for
  // an already-earned badge. Carries { tier, newCount, earnedTiers } in
  // the same shape the modal uses for fresh unlocks.
  const [shareBadgePreview, setShareBadgePreview] = useState(null);

  // Per-metric expanded-history state (keyed by metric config key)
  const [expandedHistory, setExpandedHistory] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Scroll position is managed centrally by Layout (per-path restoration).

  // Pull-to-refresh
  const refreshProgressData = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const [measurementsData, photosData, gymProofsData] = await Promise.all([
        apiGet(`/.netlify/functions/get-measurements?clientId=${clientData.id}&limit=200`).catch(() => null),
        apiGet(`/.netlify/functions/get-progress-photos?clientId=${clientData.id}`).catch(() => null),
        apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=1`).catch(() => null)
      ]);
      if (measurementsData?.measurements) setMeasurements(measurementsData.measurements);
      if (photosData?.photos) setPhotos(photosData.photos);
      if (typeof gymProofsData?.pagination?.total === 'number') setTotalCheckinCount(gymProofsData.pagination.total);
      const latestPhoto = gymProofsData?.proofs?.[0]?.photo_url;
      if (latestPhoto) setShareBgImage(latestPhoto);
    } catch (err) {
      console.error('Error refreshing progress data:', err);
    }
  }, [clientData?.id]);

  const { isRefreshing, indicatorRef, bindToContainer, threshold } = usePullToRefresh(refreshProgressData);

  useEffect(() => {
    if (clientData?.id) {
      loadMeasurements();
      loadPhotos();
      loadCheckinCount();
    }
  }, [clientData?.id]);

  const loadCheckinCount = async () => {
    setLoadingCheckinCount(true);
    try {
      const data = await apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=1`);
      const total = data?.pagination?.total;
      setTotalCheckinCount(typeof total === 'number' ? total : (data?.proofs?.length || 0));
      const latestPhoto = data?.proofs?.[0]?.photo_url;
      if (latestPhoto) setShareBgImage(latestPhoto);
    } catch (err) {
      console.error('Error loading gym check-in count:', err);
    } finally {
      setLoadingCheckinCount(false);
    }
  };

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
      alert(err.message || t('progressPage.errorSavingQuickLog'));
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
      showError(t('progressPage.sessionMissing'));
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

      showSuccess(t('progressPage.measurementSaved'));
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
      showError(err.message || t('progressPage.errorSavingMeasurement'));
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
      showError(t('progressPage.failedDeleteMeasurement'));
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
      showError(t('progressPage.failedDeletePhoto'));
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
      showError(t('progressPage.errorProcessingPhoto'));
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoPreview) {
      showError(t('progressPage.pleaseSelectPhoto'));
      return;
    }

    // Validate required data
    if (!clientData?.id || !clientData?.coach_id) {
      showError(t('progressPage.sessionMissing'));
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

      showSuccess(t('progressPage.photoUploaded'));
      setShowPhotoModal(false);
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoType('progress');
      setPhotoDate(getLocalDateString());
      loadPhotos();
    } catch (err) {
      console.error('Error uploading photo:', err);
      showError(err.message || t('progressPage.errorUploadingPhoto'));
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

  // Safety net: the comparison modal locks body scroll imperatively
  // (confirmPhotoSelection sets overflow:hidden, closeComparison clears it).
  // If the user navigates away while the modal is open, closeComparison never
  // runs and the page stays frozen/unscrollable until reload. This guarantees
  // the lock is released whenever the modal closes OR the page unmounts.
  useEffect(() => {
    if (!showComparison) return;
    return () => {
      document.body.style.overflow = '';
    };
  }, [showComparison]);

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
        date2: photo2.taken_date || photo2.date_taken,
        language
      });
      setAiAnalysis(data.analysis || t('progressPage.unableToAnalyze'));
    } catch (err) {
      console.error('Error analyzing photos:', err);
      setAiAnalysis(t('progressPage.unableToAnalyze'));
    } finally {
      setAnalyzingPhotos(false);
    }
  };

  const photoTypeLabels = {
    front: t('progressPage.photoTypeFront'),
    side: t('progressPage.photoTypeSide'),
    back: t('progressPage.photoTypeBack'),
    progress: t('progressPage.photoTypeProgress'),
  };

  // Metric card component
  const MetricCard = ({ config }) => {
    const data = getMetricData(config.dbField);
    const unit = getUnit(config.unitKey);
    const expanded = !!expandedHistory[config.key];
    const entries = useMemo(
      () => filteredMeasurements.filter(m => m[config.dbField] != null),
      [config.dbField]
    );
    const visibleEntries = entries.slice(0, 30);

    const formatDate = (iso) =>
      new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

    return (
      <div className="metric-card">
        <div className="metric-card-header">
          <span className="metric-card-title">{t('progressPage.' + config.labelKey).toUpperCase()}</span>
          {data && data.change !== null && data.change !== 0 && (
            <div className="metric-change neutral">
              {data.change < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
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
            {t('progressPage.noDataForTimeFrame')}
          </div>
        )}

        <button className="metric-log-btn" onClick={() => openQuickLog(config)}>
          <span>{t('progressPage.logValue')}</span>
          <ChevronRight size={18} />
        </button>

        {entries.length > 0 && (
          <div className="metric-history">
            <button
              className="metric-history-toggle"
              onClick={() => setExpandedHistory(prev => ({ ...prev, [config.key]: !expanded }))}
            >
              <span>{expanded ? t('progressPage.hideEntries', { count: entries.length }) : t('progressPage.viewEntries', { count: entries.length })}</span>
              <ChevronDown
                size={16}
                style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {expanded && (
              <ul className="metric-history-list">
                {visibleEntries.map(m => {
                  const coachReaction = getMeasurementReaction('measurement', m.id);
                  return (
                    <li key={m.id} className="metric-history-item">
                      <div className="metric-history-meta">
                        <span className="metric-history-date">{formatDate(m.measured_date)}</span>
                        <span className="metric-history-value">
                          {m[config.dbField]} {unit}
                        </span>
                      </div>
                      <CoachReactionBadge reaction={coachReaction} title={`Coach reacted ${coachReaction?.reaction || ''}`} />
                      <button
                        className="metric-history-delete"
                        aria-label={t('progressPage.deleteEntryAriaLabel')}
                        onClick={() => setConfirmDelete({ id: m.id, label: t('progressPage.' + config.labelKey), value: m[config.dbField], unit, date: formatDate(m.measured_date) })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
                {entries.length > visibleEntries.length && (
                  <li className="metric-history-more">
                    {t('progressPage.showingMostRecent', { shown: visibleEntries.length, total: entries.length })}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  // Achievement computations
  const earnedTiers = getEarnedTiers(totalCheckinCount);
  const nextTier = getNextTier(totalCheckinCount);
  const highestEarned = earnedTiers[earnedTiers.length - 1] || null;

  // Open the celebration modal in "re-share" mode so the user can confirm
  // the featured badge and (optionally) swap the background photo before
  // the image is generated. The actual generate-and-share happens in
  // handleShareBadgesConfirm, wired to the modal's onShare prop.
  const handleShareBadges = () => {
    const featured = highestEarned || BADGE_TIERS[0];
    setShareBadgePreview({
      tier: featured,
      newCount: totalCheckinCount,
      earnedTiers,
    });
  };

  const handleChangeSharePhoto = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => setShareBgImage(ev.target?.result || null);
    reader.readAsDataURL(file);
  };

  // Generate the PNG and share/download. Called by the celebration modal
  // when the user taps "Save / Share image".
  const handleShareBadgesConfirm = async () => {
    if (sharingBadge || !shareBadgePreview) return;
    setSharingBadge(true);
    try {
      const featured = shareBadgePreview.tier;
      const blob = await generateBadgeShareCard({
        tier: featured,
        totalCount: totalCheckinCount,
        earnedTiers,
        clientName: clientData?.client_name,
        bgImage: shareBgImage,
      });
      const captionText = highestEarned
        ? `Just unlocked ${featured.name} ${featured.icon} — ${totalCheckinCount} check-ins strong!`
        : `${totalCheckinCount} check-ins and counting 💪`;
      const result = await shareOrDownloadBadge(blob, featured, captionText);
      if (result.downloaded) {
        showSuccess?.(t('progressPage.imageSaved'));
      }
    } catch (err) {
      console.error('Error sharing badges:', err);
      showError?.(t('progressPage.couldNotGenerateShare'));
    } finally {
      setSharingBadge(false);
    }
  };

  return (
    <div className="progress-page" ref={bindToContainer}>
      <PullToRefreshIndicator indicatorRef={indicatorRef} threshold={threshold} />

      {/* Header */}
      <div className="page-header-gradient">
        <button className="back-btn-circle" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="page-title">{t('progressPage.pageTitle')}</h1>
      </div>

      {/* Tabs */}
      <div className="progress-tabs">
        <button
          className={`progress-tab ${activeTab === 'measurements' ? 'active' : ''}`}
          onClick={() => setActiveTab('measurements')}
        >
          <Ruler size={18} /> {t('progressPage.tabMeasurements')}
        </button>
        <button
          className={`progress-tab ${activeTab === 'photos' ? 'active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          <Camera size={18} /> {t('progressPage.tabPhotos')}
        </button>
        <button
          className={`progress-tab ${activeTab === 'achievements' ? 'active' : ''}`}
          onClick={() => setActiveTab('achievements')}
        >
          <Award size={18} /> {t('progressPage.tabBadges')}
        </button>
      </div>

      {/* Content */}
      <div className="progress-content">
        {activeTab === 'measurements' ? (
          <>
            {/* Time Frame Segmented Control */}
            <div className="time-frame-segmented" role="tablist" aria-label="Time frame">
              {TIME_FRAMES.map(tf => (
                <button
                  key={tf.value}
                  role="tab"
                  aria-selected={timeFrame === tf.value}
                  className={`time-frame-segment ${timeFrame === tf.value ? 'active' : ''}`}
                  onClick={() => setTimeFrame(tf.value)}
                >
                  {t('progressPage.' + tf.shortLabelKey)}
                </button>
              ))}
            </div>

            {/* Log All Button */}
            <button className="btn-log-all" onClick={() => setShowMeasurementModal(true)}>
              <Plus size={18} />
              <span>{t('progressPage.logAllMeasurements')}</span>
            </button>

            {loadingMeasurements ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>{t('progressPage.loadingMeasurements')}</p>
              </div>
            ) : (() => {
              const tracked = METRIC_CONFIGS.filter(c => getMetricData(c.dbField));
              const untracked = METRIC_CONFIGS.filter(c => !getMetricData(c.dbField));
              return (
                <>
                  {tracked.length > 0 && (
                    <div className="metric-cards-list">
                      {tracked.map(config => (
                        <MetricCard key={config.key} config={config} />
                      ))}
                    </div>
                  )}
                  {untracked.length > 0 && (
                    <div className="untracked-metrics-card">
                      <div className="untracked-metrics-title">{t('progressPage.trackMore')}</div>
                      <div className="untracked-metrics-row">
                        {untracked.map(config => (
                          <button
                            key={config.key}
                            className="untracked-metric-chip"
                            onClick={() => openQuickLog(config)}
                          >
                            <Plus size={14} />
                            <span>{t('progressPage.' + config.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {tracked.length === 0 && untracked.length === 0 && (
                    <div className="metric-no-data">{t('progressPage.noMeasurementsYet')}</div>
                  )}
                </>
              );
            })()}
          </>
        ) : activeTab === 'photos' ? (
          <>
            <div className="photos-action-bar">
              <button className="btn-primary full-width add-btn" onClick={() => setShowPhotoModal(true)}>
                {t('progressPage.addPhoto')}
              </button>
            </div>

            {compareMode && (
              <div className="compare-hint">
                {selectedPhotos.length === 0
                  ? t('progressPage.selectBeforePhoto')
                  : t('progressPage.selectAfterPhoto')}
              </div>
            )}

            <div className="section-card">
              <div className="section-title-row">
                <h3 className="section-title">{t('progressPage.progressPhotosTitle')}</h3>
                {photos.length >= 2 && (
                  <button
                    className={`compare-btn ${compareMode ? 'active' : ''}`}
                    onClick={toggleCompareMode}
                  >
                    <Columns2 size={16} />
                    {compareMode ? t('progressPage.cancel') : t('progressPage.compare')}
                  </button>
                )}
              </div>
              {loadingPhotos ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>{t('progressPage.loadingPhotos')}</p>
                </div>
              ) : photos.length === 0 ? (
                <div className="empty-state-inline">
                  <Camera size={40} strokeWidth={1.5} className="empty-state-icon" />
                  <p className="empty-state-title">{t('progressPage.noPhotosYet')}</p>
                  <p className="empty-state-subtitle">{t('progressPage.noPhotosSubtitle')}</p>
                </div>
              ) : (
                <div className="photos-grid">
                  {photos.map((photo, idx) => {
                    const isSelected = selectedPhotos.some(p => p.id === photo.id);
                    const selectedIndex = selectedPhotos.findIndex(p => p.id === photo.id);
                    const coachReaction = getPhotoReaction('photo', photo.id);
                    return (
                      <div
                        key={photo.id || idx}
                        className={`photo-item ${compareMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handlePhotoClick(photo)}
                      >
                        <img src={photo.url || photo.photo_url} alt="Progress" loading="lazy" />
                        <CoachReactionBadge
                          reaction={coachReaction}
                          size="overlay"
                          title={`Coach reacted ${coachReaction?.reaction || ''}`}
                        />
                        {isSelected && (
                          <div className="photo-selected-badge">{selectedIndex === 0 ? t('progressPage.labelBefore') : t('progressPage.labelAfter')}</div>
                        )}
                        {!compareMode && (
                          <button
                            className="photo-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const dateStr = new Date(photo.taken_date || photo.date_taken).toLocaleDateString();
                              if (window.confirm(t('progressPage.deletePhotoConfirm', { date: dateStr }))) {
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
        ) : (
          /* Achievements / Badges tab */
          <>
            {loadingCheckinCount ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>{t('progressPage.loadingAchievements')}</p>
              </div>
            ) : (
              <>
                <div className="achievements-summary-card">
                  <div className="achievements-stat">
                    <div className="achievements-stat-value">{totalCheckinCount}</div>
                    <div className="achievements-stat-label">{t('progressPage.checkIns')}</div>
                  </div>
                  <div className="achievements-stat-divider" aria-hidden="true" />
                  <div className="achievements-stat">
                    <div className="achievements-stat-value">{earnedTiers.length} / {BADGE_TIERS.length}</div>
                    <div className="achievements-stat-label">{t('progressPage.badgesEarned')}</div>
                  </div>
                </div>

                {nextTier && (() => {
                  const prev = earnedTiers.length > 0 ? earnedTiers[earnedTiers.length - 1].threshold : 0;
                  const span = nextTier.threshold - prev;
                  const pct = Math.max(0, Math.min(100, ((totalCheckinCount - prev) / span) * 100));
                  const remaining = nextTier.threshold - totalCheckinCount;
                  return (
                    <div className="next-badge-progress-card">
                      <div className="next-badge-progress-label">
                        <span className="next-badge-progress-label-text">
                          <span>
                            {t('progressPage.moreToUnlock', { remaining })} <strong>{nextTier.nameKey ? t(nextTier.nameKey) : nextTier.name}</strong>
                          </span>
                          <BadgeIcon tier={nextTier} size={16} strokeWidth={2} />
                        </span>
                        <span>{totalCheckinCount} / {nextTier.threshold}</span>
                      </div>
                      <div className="next-badge-progress-bar">
                        <div className="next-badge-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

                <button
                  className="btn-share-badges"
                  onClick={handleShareBadges}
                  disabled={sharingBadge}
                >
                  <Share2 size={18} />
                  <span>{sharingBadge ? t('progressPage.generatingShare') : t('progressPage.shareToSocial')}</span>
                </button>

                <div className="badges-grid">
                  {BADGE_TIERS.map(tier => {
                    const earned = totalCheckinCount >= tier.threshold;
                    const pct = earned
                      ? 100
                      : Math.max(0, Math.min(100, (totalCheckinCount / tier.threshold) * 100));
                    return (
                      <div
                        key={tier.threshold}
                        className={`badge-card ${earned ? 'earned' : 'locked'}`}
                        title={`${tier.nameKey ? t(tier.nameKey) : tier.name} — ${tier.descKey ? t(tier.descKey) : tier.desc}`}
                        style={{ '--badge-tier-color': tier.iconColor || '#fbbf24' }}
                      >
                        {earned
                          ? <span className="badge-ribbon">{t('progressPage.earnedRibbon')}</span>
                          : <span className="badge-lock-icon">🔒</span>}
                        <span className="badge-icon">
                          <BadgeIcon
                            tier={tier}
                            size={36}
                            strokeWidth={2}
                            color={earned ? tier.iconColor : '#94a3b8'}
                          />
                        </span>
                        <div className="badge-name">{tier.name}</div>
                        <div className="badge-threshold">{tier.desc}</div>
                        {!earned && (
                          <div className="badge-card-progress">
                            <div className="badge-card-progress-bar">
                              <div className="badge-card-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="badge-card-progress-label">
                              {totalCheckinCount} / {tier.threshold}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Quick Log Modal */}
      {quickLogMetric && (
        <div className="modal-overlay" onClick={() => setQuickLogMetric(null)}>
          <div className="quick-log-modal" onClick={e => e.stopPropagation()}>
            <div className="quick-log-header">
              <h2>{t('progressPage.' + quickLogMetric.labelKey)}</h2>
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
                {savingQuickLog ? t('progressPage.saving') : t('progressPage.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Entry Confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="quick-log-modal" onClick={e => e.stopPropagation()}>
            <div className="quick-log-header">
              <h2>{t('progressPage.deleteEntryTitle')}</h2>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="quick-log-body">
              <p style={{ margin: '0 0 16px', color: 'var(--text-secondary, #94a3b8)' }}>
                {t('progressPage.deleteEntryBody', { label: confirmDelete.label.toLowerCase(), value: confirmDelete.value, unit: confirmDelete.unit, date: confirmDelete.date })}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmDelete(null)}
                >
                  {t('progressPage.cancel')}
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, background: '#dc2626', borderColor: '#dc2626' }}
                  onClick={async () => {
                    const id = confirmDelete.id;
                    setConfirmDelete(null);
                    await handleDeleteMeasurement(id);
                    showSuccess?.(t('progressPage.entryDeleted'));
                  }}
                >
                  {t('progressPage.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Measurement Modal */}
      {showMeasurementModal && (
        <div className="modal-overlay" onClick={() => setShowMeasurementModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('progressPage.logAllMeasurementsTitle')}</h2>
              <button className="modal-close" onClick={() => setShowMeasurementModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveMeasurement}>
                <div className="form-group">
                  <label>{t('progressPage.formDate')}</label>
                  <input type="date" value={measurementForm.date}
                    onChange={(e) => handleMeasurementChange('date', e.target.value)} required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('progressPage.formWeightLabel', { unit: weightUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      placeholder={weightUnit === 'kg' ? '68.0' : '150.0'}
                      value={measurementForm.weight}
                      onChange={(e) => handleMeasurementChange('weight', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('progressPage.formBodyFat')}</label>
                    <input type="number" inputMode="decimal" step="0.1" placeholder="20.0"
                      value={measurementForm.bodyFat}
                      onChange={(e) => handleMeasurementChange('bodyFat', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('progressPage.formChest', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.chest}
                      onChange={(e) => handleMeasurementChange('chest', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('progressPage.formWaist', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.waist}
                      onChange={(e) => handleMeasurementChange('waist', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('progressPage.formHips', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.hips}
                      onChange={(e) => handleMeasurementChange('hips', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('progressPage.formLeftArm', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.leftArm}
                      onChange={(e) => handleMeasurementChange('leftArm', e.target.value)} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('progressPage.formRightArm', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.rightArm}
                      onChange={(e) => handleMeasurementChange('rightArm', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('progressPage.formLeftThigh', { unit: circumUnit })}</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      value={measurementForm.leftThigh}
                      onChange={(e) => handleMeasurementChange('leftThigh', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>{t('progressPage.formRightThigh', { unit: circumUnit })}</label>
                  <input type="number" inputMode="decimal" step="0.1"
                    value={measurementForm.rightThigh}
                    onChange={(e) => handleMeasurementChange('rightThigh', e.target.value)} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('progressPage.formBpSystolic')}</label>
                    <input type="number" inputMode="decimal" step="1" placeholder="120"
                      value={measurementForm.bpSystolic}
                      onChange={(e) => handleMeasurementChange('bpSystolic', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('progressPage.formBpDiastolic')}</label>
                    <input type="number" inputMode="decimal" step="1" placeholder="80"
                      value={measurementForm.bpDiastolic}
                      onChange={(e) => handleMeasurementChange('bpDiastolic', e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>{t('progressPage.formNotes')}</label>
                  <textarea placeholder={t('progressPage.formNotesPh')} rows={2}
                    value={measurementForm.notes}
                    onChange={(e) => handleMeasurementChange('notes', e.target.value)} />
                </div>

                <button type="submit" className="btn-primary full-width" disabled={savingMeasurement}>
                  {savingMeasurement ? t('progressPage.saving') : t('progressPage.saveMeasurement')}
                </button>
                <button type="button" className="btn-secondary full-width" onClick={() => setShowMeasurementModal(false)}>
                  {t('progressPage.cancel')}
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
              <h2>{t('progressPage.addPhotoTitle')}</h2>
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
                  <div className="upload-text">{t('progressPage.tapToSelectPhoto')}</div>
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />

              <div className="form-group">
                <label>{t('progressPage.photoTypeLabel')}</label>
                <select value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
                  <option value="progress">{t('progressPage.photoTypeOptProgress')}</option>
                  <option value="front">{t('progressPage.photoTypeOptFront')}</option>
                  <option value="side">{t('progressPage.photoTypeOptSide')}</option>
                  <option value="back">{t('progressPage.photoTypeOptBack')}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('progressPage.formDate')}</label>
                <input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} />
              </div>

              <button className="btn-primary full-width"
                onClick={() => { if (photoPreview) { handleUploadPhoto(); } else { photoInputRef.current?.click(); } }}
                disabled={uploadingPhoto}>
                {uploadingPhoto ? t('progressPage.uploading') : photoPreview ? t('progressPage.uploadPhoto') : t('progressPage.selectPhoto')}
              </button>
              {photoPreview && (
                <button className="btn-secondary full-width"
                  onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}>
                  {t('progressPage.chooseDifferentPhoto')}
                </button>
              )}
              <button className="btn-secondary full-width" onClick={() => setShowPhotoModal(false)}>{t('progressPage.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Selection Confirmation Modal */}
      {pendingPhoto && (
        <div className="delete-confirm-overlay" onClick={() => setPendingPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg, white)', borderRadius: '16px', padding: '24px', maxWidth: '320px', width: '100%', textAlign: 'center' }}>
            <img
              src={pendingPhoto.url || pendingPhoto.photo_url}
              alt="Selected"
              style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '12px', marginBottom: '16px' }}
            />
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>{selectedPhotos.length === 0 ? t('progressPage.useAsBeforePhoto') : t('progressPage.useAsAfterPhoto')}</h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', lineHeight: 1.5 }}>
              {selectedPhotos.length === 0
                ? t('progressPage.beforePhotoDesc')
                : t('progressPage.afterPhotoDesc')}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="delete-cancel-btn" onClick={() => setPendingPhoto(null)} style={{ flex: 1, padding: '12px 16px', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
                {t('progressPage.cancel')}
              </button>
              <button
                onClick={confirmPhotoSelection}
                style={{ flex: 1, padding: '12px 16px', background: '#4ec5b7', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, color: 'white', cursor: 'pointer' }}
              >
                {selectedPhotos.length === 0 ? t('progressPage.yesBeforeBtn') : t('progressPage.yesAfterBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {showComparison && selectedPhotos.length === 2 && createPortal(
        <div className="comparison-modal-overlay" onClick={closeComparison}>
          <div className="comparison-modal-content" onClick={e => e.stopPropagation()}>
            <div className="comparison-header">
              <h2>{t('progressPage.photoComparison')}</h2>
              <button className="comparison-close-btn" onClick={closeComparison}>
                <X size={20} />
              </button>
            </div>

            <div className="comparison-photos">
              {selectedPhotos.map((photo, i) => (
                <div key={photo.id} className="comparison-photo-card">
                  <div className="comparison-photo-label">
                    <strong>{i === 0 ? t('progressPage.labelBefore') : t('progressPage.labelAfter')}</strong>
                    {new Date(photo.taken_date || photo.date_taken).toLocaleDateString()}
                  </div>
                  <img src={photo.url || photo.photo_url} alt={i === 0 ? t('progressPage.labelBefore') : t('progressPage.labelAfter')} />
                  <div className="comparison-photo-badge">
                    {photoTypeLabels[photo.photo_type] || photo.photo_type || t('progressPage.photoTypeProgress')}
                  </div>
                </div>
              ))}
            </div>

            <div className="ai-analysis-section">
              {!aiAnalysis && (
                <button className="ai-analysis-btn" onClick={handleAiAnalysis} disabled={analyzingPhotos}>
                  <Sparkles size={18} />
                  {analyzingPhotos ? t('progressPage.analyzing') : t('progressPage.getAiAnalysis')}
                </button>
              )}
              {aiAnalysis && (
                <div>
                  <div className="ai-analysis-label">{t('progressPage.aiCoachAnalysis')}</div>
                  <div className="ai-analysis-text">{aiAnalysis}</div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Re-share badge modal (Progress > Achievements > "Share to social media") */}
      <BadgeCelebrationModal
        badge={shareBadgePreview}
        onClose={() => setShareBadgePreview(null)}
        onShare={handleShareBadgesConfirm}
        sharing={sharingBadge}
        shareBgImage={shareBgImage}
        onChangePhoto={handleChangeSharePhoto}
      />
    </div>
  );
}

export default Progress;
