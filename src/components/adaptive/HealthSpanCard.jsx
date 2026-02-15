import { Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';

function HealthSpanCard({ healthSpan, history }) {
  if (!healthSpan) return null;

  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const getTrendIcon = (change) => {
    if (change > 0) return <TrendingUp size={14} style={{ color: '#22c55e' }} />;
    if (change < 0) return <TrendingDown size={14} style={{ color: '#ef4444' }} />;
    return <Minus size={14} style={{ color: '#6b7280' }} />;
  };

  const components = [
    { label: 'Training', value: healthSpan.training, color: '#8b5cf6' },
    { label: 'Nutrition', value: healthSpan.nutrition, color: '#22c55e' },
    { label: 'Recovery', value: healthSpan.recovery, color: '#06b6d4' },
    { label: 'Consistency', value: healthSpan.consistency, color: '#f97316' }
  ];

  // Simple sparkline from history
  const maxScore = Math.max(...history.map(h => h.score), 1);
  const sparklinePoints = history
    .slice(0, 14)
    .reverse()
    .map((h, i, arr) => {
      const x = (i / Math.max(arr.length - 1, 1)) * 100;
      const y = 100 - ((h.score / maxScore) * 80 + 10);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="health-span-card">
      <div className="health-span-header">
        <div className="health-span-title">
          <Heart size={20} style={{ color: getScoreColor(healthSpan.score) }} />
          <h3>Health Span Score</h3>
        </div>
        <div className="health-span-trend">
          {getTrendIcon(healthSpan.change)}
          <span style={{ color: healthSpan.change >= 0 ? '#22c55e' : '#ef4444' }}>
            {healthSpan.change > 0 ? '+' : ''}{healthSpan.change}
          </span>
        </div>
      </div>

      {/* Main score circle */}
      <div className="health-span-score-container">
        <div className="health-span-circle">
          <svg viewBox="0 0 120 120" className="health-span-ring">
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="var(--gray-200)"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={getScoreColor(healthSpan.score)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(healthSpan.score / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="health-span-score-value">
            <span className="score-number" style={{ color: getScoreColor(healthSpan.score) }}>
              {healthSpan.score}
            </span>
            <span className="score-label">/ 100</span>
          </div>
        </div>

        {/* Sparkline */}
        {history.length > 1 && (
          <div className="health-span-sparkline">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={sparklinePoints}
                fill="none"
                stroke={getScoreColor(healthSpan.score)}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="sparkline-label">14-day trend</span>
          </div>
        )}
      </div>

      {/* Component breakdown */}
      <div className="health-span-components">
        {components.map(comp => (
          <div key={comp.label} className="health-span-component">
            <div className="component-header">
              <span className="component-label">{comp.label}</span>
              <span className="component-value">{comp.value}</span>
            </div>
            <div className="component-bar-bg">
              <div
                className="component-bar-fill"
                style={{
                  width: `${comp.value}%`,
                  background: comp.color
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {healthSpan.avg7d && (
        <div className="health-span-averages">
          <span>7d avg: {healthSpan.avg7d}</span>
          {healthSpan.avg30d && <span>30d avg: {healthSpan.avg30d}</span>}
        </div>
      )}
    </div>
  );
}

export default HealthSpanCard;
