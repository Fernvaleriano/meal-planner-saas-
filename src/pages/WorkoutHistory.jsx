import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Clock,
  Flame,
  TrendingUp,
  Calendar,
  Activity,
  Target,
  X,
  Loader
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatFullDate = (dateStr) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const formatVolume = (vol) => {
  if (!vol && vol !== 0) return '0';
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`;
  return Math.round(vol).toLocaleString();
};

const formatDuration = (mins) => {
  if (!mins) return '--';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

// ---------------------------------------------------------------------------
// MiniLineChart - self-contained SVG line chart
// ---------------------------------------------------------------------------

function MiniLineChart({ data, height = 180, color = '#6366f1', label = 'Value', unit = '' }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observe container width for responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const chartMetrics = useMemo(() => {
    if (!data || data.length === 0 || containerWidth === 0) return null;

    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    const w = containerWidth;
    const h = height;
    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;

    const values = data.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const range = rawMax - rawMin || 1;
    const minVal = rawMin - range * 0.1;
    const maxVal = rawMax + range * 0.1;
    const valRange = maxVal - minVal || 1;

    const points = data.map((d, i) => ({
      x: paddingLeft + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
      y: paddingTop + plotH - ((d.value - minVal) / valRange) * plotH,
      label: d.label,
      value: d.value
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x},${paddingTop + plotH} L${points[0].x},${paddingTop + plotH} Z`;

    // Y-axis ticks (5 ticks)
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const val = minVal + (valRange * i) / 4;
      const y = paddingTop + plotH - (i / 4) * plotH;
      yTicks.push({ y, label: Math.round(val).toLocaleString() });
    }

    // X-axis labels - show a subset to avoid crowding
    const maxLabels = Math.min(data.length, Math.floor(plotW / 48));
    const step = Math.max(1, Math.ceil(data.length / maxLabels));
    const xLabels = [];
    for (let i = 0; i < data.length; i += step) {
      xLabels.push({ x: points[i].x, label: data[i].label });
    }
    // Always include the last label
    if (xLabels.length > 0 && xLabels[xLabels.length - 1].x !== points[points.length - 1].x) {
      xLabels.push({ x: points[points.length - 1].x, label: data[data.length - 1].label });
    }

    return {
      w,
      h,
      paddingLeft,
      paddingTop,
      paddingBottom,
      plotH,
      plotW,
      points,
      linePath,
      areaPath,
      yTicks,
      xLabels,
      minVal,
      maxVal
    };
  }, [data, containerWidth, height]);

  const handleMouseMove = useCallback(
    (e) => {
      if (!chartMetrics || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // Find closest point
      let closest = 0;
      let closestDist = Infinity;
      chartMetrics.points.forEach((p, i) => {
        const dist = Math.abs(p.x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setHoveredIndex(closest);
    },
    [chartMetrics]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!chartMetrics || !svgRef.current) return;
      const touch = e.touches[0];
      const rect = svgRef.current.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      let closest = 0;
      let closestDist = Infinity;
      chartMetrics.points.forEach((p, i) => {
        const dist = Math.abs(p.x - touchX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setHoveredIndex(closest);
    },
    [chartMetrics]
  );

  if (!data || data.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '14px'
        }}
      >
        No data available
      </div>
    );
  }

  if (!chartMetrics) {
    return <div ref={containerRef} style={{ width: '100%', height: `${height}px` }} />;
  }

  const { w, h, points, linePath, areaPath, yTicks, xLabels, paddingTop, plotH, paddingLeft } =
    chartMetrics;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: 'block', touchAction: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoveredIndex(null)}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={`grid-${i}`}
            x1={paddingLeft}
            y1={tick.y}
            x2={w - 20}
            y2={tick.y}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity="0.1" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoveredIndex === i ? 6 : 3}
            fill={hoveredIndex === i ? color : '#fff'}
            stroke={color}
            strokeWidth="2"
            style={{ transition: 'r 0.15s ease' }}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={`y-${i}`}
            x={paddingLeft - 8}
            y={tick.y + 4}
            textAnchor="end"
            fontSize="11"
            fill="#94a3b8"
          >
            {tick.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((xl, i) => (
          <text
            key={`x-${i}`}
            x={xl.x}
            y={paddingTop + plotH + 20}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
          >
            {xl.label}
          </text>
        ))}

        {/* Hover tooltip */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <g>
            <line
              x1={points[hoveredIndex].x}
              y1={paddingTop}
              x2={points[hoveredIndex].x}
              y2={paddingTop + plotH}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <rect
              x={points[hoveredIndex].x - 40}
              y={points[hoveredIndex].y - 30}
              width="80"
              height="22"
              rx="4"
              fill="#1e293b"
            />
            <text
              x={points[hoveredIndex].x}
              y={points[hoveredIndex].y - 15}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="#fff"
            >
              {points[hoveredIndex].value.toLocaleString()}
              {unit ? ` ${unit}` : ''}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkoutHistory Page
// ---------------------------------------------------------------------------

export default function WorkoutHistory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, clientData } = useAuth();

  // Get user's preferred weight unit (default to lbs)
  const weightUnit = clientData?.unit_preference === 'metric' ? 'kg' : 'lbs';

  // Determine which client to load data for
  const resolvedClientId = searchParams.get('clientId') || clientData?.id || null;

  // State
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail view
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Exercise drill-down
  const [expandedExerciseId, setExpandedExerciseId] = useState(null);
  const [exerciseHistory, setExerciseHistory] = useState(null);
  const [exerciseStats, setExerciseStats] = useState(null);
  const [loadingExerciseHistory, setLoadingExerciseHistory] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch workout list
  // -----------------------------------------------------------------------
  const fetchWorkouts = useCallback(async () => {
    if (!resolvedClientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(
        `/.netlify/functions/workout-logs?clientId=${resolvedClientId}&limit=50`
      );
      setWorkouts(res.workouts || []);
    } catch (err) {
      console.error('Failed to fetch workouts:', err);
      setError('Failed to load workout history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [resolvedClientId]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  // Respond to global pull-to-refresh gesture
  usePullToRefreshEvent(fetchWorkouts);

  // -----------------------------------------------------------------------
  // Fetch workout detail
  // -----------------------------------------------------------------------
  const openWorkoutDetail = useCallback(
    async (workoutId) => {
      if (selectedWorkoutId === workoutId) {
        // Toggle off
        setSelectedWorkoutId(null);
        setWorkoutDetail(null);
        setExpandedExerciseId(null);
        setExerciseHistory(null);
        setExerciseStats(null);
        return;
      }
      setSelectedWorkoutId(workoutId);
      setWorkoutDetail(null);
      setExpandedExerciseId(null);
      setExerciseHistory(null);
      setExerciseStats(null);
      setLoadingDetail(true);
      try {
        const res = await apiGet(
          `/.netlify/functions/workout-logs?workoutId=${workoutId}`
        );
        setWorkoutDetail(res.workout || null);
      } catch (err) {
        console.error('Failed to fetch workout detail:', err);
        setWorkoutDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [selectedWorkoutId]
  );

  // -----------------------------------------------------------------------
  // Fetch exercise history drill-down
  // -----------------------------------------------------------------------
  const toggleExerciseHistory = useCallback(
    async (exercise) => {
      const exId = exercise.exercise_id || exercise.id;
      if (expandedExerciseId === exId) {
        setExpandedExerciseId(null);
        setExerciseHistory(null);
        setExerciseStats(null);
        return;
      }
      setExpandedExerciseId(exId);
      setExerciseHistory(null);
      setExerciseStats(null);
      setLoadingExerciseHistory(true);
      try {
        const res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${resolvedClientId}&exerciseId=${exId}&limit=30`
        );
        setExerciseHistory(res.history || []);
        setExerciseStats(res.stats || null);
      } catch (err) {
        console.error('Failed to fetch exercise history:', err);
      } finally {
        setLoadingExerciseHistory(false);
      }
    },
    [expandedExerciseId, resolvedClientId]
  );

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const summaryStats = useMemo(() => {
    if (!workouts.length) return { total: 0, volume: 0, avgDuration: 0, calories: 0, totalSets: 0 };
    const total = workouts.length;
    const volume = workouts.reduce((s, w) => s + (w.total_volume || 0), 0);
    const durations = workouts.filter((w) => w.duration_minutes).map((w) => w.duration_minutes);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const calories = workouts.reduce((s, w) => s + (w.estimated_calories || 0), 0);
    const totalSets = workouts.reduce((s, w) => s + (w.total_sets || 0), 0);
    return { total, volume, avgDuration, calories, totalSets };
  }, [workouts]);

  // Chart data: total volume per workout, chronological, last 20
  const volumeChartData = useMemo(() => {
    const sorted = [...workouts]
      .filter((w) => w.total_volume > 0)
      .sort((a, b) => new Date(a.workout_date) - new Date(b.workout_date))
      .slice(-20);
    return sorted.map((w) => ({
      label: formatDate(w.workout_date),
      value: w.total_volume || 0
    }));
  }, [workouts]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderSummaryStats = () => (
    <div className="workout-history-stats-bar">
      <div className="workout-history-stat">
        <div className="workout-history-stat-icon">
          <Calendar size={18} />
        </div>
        <div className="workout-history-stat-value">{summaryStats.total}</div>
        <div className="workout-history-stat-label">Workouts</div>
      </div>
      <div className="workout-history-stat">
        <div className="workout-history-stat-icon">
          <Dumbbell size={18} />
        </div>
        <div className="workout-history-stat-value">{formatVolume(summaryStats.volume)}</div>
        <div className="workout-history-stat-label">Total Vol</div>
      </div>
      <div className="workout-history-stat">
        <div className="workout-history-stat-icon">
          <Clock size={18} />
        </div>
        <div className="workout-history-stat-value">{formatDuration(summaryStats.avgDuration)}</div>
        <div className="workout-history-stat-label">Avg Duration</div>
      </div>
      {summaryStats.calories > 0 ? (
        <div className="workout-history-stat">
          <div className="workout-history-stat-icon">
            <Flame size={18} />
          </div>
          <div className="workout-history-stat-value">
            {formatVolume(summaryStats.calories)}
          </div>
          <div className="workout-history-stat-label">Calories</div>
        </div>
      ) : (
        <div className="workout-history-stat">
          <div className="workout-history-stat-icon">
            <Target size={18} />
          </div>
          <div className="workout-history-stat-value">{summaryStats.totalSets}</div>
          <div className="workout-history-stat-label">Total Sets</div>
        </div>
      )}
    </div>
  );

  const renderVolumeChart = () => {
    if (volumeChartData.length < 2) return null;
    return (
      <div className="workout-history-chart-section">
        <h3 className="workout-history-section-title">
          <TrendingUp size={18} />
          Volume Progress
        </h3>
        <div className="workout-history-chart-container">
          <MiniLineChart
            data={volumeChartData}
            height={200}
            color="#6366f1"
            label="Volume"
            unit={weightUnit}
          />
        </div>
      </div>
    );
  };

  const renderExerciseSetsTable = (exercise) => {
    let setsData = exercise.sets_data;
    if (typeof setsData === 'string') {
      try {
        setsData = JSON.parse(setsData);
      } catch {
        setsData = [];
      }
    }
    if (!Array.isArray(setsData) || setsData.length === 0) {
      return (
        <div style={{ padding: '8px 0', color: '#94a3b8', fontSize: '13px' }}>
          No set data recorded
        </div>
      );
    }
    return (
      <table className="workout-history-sets-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Weight</th>
            <th>Reps</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {setsData.map((set, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>{set.weight || set.actualWeight || '--'}</td>
              <td>{set.reps || set.actualReps || '--'}</td>
              <td style={{ textTransform: 'capitalize', fontSize: '12px', color: '#94a3b8' }}>
                {set.type || set.setType || 'working'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderExerciseHistoryDrilldown = (exercise) => {
    const exId = exercise.exercise_id || exercise.id;
    if (expandedExerciseId !== exId) return null;

    if (loadingExerciseHistory) {
      return (
        <div className="workout-history-drilldown-loading">
          <Loader size={18} className="spinning" />
          Loading exercise history...
        </div>
      );
    }

    if (!exerciseHistory || exerciseHistory.length === 0) {
      return (
        <div className="workout-history-drilldown-empty">
          No history found for this exercise.
        </div>
      );
    }

    // Build chart data for max weight over time
    const weightChartData = [...exerciseHistory]
      .sort((a, b) => new Date(a.workoutDate) - new Date(b.workoutDate))
      .map((h) => ({
        label: formatDate(h.workoutDate),
        value: h.maxWeight || 0
      }));

    return (
      <div className="workout-history-drilldown">
        {/* Stats summary */}
        {exerciseStats && (
          <div className="workout-history-drilldown-stats">
            <div className="workout-history-drilldown-stat">
              <span className="workout-history-drilldown-stat-label">All-Time Max</span>
              <span className="workout-history-drilldown-stat-value">
                {exerciseStats.allTimeMaxWeight || 0} {weightUnit}
              </span>
            </div>
            <div className="workout-history-drilldown-stat">
              <span className="workout-history-drilldown-stat-label">Recent Max</span>
              <span className="workout-history-drilldown-stat-value">
                {exerciseStats.recentMaxWeight || 0} {weightUnit}
              </span>
            </div>
            <div className="workout-history-drilldown-stat">
              <span className="workout-history-drilldown-stat-label">Sessions</span>
              <span className="workout-history-drilldown-stat-value">
                {exerciseStats.totalWorkouts || 0}
              </span>
            </div>
            <div className="workout-history-drilldown-stat">
              <span className="workout-history-drilldown-stat-label">PRs</span>
              <span className="workout-history-drilldown-stat-value">
                {exerciseStats.prCount || 0}
              </span>
            </div>
          </div>
        )}

        {/* Max weight chart */}
        {weightChartData.length >= 2 && (
          <div className="workout-history-drilldown-chart">
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
              Max Weight Over Time
            </div>
            <MiniLineChart
              data={weightChartData}
              height={150}
              color="#10b981"
              label="Max Weight"
              unit={weightUnit}
            />
          </div>
        )}

        {/* Past performances table */}
        <div className="workout-history-drilldown-table-wrapper">
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
            Past Performances
          </div>
          <table className="workout-history-sets-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>Max Wt</th>
                <th>Volume</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exerciseHistory.slice(0, 15).map((h, idx) => (
                <tr key={idx}>
                  <td>{formatDate(h.workoutDate)}</td>
                  <td>{h.totalSets || '--'}</td>
                  <td>{h.totalReps || '--'}</td>
                  <td>{h.maxWeight || '--'}</td>
                  <td>{h.totalVolume ? formatVolume(h.totalVolume) : '--'}</td>
                  <td>
                    {h.isPr && (
                      <span className="workout-history-pr-badge">PR</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderWorkoutDetail = () => {
    if (!selectedWorkoutId) return null;

    if (loadingDetail) {
      return (
        <div className="workout-history-detail-card">
          <div className="workout-history-detail-loading">
            <Loader size={20} className="spinning" />
            Loading workout details...
          </div>
        </div>
      );
    }

    if (!workoutDetail) return null;

    const exercises = workoutDetail.exercises || [];

    return (
      <div className="workout-history-detail-card">
        <div className="workout-history-detail-header">
          <div>
            <h3 className="workout-history-detail-title">
              {workoutDetail.workout_name || 'Workout'}
            </h3>
            <div className="workout-history-detail-date">
              {formatFullDate(workoutDetail.workout_date)}
            </div>
          </div>
          <button
            className="workout-history-close-btn"
            onClick={() => {
              setSelectedWorkoutId(null);
              setWorkoutDetail(null);
              setExpandedExerciseId(null);
              setExerciseHistory(null);
              setExerciseStats(null);
            }}
            aria-label="Close detail view"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workout metrics row */}
        <div className="workout-history-detail-metrics">
          {workoutDetail.duration_minutes && (
            <div className="workout-history-detail-metric">
              <Clock size={14} />
              {formatDuration(workoutDetail.duration_minutes)}
            </div>
          )}
          {workoutDetail.total_volume > 0 && (
            <div className="workout-history-detail-metric">
              <Dumbbell size={14} />
              {workoutDetail.total_volume.toLocaleString()} {weightUnit}
            </div>
          )}
          {workoutDetail.total_sets > 0 && (
            <div className="workout-history-detail-metric">
              <Target size={14} />
              {workoutDetail.total_sets} sets
            </div>
          )}
          {workoutDetail.estimated_calories > 0 && (
            <div className="workout-history-detail-metric">
              <Flame size={14} />
              {workoutDetail.estimated_calories} cal
            </div>
          )}
          {workoutDetail.workout_rating && (
            <div className="workout-history-detail-metric">
              <Activity size={14} />
              {workoutDetail.workout_rating}/10
            </div>
          )}
        </div>

        {/* Exercises list */}
        {exercises.length === 0 ? (
          <div style={{ padding: '16px 0', color: '#94a3b8', fontSize: '14px' }}>
            No exercises recorded for this workout.
          </div>
        ) : (
          <div className="workout-history-exercises-list">
            {exercises.map((exercise, idx) => {
              const exId = exercise.exercise_id || exercise.id;
              const isExpanded = expandedExerciseId === exId;
              return (
                <div key={exercise.id || idx} className="workout-history-exercise-item">
                  <button
                    className="workout-history-exercise-header"
                    onClick={() => toggleExerciseHistory(exercise)}
                  >
                    <div className="workout-history-exercise-info">
                      <span className="workout-history-exercise-name">
                        {exercise.exercise_name || 'Unknown Exercise'}
                      </span>
                      <span className="workout-history-exercise-summary">
                        {exercise.total_sets || '--'} sets
                        {exercise.max_weight ? ` | ${exercise.max_weight} ${weightUnit} max` : ''}
                        {exercise.is_pr && (
                          <span className="workout-history-pr-badge" style={{ marginLeft: '6px' }}>
                            PR
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="workout-history-exercise-chevron">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {/* Inline sets table (always visible for this workout) */}
                  {isExpanded && (
                    <div className="workout-history-exercise-expanded">
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        This Workout
                      </div>
                      {renderExerciseSetsTable(exercise)}

                      {/* Drill-down history */}
                      {renderExerciseHistoryDrilldown(exercise)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderWorkoutList = () => {
    if (workouts.length === 0 && !loading) {
      return (
        <div className="workout-history-empty">
          <Dumbbell size={48} strokeWidth={1.5} />
          <h3>No workouts yet</h3>
          <p>Complete your first workout to start tracking your progress.</p>
        </div>
      );
    }

    return (
      <div className="workout-history-list">
        {workouts.map((workout) => {
          const isSelected = selectedWorkoutId === workout.id;
          return (
            <div key={workout.id}>
              <button
                className={`workout-history-card ${isSelected ? 'workout-history-card-selected' : ''}`}
                onClick={() => openWorkoutDetail(workout.id)}
              >
                <div className="workout-history-card-left">
                  <div className="workout-history-card-date">
                    {formatDate(workout.workout_date)}
                  </div>
                  <div className="workout-history-card-name">
                    {workout.workout_name || 'Workout'}
                  </div>
                  <div className="workout-history-card-meta">
                    {workout.duration_minutes && (
                      <span>
                        <Clock size={12} /> {formatDuration(workout.duration_minutes)}
                      </span>
                    )}
                    {workout.total_sets > 0 && (
                      <span>
                        <Target size={12} /> {workout.total_sets} sets
                      </span>
                    )}
                  </div>
                </div>
                <div className="workout-history-card-right">
                  {workout.total_volume > 0 && (
                    <div className="workout-history-card-volume">
                      {formatVolume(workout.total_volume)}
                      <span className="workout-history-card-volume-label">{weightUnit}</span>
                    </div>
                  )}
                  {workout.workout_rating && (
                    <div className="workout-history-card-rating">
                      {workout.workout_rating}/10
                    </div>
                  )}
                  <ChevronDown
                    size={16}
                    className={`workout-history-card-chevron ${isSelected ? 'workout-history-card-chevron-open' : ''}`}
                  />
                </div>
              </button>

              {/* Detail view rendered inline below the selected card */}
              {isSelected && renderWorkoutDetail()}
            </div>
          );
        })}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="workout-history-page">
      {/* Header */}
      <div className="workout-history-header">
        <button
          className="workout-history-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="workout-history-title">Workout History</h1>
      </div>

      {/* Error state */}
      {error && (
        <div className="workout-history-error">
          <p>{error}</p>
          <button onClick={fetchWorkouts} className="workout-history-retry-btn">
            Try Again
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="workout-history-loading">
          <Loader size={28} className="spinning" />
          <p>Loading workout history...</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {renderSummaryStats()}
          {renderVolumeChart()}
          <div className="workout-history-list-section">
            <h3 className="workout-history-section-title">
              <Calendar size={18} />
              All Workouts
            </h3>
            {renderWorkoutList()}
          </div>
        </>
      )}
    </div>
  );
}
