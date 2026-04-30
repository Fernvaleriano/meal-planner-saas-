import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Camera, RotateCcw, Send, Clock, Scale, Sparkles, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost, apiGet } from '../utils/api';

const STEPS = {
  INSTRUCTIONS: 'instructions',
  PREVIEW: 'preview',
  CONFIRM: 'confirm',
  SUCCESS: 'success'
};

function WeightProofModal({ isOpen, onClose }) {
  const { clientData } = useAuth();
  const [step, setStep] = useState(STEPS.INSTRUCTIONS);
  const [photoData, setPhotoData] = useState(null);
  const [stampedPhoto, setStampedPhoto] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [todayProof, setTodayProof] = useState(null);
  const [recentProofs, setRecentProofs] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // AI-parsed weight + user-editable values
  const [parsedWeight, setParsedWeight] = useState('');
  const [parsedUnit, setParsedUnit] = useState('lbs');
  const [confidence, setConfidence] = useState('medium');
  const [analysisError, setAnalysisError] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && clientData?.id) {
      checkTodayProof();
    }
  }, [isOpen, clientData?.id]);

  useEffect(() => {
    if (!isOpen) {
      setStep(STEPS.INSTRUCTIONS);
      setPhotoData(null);
      setStampedPhoto(null);
      setParsedWeight('');
      setParsedUnit('lbs');
      setConfidence('medium');
      setAnalysisError(null);
    }
  }, [isOpen]);

  const checkTodayProof = async () => {
    try {
      const data = await apiGet(`/.netlify/functions/save-weight-proof?clientId=${clientData.id}&limit=7`);
      if (data?.proofs?.length) {
        const today = new Date().toISOString().split('T')[0];
        const todayEntry = data.proofs.find(p => p.proof_date === today);
        if (todayEntry) setTodayProof(todayEntry);
        setRecentProofs(data.proofs);
      }
    } catch (err) {
      console.error('Error checking weight proof:', err);
    }
  };

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

  const stampPhoto = useCallback((imageData) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        const timestampText = `${dateStr}, ${timeStr}`;
        const nameText = clientData?.client_name || '';

        const fontSize = Math.max(Math.floor(img.width / 20), 24);
        const padding = Math.floor(fontSize * 0.6);
        const bottomMargin = Math.floor(fontSize * 1.5);

        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = 'bottom';

        const textHeight = fontSize * 2.8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, img.height - textHeight - bottomMargin + padding, img.width, textHeight);

        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(timestampText, padding, img.height - bottomMargin - fontSize * 0.3);
        ctx.fillText(nameText, padding, img.height - bottomMargin + fontSize * 0.9);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = imageData;
    });
  }, [clientData?.client_name]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file);
      setPhotoData(compressed);
      const stamped = await stampPhoto(compressed);
      setStampedPhoto(stamped);
      setStep(STEPS.PREVIEW);
    } catch (err) {
      console.error('Error processing photo:', err);
      alert('Failed to process photo. Please try again.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyze = async () => {
    if (!stampedPhoto || analyzing) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // Send the unstamped (original-compressed) photo so the timestamp
      // overlay doesn't confuse the OCR.
      const data = await apiPost('/.netlify/functions/analyze-scale-photo', {
        image: photoData
      });

      if (data?.weight) {
        setParsedWeight(String(data.weight));
        setParsedUnit(data.unit || 'lbs');
        setConfidence(data.confidence || 'medium');
        setStep(STEPS.CONFIRM);
      } else {
        setAnalysisError('Could not read the scale. You can still enter the weight manually.');
        setParsedWeight('');
        setParsedUnit('lbs');
        setConfidence('low');
        setStep(STEPS.CONFIRM);
      }
    } catch (err) {
      console.error('Error analyzing scale:', err);
      setAnalysisError('Could not read the scale automatically. Please enter your weight manually.');
      setParsedWeight('');
      setParsedUnit('lbs');
      setConfidence('low');
      setStep(STEPS.CONFIRM);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRetake = () => {
    setPhotoData(null);
    setStampedPhoto(null);
    setParsedWeight('');
    setAnalysisError(null);
    setStep(STEPS.INSTRUCTIONS);
  };

  const handleSubmit = async () => {
    if (!stampedPhoto || submitting) return;

    const weightNum = parseFloat(parsedWeight);
    if (!weightNum || isNaN(weightNum) || weightNum <= 0 || weightNum > 1000) {
      alert('Please enter a valid weight.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/.netlify/functions/save-weight-proof', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        photoData: stampedPhoto,
        weight: weightNum,
        weightUnit: parsedUnit
      });

      setStep(STEPS.SUCCESS);
      checkTodayProof();

      // Notify other screens (e.g. Progress) to refresh measurements.
      window.dispatchEvent(new CustomEvent('app:data-changed', {
        detail: { url: '/.netlify/functions/get-measurements' }
      }));
    } catch (err) {
      console.error('Error submitting weight proof:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistory = async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    try {
      const data = await apiGet(`/.netlify/functions/save-weight-proof?clientId=${clientData.id}&limit=30`);
      if (data?.proofs) setRecentProofs(data.proofs);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  const confidenceCopy = {
    high: 'Looks clear — confirm and we\'ll log it.',
    medium: 'Double-check the number before logging.',
    low: 'Hard to read — please verify or fix the number.'
  };

  return (
    <div className="gym-proof-overlay" onClick={onClose}>
      <div className="gym-proof-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gym-proof-header">
          <button className="gym-proof-close" onClick={onClose}>
            <X size={22} />
          </button>
          <h2 className="gym-proof-title">Weigh-In</h2>
        </div>

        <div className="gym-proof-body">
          {/* Already weighed in today */}
          {todayProof && step === STEPS.INSTRUCTIONS && (
            <div className="gym-proof-already-done">
              <div className="gym-proof-done-badge">
                <span className="done-check">&#10003;</span>
                Weighed in today!
              </div>
              <img src={todayProof.photo_url} alt="Today's weigh-in" className="gym-proof-today-img" />
              <p className="weight-proof-today-value">
                {todayProof.weight} {todayProof.weight_unit}
              </p>
              <p className="gym-proof-done-text">
                You already logged your weight today. Come back tomorrow!
              </p>
            </div>
          )}

          {/* Step 1: Instructions */}
          {!todayProof && step === STEPS.INSTRUCTIONS && (
            <div className="gym-proof-instructions">
              <div className="gym-proof-icon-wrap weight-proof-icon-wrap">
                <Scale size={40} />
              </div>
              <h3>Weigh-In</h3>
              <p className="gym-proof-subtitle">
                Snap a photo of your scale. AI will read the number and log it for you.
              </p>

              <div className="gym-proof-guidelines">
                <h4>Photo Tips</h4>
                <ul>
                  <li>Stand on the scale and let the reading settle</li>
                  <li>Step off, then snap a clear top-down photo of the display</li>
                  <li>Avoid glare — good lighting on the digits helps</li>
                  <li>Make sure the full number is visible</li>
                </ul>
              </div>

              <p className="gym-proof-stamp-note">
                <Clock size={14} />
                Your name and timestamp are added automatically
              </p>

              <button
                className="gym-proof-capture-btn weight-proof-capture-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={20} />
                Take Photo
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Step 2: Preview + analyze */}
          {step === STEPS.PREVIEW && stampedPhoto && (
            <div className="gym-proof-preview">
              <img src={stampedPhoto} alt="Your scale" className="gym-proof-preview-img" />
              <div className="gym-proof-preview-actions">
                <button
                  className="gym-proof-retake-btn"
                  onClick={handleRetake}
                  disabled={analyzing}
                >
                  <RotateCcw size={18} />
                  Retake
                </button>
                <button
                  className="gym-proof-send-btn weight-proof-send-btn"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  <Sparkles size={18} />
                  {analyzing ? 'Reading scale…' : 'Read Scale'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm parsed weight */}
          {step === STEPS.CONFIRM && stampedPhoto && (
            <div className="weight-proof-confirm">
              <img src={stampedPhoto} alt="Your scale" className="weight-proof-confirm-img" />

              {analysisError ? (
                <div className="weight-proof-warning">{analysisError}</div>
              ) : (
                <div className={`weight-proof-confidence weight-proof-confidence--${confidence}`}>
                  <Sparkles size={14} />
                  <span>{confidenceCopy[confidence]}</span>
                </div>
              )}

              <label className="weight-proof-label" htmlFor="weight-proof-input">
                Weight
              </label>
              <div className="weight-proof-input-row">
                <input
                  id="weight-proof-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="1000"
                  className="weight-proof-input"
                  value={parsedWeight}
                  onChange={(e) => setParsedWeight(e.target.value)}
                  placeholder="0.0"
                  autoFocus
                />
                <select
                  className="weight-proof-unit"
                  value={parsedUnit}
                  onChange={(e) => setParsedUnit(e.target.value)}
                >
                  <option value="lbs">lbs</option>
                  <option value="kg">kg</option>
                  <option value="stone">stone</option>
                </select>
              </div>

              <div className="gym-proof-preview-actions">
                <button
                  className="gym-proof-retake-btn"
                  onClick={handleRetake}
                  disabled={submitting}
                >
                  <RotateCcw size={18} />
                  Retake
                </button>
                <button
                  className="gym-proof-send-btn weight-proof-send-btn"
                  onClick={handleSubmit}
                  disabled={submitting || !parsedWeight}
                >
                  <Send size={18} />
                  {submitting ? 'Logging…' : 'Log Weigh-In'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === STEPS.SUCCESS && (
            <div className="gym-proof-success">
              <div className="gym-proof-success-icon">&#10003;</div>
              <h3>Weigh-In Logged!</h3>
              <p>{parsedWeight} {parsedUnit} added to your progress.</p>
              <button className="gym-proof-done-btn" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {/* History */}
          {recentProofs.length > 0 && (step === STEPS.INSTRUCTIONS || step === STEPS.SUCCESS) && (
            <div className="gym-proof-history-section">
              <button
                className="gym-proof-history-toggle"
                onClick={() => {
                  if (!historyExpanded) loadHistory();
                  setHistoryExpanded(!historyExpanded);
                }}
              >
                <span>Recent Weigh-Ins</span>
                <ChevronDown
                  size={18}
                  style={{
                    transition: 'transform 0.2s ease',
                    transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                />
              </button>

              {historyExpanded && (
                <div className="gym-proof-history-grid">
                  {loadingHistory ? (
                    <div className="gym-proof-loading">Loading…</div>
                  ) : (
                    recentProofs.map((proof) => (
                      <div key={proof.id} className="gym-proof-history-item">
                        <img src={proof.photo_url} alt="Weigh-in" />
                        <span className="weight-proof-history-weight">
                          {proof.weight} {proof.weight_unit}
                        </span>
                        <span className="gym-proof-history-date">
                          {new Date(proof.proof_date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WeightProofModal;
