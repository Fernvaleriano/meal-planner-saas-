import { useState } from 'react';
import {
  AlertTriangle, AlertCircle, CheckCircle, XCircle,
  ChevronDown, ChevronUp, MessageSquare, Clock
} from 'lucide-react';

function TriageFlagsPanel({ flags, onResolve }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [resolutionNotes, setResolutionNotes] = useState({});

  if (!flags || flags.length === 0) {
    return (
      <div className="triage-panel">
        <div className="triage-header">
          <AlertTriangle size={20} />
          <h3>Client Triage</h3>
        </div>
        <div className="triage-empty">
          <CheckCircle size={32} style={{ color: '#22c55e' }} />
          <p>All clear! No client flags require attention.</p>
        </div>
      </div>
    );
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#06b6d4'
    };
    return colors[severity] || '#6b7280';
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'critical' || severity === 'high') return AlertTriangle;
    if (severity === 'medium') return AlertCircle;
    return Clock;
  };

  const getFlagTypeLabel = (type) => {
    const labels = {
      missed_workouts: 'Missed Workouts',
      low_motivation: 'Low Motivation',
      overtraining: 'Overtraining Risk',
      plateau: 'Performance Plateau',
      nutrition_slip: 'Nutrition Decline'
    };
    return labels[type] || type;
  };

  return (
    <div className="triage-panel">
      <div className="triage-header">
        <AlertTriangle size={20} />
        <h3>Client Triage</h3>
        <span className="triage-count">{flags.length} active</span>
      </div>

      <div className="triage-list">
        {flags.map(flag => {
          const isExpanded = expandedIds.has(flag.id);
          const SeverityIcon = getSeverityIcon(flag.severity);
          const severityColor = getSeverityColor(flag.severity);
          const clientName = flag.clients?.client_name || 'Client';

          return (
            <div key={flag.id} className="triage-flag-item" style={{ borderLeftColor: severityColor }}>
              <div
                className="triage-flag-main"
                onClick={() => toggleExpand(flag.id)}
              >
                <div className="triage-flag-icon" style={{ color: severityColor }}>
                  <SeverityIcon size={20} />
                </div>
                <div className="triage-flag-content">
                  <div className="triage-flag-meta">
                    <span className="triage-severity" style={{ color: severityColor }}>
                      {flag.severity.toUpperCase()}
                    </span>
                    <span className="triage-type">{getFlagTypeLabel(flag.flag_type)}</span>
                  </div>
                  <strong>{flag.title}</strong>
                  <p>{flag.description}</p>
                </div>
                <button className="triage-toggle">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {isExpanded && (
                <div className="triage-flag-details">
                  {flag.ai_suggestion && (
                    <div className="triage-ai-suggestion">
                      <MessageSquare size={14} />
                      <div>
                        <strong>AI Suggestion</strong>
                        <p>{flag.ai_suggestion}</p>
                      </div>
                    </div>
                  )}

                  <div className="triage-resolution">
                    <textarea
                      placeholder="Add resolution notes..."
                      value={resolutionNotes[flag.id] || ''}
                      onChange={(e) => setResolutionNotes(prev => ({
                        ...prev,
                        [flag.id]: e.target.value
                      }))}
                      rows={2}
                    />
                    <div className="triage-actions">
                      <button
                        className="triage-btn resolve"
                        onClick={() => onResolve(flag.id, resolutionNotes[flag.id])}
                      >
                        <CheckCircle size={14} />
                        Resolve
                      </button>
                      <button
                        className="triage-btn dismiss"
                        onClick={() => onResolve(flag.id, 'Dismissed')}
                      >
                        <XCircle size={14} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TriageFlagsPanel;
