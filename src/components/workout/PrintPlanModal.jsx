import { useState } from 'react';
import { X, FileDown, Loader2 } from 'lucide-react';
import { generateWorkoutPDF } from '../../utils/workoutPdf';

export default function PrintPlanModal({ program, onClose }) {
  const [layout, setLayout] = useState('compact');
  const [separateDays, setSeparateDays] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateWorkoutPDF(program, {
        compact: layout === 'compact',
        includeNotes,
        separateDays
      });
      onClose();
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="print-plan-overlay" onClick={onClose}>
      <div className="print-plan-modal" onClick={e => e.stopPropagation()}>
        <div className="print-plan-header">
          <h3>Print Plan</h3>
          <button className="print-plan-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="print-plan-body">
          {/* Layout Selection */}
          <div className="print-plan-layouts">
            <label className={`print-plan-layout-opt ${layout === 'extensive' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="layout"
                value="extensive"
                checked={layout === 'extensive'}
                onChange={() => setLayout('extensive')}
              />
              <div className="layout-preview extensive">
                <div className="lp-row full" /><div className="lp-row full" />
                <div className="lp-row full" /><div className="lp-row full" />
              </div>
              <span>Extensive</span>
            </label>
            <label className={`print-plan-layout-opt ${layout === 'compact' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="layout"
                value="compact"
                checked={layout === 'compact'}
                onChange={() => setLayout('compact')}
              />
              <div className="layout-preview compact">
                <div className="lp-row half" /><div className="lp-row half" />
                <div className="lp-row half" /><div className="lp-row half" />
                <div className="lp-row half" /><div className="lp-row half" />
              </div>
              <span>Compact</span>
            </label>
          </div>

          {/* Checkboxes */}
          <div className="print-plan-options">
            <label className="print-plan-check">
              <input
                type="checkbox"
                checked={separateDays}
                onChange={e => setSeparateDays(e.target.checked)}
              />
              <span>Print every day on a different page</span>
            </label>
            <label className="print-plan-check">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={e => setIncludeNotes(e.target.checked)}
              />
              <span>Print exercise instructions</span>
            </label>
          </div>
        </div>

        <div className="print-plan-footer">
          <button className="print-plan-cancel" onClick={onClose}>Cancel</button>
          <button
            className="print-plan-download"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <><Loader2 size={16} className="wp-spinner" /> Generating...</>
            ) : (
              <><FileDown size={16} /> Download PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
