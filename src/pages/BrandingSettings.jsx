import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, Type, ToggleLeft, MessageSquare, Smartphone, Tag, Save, RotateCcw, Loader, Check, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding, AVAILABLE_FONTS, BUTTON_STYLES, DEFAULT_TERMINOLOGY } from '../context/BrandingContext';
import { apiGet, apiPost } from '../utils/api';

const MODULE_OPTIONS = [
  { key: 'diary', label: 'Food Diary', description: 'Daily food logging and macro tracking' },
  { key: 'plans', label: 'Meal Plans', description: 'Assigned nutrition plans' },
  { key: 'workouts', label: 'Workouts', description: 'Exercise programs and logging' },
  { key: 'messages', label: 'Messages', description: 'Chat with coach' },
  { key: 'recipes', label: 'Recipes', description: 'Recipe library' },
  { key: 'check_in', label: 'Check-In', description: 'Weekly progress check-ins' },
  { key: 'progress', label: 'Progress', description: 'Photos, measurements, weight' },
];

const TERMINOLOGY_OPTIONS = [
  { key: 'home', default: 'Home' },
  { key: 'diary', default: 'Diary' },
  { key: 'plans', default: 'Meals' },
  { key: 'workouts', default: 'Workouts' },
  { key: 'messages', default: 'Messages' },
  { key: 'check_in', default: 'Check-In' },
  { key: 'progress', default: 'Progress' },
  { key: 'recipes', default: 'Recipes' },
];

const COLOR_PRESETS = [
  { name: 'Teal', primary: '#0d9488', secondary: '#0284c7', accent: '#10b981' },
  { name: 'Blue', primary: '#2563eb', secondary: '#3b82f6', accent: '#06b6d4' },
  { name: 'Purple', primary: '#7c3aed', secondary: '#8b5cf6', accent: '#a78bfa' },
  { name: 'Red', primary: '#dc2626', secondary: '#ef4444', accent: '#f97316' },
  { name: 'Green', primary: '#16a34a', secondary: '#22c55e', accent: '#10b981' },
  { name: 'Orange', primary: '#ea580c', secondary: '#f97316', accent: '#fbbf24' },
  { name: 'Pink', primary: '#db2777', secondary: '#ec4899', accent: '#f472b6' },
  { name: 'Slate', primary: '#475569', secondary: '#64748b', accent: '#94a3b8' },
];

function ColorInput({ label, value, onChange, placeholder }) {
  return (
    <div className="bs-color-field">
      <label className="bs-label">{label}</label>
      <div className="bs-color-input-row">
        <input
          type="color"
          value={value || placeholder || '#0d9488'}
          onChange={(e) => onChange(e.target.value)}
          className="bs-color-swatch"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bs-text-input bs-color-hex"
          maxLength={7}
        />
        {value && (
          <button className="bs-clear-btn" onClick={() => onChange('')} title="Reset to default">
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bs-section">
      <button className="bs-section-header" onClick={() => setOpen(!open)}>
        <div className="bs-section-title">
          <Icon size={18} />
          <span>{title}</span>
        </div>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="bs-section-body">{children}</div>}
    </div>
  );
}

function BrandingSettings() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { refreshBranding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [hasAccess, setHasAccess] = useState(false);

  // Form state — all raw values from API
  const [form, setForm] = useState({
    brand_name: '',
    brand_primary_color: '',
    brand_secondary_color: '',
    brand_accent_color: '',
    brand_bg_color: '',
    brand_bg_secondary_color: '',
    brand_card_color: '',
    brand_text_color: '',
    brand_text_secondary_color: '',
    brand_font: '',
    brand_button_style: '',
    brand_welcome_message: '',
    brand_app_name: '',
    brand_short_name: '',
    brand_email_footer: '',
    client_modules: { diary: true, plans: true, workouts: true, messages: true, recipes: true, check_in: true, progress: true },
    custom_terminology: {},
  });

  const [showPreview, setShowPreview] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;

  // Load current branding
  useEffect(() => {
    if (!clientData?.is_coach) return;

    apiGet('/.netlify/functions/get-coach-branding')
      .then(data => {
        setHasAccess(data.has_branding_access);
        if (data.raw) {
          setForm({
            brand_name: data.raw.brand_name || '',
            brand_primary_color: data.raw.brand_primary_color || '',
            brand_secondary_color: data.raw.brand_secondary_color || '',
            brand_accent_color: data.raw.brand_accent_color || '',
            brand_bg_color: data.raw.brand_bg_color || '',
            brand_bg_secondary_color: data.raw.brand_bg_secondary_color || '',
            brand_card_color: data.raw.brand_card_color || '',
            brand_text_color: data.raw.brand_text_color || '',
            brand_text_secondary_color: data.raw.brand_text_secondary_color || '',
            brand_font: data.raw.brand_font || '',
            brand_button_style: data.raw.brand_button_style || '',
            brand_welcome_message: data.raw.brand_welcome_message || '',
            brand_app_name: data.raw.brand_app_name || '',
            brand_short_name: data.raw.brand_short_name || '',
            brand_email_footer: data.raw.brand_email_footer || '',
            client_modules: data.raw.client_modules || { diary: true, plans: true, workouts: true, messages: true, recipes: true, check_in: true, progress: true },
            custom_terminology: data.raw.custom_terminology || {},
          });
        }
      })
      .catch(err => setError('Failed to load branding settings'))
      .finally(() => setLoading(false));
  }, [clientData?.is_coach]);

  const updateForm = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }, []);

  const updateModule = useCallback((key, enabled) => {
    setForm(prev => ({
      ...prev,
      client_modules: { ...prev.client_modules, [key]: enabled },
    }));
    setSaved(false);
  }, []);

  const updateTerminology = useCallback((key, value) => {
    setForm(prev => ({
      ...prev,
      custom_terminology: { ...prev.custom_terminology, [key]: value },
    }));
    setSaved(false);
  }, []);

  const applyPreset = useCallback((preset) => {
    setForm(prev => ({
      ...prev,
      brand_primary_color: preset.primary,
      brand_secondary_color: preset.secondary,
      brand_accent_color: preset.accent,
    }));
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      // Clean up terminology — remove entries that match defaults or are empty
      const cleanTerminology = {};
      for (const [key, value] of Object.entries(form.custom_terminology)) {
        if (value && value.trim() && value.trim() !== DEFAULT_TERMINOLOGY[key]) {
          cleanTerminology[key] = value.trim();
        }
      }

      const payload = {
        brand_name: form.brand_name || null,
        brand_primary_color: form.brand_primary_color || null,
        brand_secondary_color: form.brand_secondary_color || null,
        brand_accent_color: form.brand_accent_color || null,
        brand_bg_color: form.brand_bg_color || null,
        brand_bg_secondary_color: form.brand_bg_secondary_color || null,
        brand_card_color: form.brand_card_color || null,
        brand_text_color: form.brand_text_color || null,
        brand_text_secondary_color: form.brand_text_secondary_color || null,
        brand_font: form.brand_font || null,
        brand_button_style: form.brand_button_style || null,
        brand_welcome_message: form.brand_welcome_message || null,
        brand_app_name: form.brand_app_name || null,
        brand_short_name: form.brand_short_name || null,
        brand_email_footer: form.brand_email_footer || null,
        client_modules: form.client_modules,
        custom_terminology: Object.keys(cleanTerminology).length > 0 ? cleanTerminology : null,
      };

      const result = await apiPost('/.netlify/functions/save-coach-branding', payload);

      if (result.success) {
        setSaved(true);
        // Refresh branding context so changes apply immediately
        await refreshBranding();
        // Clear local caches so clients see updates
        try {
          sessionStorage.removeItem('zique_branding');
        } catch { /* ignore */ }
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('Reset all branding to defaults? This will save immediately.')) return;
    setForm({
      brand_name: '',
      brand_primary_color: '',
      brand_secondary_color: '',
      brand_accent_color: '',
      brand_bg_color: '',
      brand_bg_secondary_color: '',
      brand_card_color: '',
      brand_text_color: '',
      brand_text_secondary_color: '',
      brand_font: '',
      brand_button_style: '',
      brand_welcome_message: '',
      brand_app_name: '',
      brand_short_name: '',
      brand_email_footer: '',
      client_modules: { diary: true, plans: true, workouts: true, messages: true, recipes: true, check_in: true, progress: true },
      custom_terminology: {},
    });
    setSaved(false);
  };

  // Live preview values
  const previewPrimary = form.brand_primary_color || '#0d9488';
  const previewSecondary = form.brand_secondary_color || '#0284c7';
  const previewAccent = form.brand_accent_color || '#10b981';
  const previewBg = form.brand_bg_color || '#0f172a';
  const previewCard = form.brand_card_color || '#1e293b';
  const previewText = form.brand_text_color || '#f1f5f9';
  const previewBtnRadius = BUTTON_STYLES[form.brand_button_style] || '10px';

  if (loading) {
    return (
      <div className="bs-page">
        <div className="bs-loading"><Loader size={24} className="spin" /> Loading branding settings...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="bs-page">
        <div className="bs-header">
          <button onClick={() => navigate(-1)} className="bs-back"><ArrowLeft size={20} /></button>
          <h1>Branding</h1>
        </div>
        <div className="bs-upgrade-card">
          <Palette size={40} style={{ color: '#0d9488' }} />
          <h2>White-Label Branding</h2>
          <p>Customize your brand colors, logo, fonts, and more. Your clients will see your brand instead of ours.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>Available on the Professional plan.</p>
          <a href="/billing.html" className="bs-upgrade-btn">Upgrade Plan</a>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-page">
      {/* Header */}
      <div className="bs-header">
        <button onClick={() => navigate(-1)} className="bs-back"><ArrowLeft size={20} /></button>
        <h1>Branding Settings</h1>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`bs-preview-toggle ${showPreview ? 'active' : ''}`}
        >
          <Eye size={18} />
        </button>
      </div>

      {error && <div className="bs-error">{error}</div>}

      <div className="bs-layout">
        {/* Settings Form */}
        <div className="bs-form">

          {/* Section 1: Brand Identity */}
          <Section title="Brand Identity" icon={Palette}>
            <div className="bs-field">
              <label className="bs-label">Brand Name</label>
              <input
                type="text"
                value={form.brand_name}
                onChange={(e) => updateForm('brand_name', e.target.value)}
                placeholder="Zique Fitness Nutrition"
                className="bs-text-input"
                maxLength={100}
              />
              <span className="bs-hint">Your company/brand name shown to clients</span>
            </div>
          </Section>

          {/* Section 2: Colors */}
          <Section title="Brand Colors" icon={Palette}>
            {/* Presets */}
            <div className="bs-field">
              <label className="bs-label">Quick Presets</label>
              <div className="bs-presets">
                {COLOR_PRESETS.map(p => (
                  <button
                    key={p.name}
                    className="bs-preset-btn"
                    onClick={() => applyPreset(p)}
                    title={p.name}
                  >
                    <span className="bs-preset-dot" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.secondary})` }} />
                    <span className="bs-preset-name">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bs-color-grid">
              <ColorInput label="Primary" value={form.brand_primary_color} onChange={v => updateForm('brand_primary_color', v)} placeholder="#0d9488" />
              <ColorInput label="Secondary" value={form.brand_secondary_color} onChange={v => updateForm('brand_secondary_color', v)} placeholder="#0284c7" />
              <ColorInput label="Accent" value={form.brand_accent_color} onChange={v => updateForm('brand_accent_color', v)} placeholder="#10b981" />
            </div>

            <div className="bs-divider" />
            <label className="bs-label" style={{ marginBottom: '8px' }}>Advanced Colors</label>
            <span className="bs-hint" style={{ marginBottom: '12px', display: 'block' }}>Override background, card, and text colors. Leave blank for theme defaults.</span>
            <div className="bs-color-grid">
              <ColorInput label="Background" value={form.brand_bg_color} onChange={v => updateForm('brand_bg_color', v)} placeholder="#0f172a" />
              <ColorInput label="Card / Surface" value={form.brand_card_color} onChange={v => updateForm('brand_card_color', v)} placeholder="#1e293b" />
              <ColorInput label="Text Primary" value={form.brand_text_color} onChange={v => updateForm('brand_text_color', v)} placeholder="#f1f5f9" />
              <ColorInput label="Text Secondary" value={form.brand_text_secondary_color} onChange={v => updateForm('brand_text_secondary_color', v)} placeholder="#94a3b8" />
            </div>
          </Section>

          {/* Section 3: Typography & Style */}
          <Section title="Typography & Style" icon={Type} defaultOpen={false}>
            <div className="bs-field">
              <label className="bs-label">Font Family</label>
              <select
                value={form.brand_font || ''}
                onChange={(e) => updateForm('brand_font', e.target.value)}
                className="bs-select"
              >
                <option value="">System Default</option>
                {AVAILABLE_FONTS.filter(f => f !== 'System Default').map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <span className="bs-hint">Changes the app font for your clients</span>
            </div>

            <div className="bs-field">
              <label className="bs-label">Button Style</label>
              <div className="bs-btn-style-options">
                {Object.entries(BUTTON_STYLES).map(([style, radius]) => (
                  <button
                    key={style}
                    className={`bs-btn-style-option ${form.brand_button_style === style ? 'active' : ''}`}
                    onClick={() => updateForm('brand_button_style', form.brand_button_style === style ? '' : style)}
                  >
                    <div
                      className="bs-btn-style-preview"
                      style={{ borderRadius: radius, background: previewPrimary }}
                    >
                      Button
                    </div>
                    <span>{style.charAt(0).toUpperCase() + style.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Section 4: Module Visibility */}
          <Section title="Client Modules" icon={ToggleLeft} defaultOpen={false}>
            <span className="bs-hint" style={{ display: 'block', marginBottom: '12px' }}>
              Choose which features your clients can see. Hidden modules won't appear in their navigation.
            </span>
            {MODULE_OPTIONS.map(mod => (
              <div key={mod.key} className="bs-module-row">
                <div className="bs-module-info">
                  <div className="bs-module-name">{mod.label}</div>
                  <div className="bs-module-desc">{mod.description}</div>
                </div>
                <button
                  className={`toggle-switch ${form.client_modules[mod.key] !== false ? 'active' : ''}`}
                  onClick={() => updateModule(mod.key, !form.client_modules[mod.key])}
                >
                  <span className="toggle-knob"></span>
                </button>
              </div>
            ))}
          </Section>

          {/* Section 5: Client Welcome */}
          <Section title="Client Welcome" icon={MessageSquare} defaultOpen={false}>
            <div className="bs-field">
              <label className="bs-label">Welcome Message</label>
              <input
                type="text"
                value={form.brand_welcome_message}
                onChange={(e) => updateForm('brand_welcome_message', e.target.value)}
                placeholder="Welcome Back"
                className="bs-text-input"
                maxLength={200}
              />
              <span className="bs-hint">Shown on the login page header ({form.brand_welcome_message?.length || 0}/200)</span>
            </div>

            <div className="bs-field">
              <label className="bs-label">Email Footer</label>
              <textarea
                value={form.brand_email_footer}
                onChange={(e) => updateForm('brand_email_footer', e.target.value)}
                placeholder="Custom footer text for emails sent to clients"
                className="bs-textarea"
                maxLength={500}
                rows={3}
              />
              <span className="bs-hint">{form.brand_email_footer?.length || 0}/500</span>
            </div>
          </Section>

          {/* Section 6: PWA / App Settings */}
          <Section title="App Settings" icon={Smartphone} defaultOpen={false}>
            <div className="bs-field">
              <label className="bs-label">App Name</label>
              <input
                type="text"
                value={form.brand_app_name}
                onChange={(e) => updateForm('brand_app_name', e.target.value)}
                placeholder="Zique Fitness Meal Planner"
                className="bs-text-input"
                maxLength={100}
              />
              <span className="bs-hint">Full app name shown when clients add to homescreen</span>
            </div>

            <div className="bs-field">
              <label className="bs-label">Short Name</label>
              <input
                type="text"
                value={form.brand_short_name}
                onChange={(e) => updateForm('brand_short_name', e.target.value)}
                placeholder="Zique"
                className="bs-text-input"
                maxLength={12}
              />
              <span className="bs-hint">Shown below the app icon on homescreen ({form.brand_short_name?.length || 0}/12)</span>
            </div>
          </Section>

          {/* Section 7: Custom Terminology */}
          <Section title="Custom Labels" icon={Tag} defaultOpen={false}>
            <span className="bs-hint" style={{ display: 'block', marginBottom: '12px' }}>
              Rename navigation labels to match your coaching style. Leave blank for defaults.
            </span>
            <div className="bs-terminology-grid">
              {TERMINOLOGY_OPTIONS.map(term => (
                <div key={term.key} className="bs-term-row">
                  <span className="bs-term-default">{term.default}</span>
                  <input
                    type="text"
                    value={form.custom_terminology[term.key] || ''}
                    onChange={(e) => updateTerminology(term.key, e.target.value)}
                    placeholder={term.default}
                    className="bs-text-input bs-term-input"
                    maxLength={30}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* Action Buttons */}
          <div className="bs-actions">
            <button onClick={handleReset} className="bs-reset-btn" disabled={saving}>
              <RotateCcw size={16} /> Reset All
            </button>
            <button onClick={handleSave} className="bs-save-btn" disabled={saving}>
              {saving ? <Loader size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Live Preview Panel */}
        {showPreview && (
          <div className="bs-preview">
            <div className="bs-preview-label">Live Preview</div>
            <div className="bs-preview-phone" style={{ background: previewBg }}>
              {/* Mini header */}
              <div className="bs-preview-header" style={{ background: previewCard, borderBottom: `1px solid ${previewPrimary}22` }}>
                <div className="bs-preview-logo-circle" style={{ background: previewPrimary, borderRadius: previewBtnRadius }}>
                  {form.brand_name ? form.brand_name.charAt(0) : 'Z'}
                </div>
                <span style={{ color: previewText, fontWeight: 600, fontSize: '0.8rem' }}>
                  {form.brand_name || 'Zique Fitness'}
                </span>
              </div>

              {/* Mini card */}
              <div style={{ padding: '12px' }}>
                <div className="bs-preview-card" style={{ background: previewCard, borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: previewText, fontWeight: 600, fontSize: '0.75rem', marginBottom: '8px' }}>
                    Today's Progress
                  </div>
                  <div className="bs-preview-progress">
                    <div className="bs-preview-bar-bg" style={{ background: `${previewPrimary}22` }}>
                      <div className="bs-preview-bar-fill" style={{ background: `linear-gradient(90deg, ${previewPrimary}, ${previewSecondary})`, width: '65%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <div className="bs-preview-stat" style={{ background: `${previewPrimary}15`, color: previewPrimary, borderRadius: previewBtnRadius }}>
                      1,850 cal
                    </div>
                    <div className="bs-preview-stat" style={{ background: `${previewAccent}15`, color: previewAccent, borderRadius: previewBtnRadius }}>
                      142g protein
                    </div>
                  </div>
                </div>

                <button
                  className="bs-preview-btn"
                  style={{
                    background: `linear-gradient(135deg, ${previewPrimary}, ${previewSecondary})`,
                    borderRadius: previewBtnRadius,
                    color: '#fff',
                    marginTop: '10px',
                  }}
                >
                  Log Food
                </button>
              </div>

              {/* Mini bottom nav */}
              <div className="bs-preview-nav" style={{ background: previewCard }}>
                {['Home', 'Diary', 'Msgs', 'Train', 'Meals'].map((item, i) => (
                  <div
                    key={item}
                    className="bs-preview-nav-item"
                    style={{ color: i === 0 ? previewPrimary : (form.brand_text_secondary_color || '#94a3b8') }}
                  >
                    <div className="bs-preview-nav-dot" style={i === 0 ? { background: previewPrimary } : {}} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .bs-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 16px 100px;
        }
        .bs-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          padding: 60px 0;
          color: var(--text-secondary, #94a3b8);
        }
        .bs-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 0;
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--bg-primary, #0f172a);
        }
        .bs-header h1 {
          flex: 1;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary, #f1f5f9);
          margin: 0;
        }
        .bs-back {
          background: none;
          border: none;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          display: flex;
          align-items: center;
        }
        .bs-back:hover { background: var(--bg-secondary, #1e293b); }
        .bs-preview-toggle {
          background: none;
          border: 1px solid var(--gray-700, #334155);
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          display: flex;
          align-items: center;
        }
        .bs-preview-toggle.active {
          background: var(--brand-primary, #0d9488);
          border-color: var(--brand-primary, #0d9488);
          color: white;
        }
        .bs-error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px 16px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }
        .bs-upgrade-card {
          text-align: center;
          padding: 48px 24px;
          background: var(--bg-secondary, #1e293b);
          border-radius: 16px;
          border: 1px solid var(--gray-700, #334155);
        }
        .bs-upgrade-card h2 {
          color: var(--text-primary, #f1f5f9);
          margin: 16px 0 8px;
        }
        .bs-upgrade-card p {
          color: var(--text-secondary, #94a3b8);
          max-width: 400px;
          margin: 0 auto 16px;
        }
        .bs-upgrade-btn {
          display: inline-block;
          padding: 14px 32px;
          background: var(--brand-primary, #0d9488);
          color: white;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          margin-top: 8px;
        }
        .bs-layout {
          display: flex;
          gap: 20px;
        }
        .bs-form { flex: 1; min-width: 0; }
        .bs-preview {
          width: 260px;
          flex-shrink: 0;
          position: sticky;
          top: 70px;
          align-self: flex-start;
        }
        @media (max-width: 768px) {
          .bs-layout { flex-direction: column; }
          .bs-preview { width: 100%; position: static; }
        }

        /* Sections */
        .bs-section {
          background: var(--bg-secondary, #1e293b);
          border-radius: 12px;
          border: 1px solid var(--gray-700, #334155);
          margin-bottom: 12px;
          overflow: hidden;
        }
        .bs-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 16px;
          background: none;
          border: none;
          color: var(--text-primary, #f1f5f9);
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .bs-section-header:hover { background: rgba(255,255,255,0.03); }
        .bs-section-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bs-section-body {
          padding: 0 16px 16px;
        }
        .bs-divider {
          height: 1px;
          background: var(--gray-700, #334155);
          margin: 16px 0;
        }

        /* Fields */
        .bs-field { margin-bottom: 16px; }
        .bs-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary, #94a3b8);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bs-hint {
          font-size: 0.75rem;
          color: var(--gray-500, #64748b);
          margin-top: 4px;
        }
        .bs-text-input, .bs-select, .bs-textarea {
          width: 100%;
          padding: 10px 12px;
          background: var(--bg-primary, #0f172a);
          border: 1px solid var(--gray-700, #334155);
          border-radius: 8px;
          color: var(--text-primary, #f1f5f9);
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .bs-text-input:focus, .bs-select:focus, .bs-textarea:focus {
          border-color: var(--brand-primary, #0d9488);
        }
        .bs-textarea { resize: vertical; }

        /* Color inputs */
        .bs-color-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 500px) { .bs-color-grid { grid-template-columns: 1fr; } }
        .bs-color-field { margin-bottom: 4px; }
        .bs-color-input-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bs-color-swatch {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          padding: 0;
          background: none;
          flex-shrink: 0;
        }
        .bs-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
        .bs-color-swatch::-webkit-color-swatch { border-radius: 6px; border: 2px solid rgba(255,255,255,0.15); }
        .bs-color-hex { flex: 1; font-family: monospace; }
        .bs-clear-btn {
          background: none;
          border: none;
          color: var(--gray-500);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
        }
        .bs-clear-btn:hover { background: var(--bg-secondary, #1e293b); }

        /* Presets */
        .bs-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .bs-preset-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--bg-primary, #0f172a);
          border: 1px solid var(--gray-700, #334155);
          border-radius: 8px;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s;
        }
        .bs-preset-btn:hover {
          border-color: var(--text-secondary);
        }
        .bs-preset-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Button style options */
        .bs-btn-style-options {
          display: flex;
          gap: 12px;
        }
        .bs-btn-style-option {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--bg-primary, #0f172a);
          border: 2px solid var(--gray-700, #334155);
          border-radius: 10px;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.15s;
        }
        .bs-btn-style-option.active {
          border-color: var(--brand-primary, #0d9488);
          color: var(--text-primary, #f1f5f9);
        }
        .bs-btn-style-preview {
          padding: 6px 16px;
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
        }

        /* Module toggles */
        .bs-module-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid var(--gray-700, #334155);
        }
        .bs-module-row:last-child { border-bottom: none; }
        .bs-module-name {
          font-weight: 600;
          color: var(--text-primary, #f1f5f9);
          font-size: 0.9rem;
        }
        .bs-module-desc {
          font-size: 0.75rem;
          color: var(--gray-500, #64748b);
          margin-top: 2px;
        }

        /* Terminology */
        .bs-terminology-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bs-term-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .bs-term-default {
          width: 80px;
          flex-shrink: 0;
          font-size: 0.8rem;
          color: var(--gray-500, #64748b);
          text-align: right;
        }
        .bs-term-input { flex: 1; }

        /* Actions */
        .bs-actions {
          display: flex;
          gap: 12px;
          padding: 20px 0;
          position: sticky;
          bottom: 70px;
          background: var(--bg-primary, #0f172a);
          z-index: 5;
        }
        .bs-reset-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 20px;
          background: none;
          border: 1px solid var(--gray-700, #334155);
          border-radius: 10px;
          color: var(--text-secondary, #94a3b8);
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
        }
        .bs-reset-btn:hover { background: var(--bg-secondary, #1e293b); }
        .bs-save-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          background: var(--brand-primary, #0d9488);
          border: none;
          border-radius: 10px;
          color: white;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .bs-save-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13,148,136,0.4); }
        .bs-save-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Preview */
        .bs-preview-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          text-align: center;
        }
        .bs-preview-phone {
          border-radius: 20px;
          border: 2px solid var(--gray-700, #334155);
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        }
        .bs-preview-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
        }
        .bs-preview-logo-circle {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 0.75rem;
          flex-shrink: 0;
        }
        .bs-preview-card { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
        .bs-preview-progress { margin-top: 6px; }
        .bs-preview-bar-bg {
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
        }
        .bs-preview-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s;
        }
        .bs-preview-stat {
          padding: 4px 8px;
          font-size: 0.65rem;
          font-weight: 600;
        }
        .bs-preview-btn {
          display: block;
          width: 100%;
          padding: 10px;
          border: none;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: default;
          margin-left: 0;
        }
        .bs-preview-nav {
          display: flex;
          justify-content: space-around;
          padding: 8px 4px;
          margin-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .bs-preview-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font-size: 0.55rem;
          font-weight: 500;
        }
        .bs-preview-nav-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

export default BrandingSettings;
