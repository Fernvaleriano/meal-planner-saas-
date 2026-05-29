import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Quote, Loader2, Users, Lock } from 'lucide-react';
import { apiPost } from '../utils/api';

// Downscale a selected image to a max dimension and re-encode as JPEG so the
// upload payload stays small (Netlify function bodies are size-limited).
function fileToDownscaledDataUrl(file, maxDim = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function CreateStoryModal({ clientId, onClose, onCreated }) {
  const [mode, setMode] = useState('image'); // 'image' | 'quote'
  const [imageData, setImageData] = useState(null); // data URL preview + payload
  const [caption, setCaption] = useState('');
  const [quoteText, setQuoteText] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [visibility, setVisibility] = useState('group'); // 'group' | 'coach'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setImageData(dataUrl);
    } catch (err) {
      setError('Could not load that image. Try another.');
    }
  };

  const canSubmit =
    !submitting &&
    ((mode === 'image' && imageData) || (mode === 'quote' && quoteText.trim()));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/.netlify/functions/create-client-story', {
        clientId,
        contentType: mode,
        imageBase64: mode === 'image' ? imageData : undefined,
        caption: mode === 'image' ? caption.trim() : undefined,
        quoteText: mode === 'quote' ? quoteText.trim() : undefined,
        quoteAuthor: mode === 'quote' ? quoteAuthor.trim() : undefined,
        visibility
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not post your story. Please try again.');
      setSubmitting(false);
    }
  };

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>New story</span>
          <button style={styles.iconBtn} onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        {/* Mode toggle */}
        <div style={styles.modeRow}>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'image' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('image')}
          >
            <ImageIcon size={16} /> Photo
          </button>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'quote' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('quote')}
          >
            <Quote size={16} /> Quote
          </button>
        </div>

        {mode === 'image' ? (
          <div style={styles.body}>
            {imageData ? (
              <div style={styles.previewWrap}>
                <img src={imageData} alt="Preview" style={styles.preview} />
                <button style={styles.changeBtn} onClick={() => fileRef.current?.click()}>Change photo</button>
              </div>
            ) : (
              <button style={styles.dropZone} onClick={() => fileRef.current?.click()}>
                <ImageIcon size={28} />
                <span>Tap to choose a photo</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption (optional)"
              maxLength={500}
              style={styles.input}
            />
          </div>
        ) : (
          <div style={styles.body}>
            <textarea
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="What's on your mind?"
              maxLength={500}
              rows={4}
              style={styles.textarea}
            />
            <input
              type="text"
              value={quoteAuthor}
              onChange={(e) => setQuoteAuthor(e.target.value)}
              placeholder="Attribution (optional)"
              maxLength={120}
              style={styles.input}
            />
          </div>
        )}

        {/* Visibility */}
        <div style={styles.visRow}>
          <button
            style={{ ...styles.visBtn, ...(visibility === 'group' ? styles.visBtnActive : {}) }}
            onClick={() => setVisibility('group')}
          >
            <Users size={15} /> Share with members
          </button>
          <button
            style={{ ...styles.visBtn, ...(visibility === 'coach' ? styles.visBtnActive : {}) }}
            onClick={() => setVisibility('coach')}
          >
            <Lock size={15} /> Only my coach
          </button>
        </div>
        <div style={styles.visHint}>
          {visibility === 'group'
            ? 'Your coach and the other people they coach will see this for 24 hours.'
            : 'Only your coach will see this. It still disappears after 24 hours.'}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={{ ...styles.submit, ...(canSubmit ? {} : styles.submitDisabled) }}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? <Loader2 size={18} className="spin" /> : 'Share story'}
        </button>
      </div>
    </div>,
    document.body
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10001,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
  },
  sheet: {
    width: '100%', maxWidth: 480, background: 'var(--card-bg, #fff)',
    color: 'var(--text-color, #111)', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: '14px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
    maxHeight: '92dvh', overflowY: 'auto',
    boxShadow: '0 -8px 30px rgba(0,0,0,0.25)'
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: 700 },
  iconBtn: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4 },
  modeRow: { display: 'flex', gap: 8, marginBottom: 14 },
  modeBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)',
    background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14, fontWeight: 600
  },
  modeBtnActive: { background: '#2cb5a5', borderColor: '#2cb5a5', color: '#fff' },
  body: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  dropZone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '36px 12px', borderRadius: 12, border: '2px dashed var(--border-color, #cbd5e1)',
    background: 'transparent', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', fontSize: 14
  },
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  preview: { width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12 },
  changeBtn: { background: 'none', border: 'none', color: '#2cb5a5', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  input: {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 14, boxSizing: 'border-box',
    border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--input-bg, #f8fafc)', color: 'inherit'
  },
  textarea: {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 15, boxSizing: 'border-box', resize: 'vertical',
    border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--input-bg, #f8fafc)', color: 'inherit',
    fontFamily: 'inherit'
  },
  visRow: { display: 'flex', gap: 8, marginBottom: 8 },
  visBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)',
    background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600
  },
  visBtnActive: { background: 'rgba(44,181,165,0.14)', borderColor: '#2cb5a5', color: '#0f766e' },
  visHint: { fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 12, lineHeight: 1.4 },
  error: {
    fontSize: 13, color: '#b91c1c', background: 'rgba(239,68,68,0.1)',
    padding: '8px 10px', borderRadius: 8, marginBottom: 10
  },
  submit: {
    width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#2cb5a5',
    color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  submitDisabled: { opacity: 0.5, cursor: 'not-allowed' }
};

export default CreateStoryModal;
