import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Camera, RotateCcw, Send, Flame, ChevronDown, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiPost, apiGet } from '../utils/api';
import { useToast } from './Toast';

const STEPS = {
  INSTRUCTIONS: 'instructions',
  CAMERA: 'camera',
  PREVIEW: 'preview',
  SUCCESS: 'success'
};

function GymProofModal({ isOpen, onClose }) {
  const { clientData } = useAuth();
  const { showError } = useToast();
  const [step, setStep] = useState(STEPS.INSTRUCTIONS);
  const [photoData, setPhotoData] = useState(null);
  const [stampedPhoto, setStampedPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayProof, setTodayProof] = useState(null);
  const [streak, setStreak] = useState(0);
  const [recentProofs, setRecentProofs] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (isOpen && clientData?.id) {
      checkTodayProof();
    }
  }, [isOpen, clientData?.id]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setStep(STEPS.INSTRUCTIONS);
      setPhotoData(null);
      setStampedPhoto(null);
    }
  }, [isOpen]);

  const checkTodayProof = async () => {
    try {
      const data = await apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=7`);
      if (data?.proofs?.length) {
        const today = new Date().toISOString().split('T')[0];
        const todayEntry = data.proofs.find(p => p.proof_date === today);
        if (todayEntry) setTodayProof(todayEntry);
        setRecentProofs(data.proofs);
      }
      if (data?.streak) setStreak(data.streak);
    } catch (err) {
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

        // Draw the photo
        ctx.drawImage(img, 0, 0);

        // Create timestamp text
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        const timestampText = `${dateStr}, ${timeStr}`;
        const nameText = clientData?.client_name || '';

        // Font sizing based on image width
        const fontSize = Math.max(Math.floor(img.width / 20), 24);
        const padding = Math.floor(fontSize * 0.6);
        const bottomMargin = Math.floor(fontSize * 1.5);

        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = 'bottom';

        // Draw semi-transparent background strip at bottom
        const textHeight = fontSize * 2.8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, img.height - textHeight - bottomMargin + padding, img.width, textHeight);

        // Draw timestamp
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(timestampText, padding, img.height - bottomMargin - fontSize * 0.3);

        // Draw name
        ctx.fillText(nameText, padding, img.height - bottomMargin + fontSize * 0.9);

        // Reset shadow
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
      showError('Failed to process photo. Please try again.');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetake = () => {
    setPhotoData(null);
    setStampedPhoto(null);
    setStep(STEPS.INSTRUCTIONS);
  };

  const handleSubmit = async () => {
    if (!stampedPhoto || submitting) return;

    setSubmitting(true);
    try {
      await apiPost('/.netlify/functions/save-gym-proof', {
        clientId: clientData.id,
        coachId: clientData.coach_id,
        photoData: stampedPhoto
      });

      setStep(STEPS.SUCCESS);
      // Refresh data
      checkTodayProof();
    } catch (err) {
      showError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistory = async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    try {
      const data = await apiGet(`/.netlify/functions/save-gym-proof?clientId=${clientData.id}&limit=30`);
      if (data?.proofs) setRecentProofs(data.proofs);
      if (data?.streak) setStreak(data.streak);
    } catch (err) {
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="gym-proof-overlay" onClick={onClose}>
      <div className="gym-proof-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="gym-proof-header">
          <button className="gym-proof-close" onClick={onClose}>
            <X size={22} />
          </button>
          <h2 className="gym-proof-title">Gym Check-In</h2>
          {streak > 0 && (
            <div className="gym-proof-streak">
              <Flame size={14} />
              <span>{streak}</span>
            </div>
          )}
        </div>

        <div className="gym-proof-body">
          {/* Already checked in today */}
          {todayProof && step === STEPS.INSTRUCTIONS && (
            <div className="gym-proof-already-done">
              <div className="gym-proof-done-badge">
                <span className="done-check">&#10003;</span>
                Checked in today!
              </div>
              <img
                src={todayProof.photo_url}
                alt="Today's gym proof"
                className="gym-proof-today-img"
              />
              <p className="gym-proof-done-text">
                You already proved you hit the gym today. Come back tomorrow!
              </p>
            </div>
          )}

          {/* Step 1: Instructions */}
          {!todayProof && step === STEPS.INSTRUCTIONS && (
            <div className="gym-proof-instructions">
              <div className="gym-proof-icon-wrap">
                <Camera size={40} />
              </div>
              <h3>Gym Check-In</h3>
              <p className="gym-proof-subtitle">
                Snap a photo to prove you were at the gym. Your coach will see it.
              </p>

              <div className="gym-proof-guidelines">
                <h4>Photo Tips</h4>
                <ul>
                  <li>Take a selfie with gym equipment visible behind you</li>
                  <li>Or use a mirror to capture yourself + the gym</li>
                  <li>Make sure your face is clearly visible</li>
                  <li>Good lighting helps!</li>
                </ul>
              </div>

              <p className="gym-proof-stamp-note">
                <Clock size={14} />
                Your name and timestamp will be automatically added to the photo
              </p>

              <button
                className="gym-proof-capture-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={20} />
                Take Photo
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Step 2: Preview with stamp */}
          {step === STEPS.PREVIEW && stampedPhoto && (
            <div className="gym-proof-preview">
              <img
                src={stampedPhoto}
                alt="Your gym proof"
                className="gym-proof-preview-img"
              />
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
                  className="gym-proof-send-btn"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  <Send size={18} />
                  {submitting ? 'Sending...' : 'Send Proof'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === STEPS.SUCCESS && (
            <div className="gym-proof-success">
              <div className="gym-proof-success-icon">&#10003;</div>
              <h3>Gym Proof Sent!</h3>
              <p>Your coach can see you showed up. Keep the streak going!</p>
              {streak > 0 && (
                <div className="gym-proof-streak-big">
                  <Flame size={24} />
                  <span>{streak} day streak!</span>
                </div>
              )}
              <button className="gym-proof-done-btn" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {/* History section */}
          {recentProofs.length > 0 && (step === STEPS.INSTRUCTIONS || step === STEPS.SUCCESS) && (
            <div className="gym-proof-history-section">
              <button
                className="gym-proof-history-toggle"
                onClick={() => {
                  if (!historyExpanded) loadHistory();
                  setHistoryExpanded(!historyExpanded);
                }}
              >
                <span>Recent Check-Ins</span>
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
                    <div className="gym-proof-loading">Loading...</div>
                  ) : (
                    recentProofs.map((proof) => (
                      <div key={proof.id} className="gym-proof-history-item">
                        <img src={proof.photo_url} alt="Gym proof" />
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

export default GymProofModal;
