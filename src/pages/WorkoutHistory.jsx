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
import { getDateLocale } from '../utils/dateLocale';
import { convertWeight } from '../utils/workoutProgression';
import { logHasEffort } from '../utils/workoutEvidence';
import { usePullToRefreshEvent } from '../hooks/usePullToRefreshEvent';
import CoachReactionBadge from '../components/CoachReactionBadge';
import { useClientReactions } from '../hooks/useClientReactions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatDateWithDay = (dateStr) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(getDateLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

const PROGRAM_TYPE_COLORS = {
  hypertrophy: '#a855f7',
  strength: '#ef4444',
  endurance: '#10b981',
  flexibility: '#06b6d4',
  custom: '#64748b'
};

const PROGRAM_TYPE_LABELS = {
  all: 'All',
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  endurance: 'Endurance',
  flexibility: 'Mobility',
  custom: 'Other'
};

const formatFullDate = (dateStr) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(getDateLocale(), {
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

// Round a number up to a "nice" axis value (1, 2, 5 × 10^n).
function niceCeil(x) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

function formatTick(val) {
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return Math.round(val).toLocaleString();
}

function MiniLineChart({ data, height = 180, color = '#22998a', unit = '', allowNegative = false }) {
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

    // Clamp lower bound at 0 for non-negative metrics so the y-axis
    // never reports impossible values like -1,086 for total volume.
    let minVal = allowNegative ? rawMin : Math.max(0, rawMin);
    let maxVal = niceCeil(rawMax > 0 ? rawMax * 1.05 : 1);
    if (maxVal <= minVal) maxVal = minVal + 1;
    const valRange = maxVal - minVal || 1;

    const points = data.map((d, i) => ({
      x: paddingLeft + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
      y: paddingTop + plotH - ((d.value - minVal) / valRange) * plotH,
      label: d.label,
      value: d.value
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x},${paddingTop + plotH} L${points[0].x},${paddingTop + plotH} Z`;

    // Y-axis ticks (5 ticks, evenly spaced between 0 and the nice max)
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const val = minVal + (valRange * i) / 4;
      const y = paddingTop + plotH - (i / 4) * plotH;
      yTicks.push({ y, label: formatTick(val) });
    }

    // X-axis labels - evenly distributed (always include first and last)
    const targetLabelCount = Math.min(data.length, Math.max(2, Math.floor(plotW / 60)));
    const xLabels = [];
    if (data.length === 1) {
      xLabels.push({ x: points[0].x, label: data[0].label });
    } else {
      for (let i = 0; i < targetLabelCount; i++) {
        const idx = Math.round((i / (targetLabelCount - 1)) * (data.length - 1));
        xLabels.push({ x: points[idx].x, label: data[idx].label });
      }
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
  }, [data, containerWidth, height, allowNegative]);

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

// Convert a fetched workout's per-set weights to the viewer's unit using each
// set's own stored unit stamp (data is stored as-entered), then recompute the
// per-exercise max/volume and the workout volume from the converted sets so
// every number on the detail card is consistent and matches the editor.
function normalizeWorkoutToViewerUnit(workout, viewerUnit) {
  if (!workout || !Array.isArray(workout.exercises)) return workout;
  let workoutVol = 0;
  let anyConverted = false;
  const exercises = workout.exercises.map((ex) => {
    let sd = ex.sets_data;
    if (typeof sd === 'string') {
      try { sd = JSON.parse(sd); } catch { sd = []; }
    }
    if (!Array.isArray(sd) || sd.length === 0) return ex;
    anyConverted = true;
    let exMax = 0;
    let exVol = 0;
    const sets = sd.map((s) => {
      const fromUnit = s.weightUnit || viewerUnit;
      const w = convertWeight(Number(s.weight ?? s.actualWeight) || 0, fromUnit, viewerUnit);
      const reps = Number(s.reps ?? s.actualReps) || 0;
      if (w > exMax) exMax = w;
      exVol += reps * w;
      return { ...s, weight: w, weightUnit: viewerUnit };
    });
    workoutVol += exVol;
    return {
      ...ex,
      sets_data: sets,
      max_weight: Math.round(exMax * 10) / 10,
      total_volume: Math.round(exVol * 10) / 10,
    };
  });
  return {
    ...workout,
    exercises,
    ...(anyConverted ? { total_volume: Math.round(workoutVol) } : {}),
  };
}

// Same idea for the exercise drill-down: the exercise-history endpoint sends
// each session's setsData (with per-set unit stamps). Recompute every
// session's max/volume and the all-time/recent stats from the converted
// sets so the drill-down agrees with the detail card and the editor.
function normalizeExerciseHistoryToViewerUnit(history, stats, viewerUnit) {
  if (!Array.isArray(history)) return { history: [], stats };
  const norm = history.map((h) => {
    let sd = h.setsData;
    if (typeof sd === 'string') {
      try { sd = JSON.parse(sd); } catch { sd = []; }
    }
    if (!Array.isArray(sd) || sd.length === 0) return h;
    let mx = 0;
    let vol = 0;
    sd.forEach((s) => {
      const w = convertWeight(
        Number(s.weight ?? s.actualWeight) || 0,
        s.weightUnit || viewerUnit,
        viewerUnit
      );
      const reps = Number(s.reps ?? s.actualReps) || 0;
      if (w > mx) mx = w;
      vol += reps * w;
    });
    return { ...h, maxWeight: Math.round(mx * 10) / 10, totalVolume: Math.round(vol) };
  });
  const maxes = norm.map((h) => h.maxWeight).filter((w) => w > 0);
  const vols = norm.map((h) => h.totalVolume).filter((v) => v > 0);
  const newStats = stats
    ? {
        ...stats,
        allTimeMaxWeight: maxes.length ? Math.round(Math.max(...maxes) * 10) / 10 : 0,
        recentMaxWeight: maxes.length ? maxes[0] : 0,
        totalVolume: vols.reduce((a, b) => a + b, 0),
      }
    : stats;
  return { history: norm, stats: newStats };
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

  // Coach reactions on workouts so we can show a small badge on the cards
  // the coach has reacted to.
  const { getReaction: getWorkoutReaction } = useClientReactions('workout');

  // Detail view
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Mirrors selectedWorkoutId so in-flight fetches can detect they're stale
  // (user selected something else before the response arrived).
  const selectedWorkoutIdRef = useRef(null);

  // Exercise drill-down
  const [expandedExerciseId, setExpandedExerciseId] = useState(null);
  // Same stale-response guard for the exercise drill-down.
  const expandedExerciseIdRef = useRef(null);
  const [exerciseHistory, setExerciseHistory] = useState(null);
  const [exerciseStats, setExerciseStats] = useState(null);
  const [loadingExerciseHistory, setLoadingExerciseHistory] = useState(false);

  // Active program-type filter
  const [activeFilter, setActiveFilter] = useState('all');

  // -----------------------------------------------------------------------
  // Fetch workout list
  // -----------------------------------------------------------------------
  const fetchWorkouts = useCallback(async () => {
    if (!resolvedClientId) {
      setLoading(false);
      return;
    }
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
        selectedWorkoutIdRef.current = null;
        expandedExerciseIdRef.current = null;
        setSelectedWorkoutId(null);
        setWorkoutDetail(null);
        setExpandedExerciseId(null);
        setExerciseHistory(null);
        setExerciseStats(null);
        return;
      }
      selectedWorkoutIdRef.current = workoutId;
      expandedExerciseIdRef.current = null;
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
        // Stale response — the user selected a different workout (or closed
        // the detail view) while this request was in flight.
        if (selectedWorkoutIdRef.current !== workoutId) return;
        setWorkoutDetail(res.workout || null);
      } catch (err) {
        console.error('Failed to fetch workout detail:', err);
        if (selectedWorkoutIdRef.current === workoutId) setWorkoutDetail(null);
      } finally {
        if (selectedWorkoutIdRef.current === workoutId) setLoadingDetail(false);
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
        expandedExerciseIdRef.current = null;
        setExpandedExerciseId(null);
        setExerciseHistory(null);
        setExerciseStats(null);
        return;
      }
      expandedExerciseIdRef.current = exId;
      setExpandedExerciseId(exId);
      setExerciseHistory(null);
      setExerciseStats(null);
      // Without a real exercise_id there is nothing to query — exercise.id is
      // the exercise_logs ROW id and would produce a guaranteed-empty result.
      // Expand with the existing "No history found" empty state instead.
      if (!exercise.exercise_id) return;
      setLoadingExerciseHistory(true);
      try {
        const res = await apiGet(
          `/.netlify/functions/exercise-history?clientId=${resolvedClientId}&exerciseId=${exId}&limit=30`
        );
        // Stale response — a different exercise was expanded (or this one
        // collapsed) while the request was in flight.
        if (expandedExerciseIdRef.current !== exId) return;
        {
          const normalized = normalizeExerciseHistoryToViewerUnit(
            res.history || [],
            res.stats || null,
            weightUnit
          );
          setExerciseHistory(normalized.history);
          setExerciseStats(normalized.stats);
        }
      } catch (err) {
        console.error('Failed to fetch exercise history:', err);
      } finally {
        if (expandedExerciseIdRef.current === exId) setLoadingExerciseHistory(false);
      }
    },
    [expandedExerciseId, resolvedClientId, weightUnit]
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

  // Infer a coarse program type for accent color + filter chips.
  // Uses workout_name keywords since the API doesn't return program_type on logs.
  const categorizeWorkout = useCallback((workout) => {
    const name = (workout.workout_name || '').toLowerCase();
    if (/hypertrophy|bodybuild|split/.test(name)) return 'hypertrophy';
    if (/strength|powerlifting|5x5|deadlift|squat|bench|3 day/.test(name)) return 'strength';
    if (/cardio|hiit|endurance|running|cycling/.test(name)) return 'endurance';
    if (/mobility|stretch|yoga|flex/.test(name)) return 'flexibility';
    return 'custom';
  }, []);

  // Available filter chips, only show categories with workouts.
  const filterCounts = useMemo(() => {
    const counts = { all: workouts.length };
    workouts.forEach((w) => {
      const cat = categorizeWorkout(w);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [workouts, categorizeWorkout]);

  // Apply the active filter then group by ISO week.
  const groupedWorkouts = useMemo(() => {
    const filtered = workouts.filter((w) => {
      if (activeFilter === 'all') return true;
      return categorizeWorkout(w) === activeFilter;
    });

    const groups = []; // [{ key, label, items: [] }]
    const groupIndex = new Map();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    filtered.forEach((w) => {
      const d = new Date(w.workout_date + 'T00:00:00');
      // Start of week (Monday)
      const day = d.getDay(); // 0=Sun
      const offset = (day + 6) % 7;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - offset);
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);

      let label;
      const diffDays = Math.round((startOfToday - weekStart) / 86400000);
      if (diffDays >= 0 && diffDays < 7) label = 'This Week';
      else if (diffDays >= 7 && diffDays < 14) label = 'Last Week';
      else {
        label = weekStart.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric' });
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        label = `Week of ${label}`;
      }

      if (!groupIndex.has(key)) {
        groupIndex.set(key, groups.length);
        groups.push({ key, label, items: [] });
      }
      groups[groupIndex.get(key)].items.push(w);
    });

    return groups;
  }, [workouts, activeFilter, categorizeWorkout]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderSummaryStats = () => (
    <div className="workout-history-stats-bar">
      <div className="workout-history-stat" style={{ '--stat-accent': '#22998a' }}>
        <div className="workout-history-stat-icon">
          <Calendar size={18} />
        </div>
        <div className="workout-history-stat-value">{summaryStats.total}</div>
        <div className="workout-history-stat-label">Workouts</div>
      </div>
      <div className="workout-history-stat" style={{ '--stat-accent': '#10b981' }}>
        <div className="workout-history-stat-icon">
          <Clock size={18} />
        </div>
        <div className="workout-history-stat-value">{formatDuration(summaryStats.avgDuration)}</div>
        <div className="workout-history-stat-label">Avg Duration</div>
      </div>
      {summaryStats.calories > 0 ? (
        <div className="workout-history-stat" style={{ '--stat-accent': '#f59e0b' }}>
          <div className="workout-history-stat-icon">
            <Flame size={18} />
          </div>
          <div className="workout-history-stat-value">
            {formatVolume(summaryStats.calories)}
          </div>
          <div className="workout-history-stat-label">Calories</div>
        </div>
      ) : (
        <div className="workout-history-stat" style={{ '--stat-accent': '#f59e0b' }}>
          <div className="workout-history-stat-icon">
            <Target size={18} />
          </div>
          <div className="workout-history-stat-value">{summaryStats.totalSets}</div>
          <div className="workout-history-stat-label">Total Sets</div>
        </div>
      )}
    </div>
  );

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

    const wd = normalizeWorkoutToViewerUnit(workoutDetail, weightUnit);
    const exercises = wd.exercises || [];

    return (
      <div className="workout-history-detail-card">
        <div className="workout-history-detail-header">
          <div>
            <h3 className="workout-history-detail-title">
              {wd.workout_name || 'Workout'}
            </h3>
            <div className="workout-history-detail-date">
              {formatFullDate(wd.workout_date)}
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
          {wd.duration_minutes && (
            <div className="workout-history-detail-metric">
              <Clock size={14} />
              {formatDuration(wd.duration_minutes)}
            </div>
          )}
          {wd.total_volume > 0 && (
            <div className="workout-history-detail-metric">
              <Dumbbell size={14} />
              {wd.total_volume.toLocaleString()} {weightUnit}
            </div>
          )}
          {wd.total_sets > 0 && (
            <div className="workout-history-detail-metric">
              <Target size={14} />
              {wd.total_sets} sets
            </div>
          )}
          {wd.estimated_calories > 0 && (
            <div className="workout-history-detail-metric">
              <Flame size={14} />
              {wd.estimated_calories} cal
            </div>
          )}
          {wd.workout_rating && (
            <div className="workout-history-detail-metric">
              <Activity size={14} />
              {wd.workout_rating}/10
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

  const renderFilterChips = () => {
    if (workouts.length === 0) return null;
    const order = ['all', 'hypertrophy', 'strength', 'endurance', 'flexibility', 'custom'];
    const visible = order.filter((k) => k === 'all' || filterCounts[k] > 0);
    if (visible.length <= 2) return null; // not worth showing if everything is one bucket
    return (
      <div className="workout-history-chips" role="tablist" aria-label="Filter by type">
        {visible.map((key) => {
          const count = filterCounts[key] || 0;
          const accent = PROGRAM_TYPE_COLORS[key] || '#22998a';
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              className={`workout-history-chip ${isActive ? 'is-active' : ''}`}
              style={isActive ? { '--chip-accent': accent } : undefined}
              onClick={() => setActiveFilter(key)}
            >
              {PROGRAM_TYPE_LABELS[key] || key}
              <span className="workout-history-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderWorkoutCard = (workout) => {
    const isSelected = selectedWorkoutId === workout.id;
    const category = categorizeWorkout(workout);
    const accent = PROGRAM_TYPE_COLORS[category];
    const workedOut = logHasEffort(workout);
    return (
      <div key={workout.id}>
        <button
          className={`workout-history-card ${isSelected ? 'workout-history-card-selected' : ''}`}
          style={{ '--card-accent': accent }}
          onClick={() => openWorkoutDetail(workout.id)}
        >
          <div className="workout-history-card-left">
            <div className="workout-history-card-date">
              {formatDateWithDay(workout.workout_date)}
            </div>
            <div className="workout-history-card-name">
              {workout.workout_name || 'Workout'}
              <span className={`workout-history-status ${workedOut ? 'worked-out' : 'missed'}`}>
                {workedOut ? (
                  <><Activity size={11} /> Worked out</>
                ) : (
                  <><X size={11} /> Missed</>
                )}
              </span>
            </div>
            <div className="workout-history-card-meta">
              <span>
                <Target size={12} /> {workout.total_sets || 0} sets
              </span>
              <span>
                <Clock size={12} /> {workout.duration_minutes ? formatDuration(workout.duration_minutes) : '—'}
              </span>
            </div>
          </div>
          <div className="workout-history-card-right">
            {(() => {
              const coachReaction = getWorkoutReaction('workout', workout.id);
              return (
                <CoachReactionBadge
                  reaction={coachReaction}
                  title={`Coach reacted ${coachReaction?.reaction || ''}`}
                />
              );
            })()}
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

    if (groupedWorkouts.length === 0) {
      return (
        <div className="workout-history-empty">
          <p>No workouts match this filter.</p>
        </div>
      );
    }

    return (
      <div className="workout-history-groups">
        {groupedWorkouts.map((group) => (
          <div key={group.key} className="workout-history-group">
            <div className="workout-history-group-header">
              <span>{group.label}</span>
              <span className="workout-history-group-count">
                {group.items.length} {group.items.length === 1 ? 'workout' : 'workouts'}
              </span>
            </div>
            <div className="workout-history-list">
              {group.items.map((w) => renderWorkoutCard(w))}
            </div>
          </div>
        ))}
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
          <div className="workout-history-list-section">
            <h3 className="workout-history-section-title">
              <Calendar size={18} />
              All Workouts
            </h3>
            {renderFilterChips()}
            {renderWorkoutList()}
          </div>
        </>
      )}
    </div>
  );
}
