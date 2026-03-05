import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Muscle group → SVG path mapping
// Each muscle region is defined as SVG path(s) for front and/or back view
// of a simplified human body silhouette.
// ---------------------------------------------------------------------------

const BODY_WIDTH = 160;
const BODY_HEIGHT = 340;

// Body outline paths (just the silhouette, no fill)
const BODY_FRONT_OUTLINE = `
  M80,8 C68,8 60,16 60,28 C60,40 68,50 80,50 C92,50 100,40 100,28 C100,16 92,8 80,8 Z
  M80,50 L80,54
  M60,60 C54,60 40,62 30,68 L22,90 L28,92 L44,74
  M100,60 C106,60 120,62 130,68 L138,90 L132,92 L116,74
  M56,60 L56,140 L52,200 L48,260 L56,262 L68,200 L80,200 L92,200 L104,262 L112,260 L108,200 L104,140 L104,60
  M68,200 L62,270 L58,320 L64,324 L76,270
  M92,200 L98,270 L102,320 L96,324 L84,270
`;

// Individual muscle region paths - FRONT VIEW
const FRONT_MUSCLES = {
  chest: {
    paths: [
      'M58,68 Q60,60 68,58 L78,62 L78,82 Q68,84 58,78 Z',
      'M102,68 Q100,60 92,58 L82,62 L82,82 Q92,84 102,78 Z',
    ],
    label: 'Chest',
    cx: 80, cy: 72,
  },
  shoulders: {
    paths: [
      'M54,58 Q46,60 40,66 L44,74 Q50,66 58,64 Z',
      'M106,58 Q114,60 120,66 L116,74 Q110,66 102,64 Z',
    ],
    label: 'Shoulders',
    cx: 80, cy: 62,
  },
  biceps: {
    paths: [
      'M40,72 Q36,82 32,92 L38,94 Q42,84 44,76 Z',
      'M120,72 Q124,82 128,92 L122,94 Q118,84 116,76 Z',
    ],
    label: 'Biceps',
    cx: 36, cy: 83,
  },
  triceps: {
    paths: [
      'M44,74 Q42,84 38,94 L32,92 Q34,84 36,76 Z',
      'M116,74 Q118,84 122,94 L128,92 Q126,84 124,76 Z',
    ],
    label: 'Triceps',
    cx: 124, cy: 83,
  },
  core: {
    paths: [
      'M68,86 L92,86 L92,136 L68,136 Z',
    ],
    label: 'Core',
    cx: 80, cy: 111,
  },
  legs: {
    paths: [
      // Quads front
      'M58,146 L76,146 L72,200 L56,200 Z',
      'M84,146 L102,146 L104,200 L88,200 Z',
      // Calves front
      'M60,224 L74,224 L72,270 L62,270 Z',
      'M86,224 L100,224 L98,270 L88,270 Z',
    ],
    label: 'Legs',
    cx: 80, cy: 172,
  },
  glutes: {
    paths: [],
    label: 'Glutes',
    cx: 80, cy: 154,
  },
};

// Individual muscle region paths - BACK VIEW
const BACK_MUSCLES = {
  back: {
    paths: [
      'M62,62 L78,62 L78,100 L62,100 Z',
      'M82,62 L98,62 L98,100 L82,100 Z',
      // Lower back
      'M66,102 L94,102 L92,136 L68,136 Z',
    ],
    label: 'Back',
    cx: 80, cy: 92,
  },
  shoulders: {
    paths: [
      'M54,58 Q46,60 40,66 L44,74 Q50,66 58,64 Z',
      'M106,58 Q114,60 120,66 L116,74 Q110,66 102,64 Z',
    ],
    label: 'Shoulders',
    cx: 80, cy: 62,
  },
  triceps: {
    paths: [
      'M40,72 Q36,82 32,92 L38,94 Q42,84 44,76 Z',
      'M120,72 Q124,82 128,92 L122,94 Q118,84 116,76 Z',
    ],
    label: 'Triceps',
    cx: 124, cy: 83,
  },
  glutes: {
    paths: [
      'M60,140 L78,140 L76,170 L58,170 Z',
      'M82,140 L100,140 L102,170 L84,170 Z',
    ],
    label: 'Glutes',
    cx: 80, cy: 155,
  },
  legs: {
    paths: [
      // Hamstrings
      'M58,172 L76,172 L74,216 L60,216 Z',
      'M84,172 L102,172 L100,216 L86,216 Z',
      // Calves back
      'M60,224 L74,224 L72,270 L62,270 Z',
      'M86,224 L100,224 L98,270 L88,270 Z',
    ],
    label: 'Legs',
    cx: 80, cy: 194,
  },
};

// Normalize muscle_group string to one of our known keys
const normalizeMuscle = (raw) => {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  const mapping = {
    chest: 'chest', pec: 'chest', pecs: 'chest', pectoral: 'chest',
    back: 'back', lat: 'back', lats: 'back', 'upper back': 'back', 'lower back': 'back',
    traps: 'back', trapezius: 'back', rhomboid: 'back',
    shoulder: 'shoulders', shoulders: 'shoulders', delt: 'shoulders', delts: 'shoulders', deltoid: 'shoulders',
    bicep: 'biceps', biceps: 'biceps',
    tricep: 'triceps', triceps: 'triceps',
    arm: 'biceps', arms: 'biceps',
    leg: 'legs', legs: 'legs', quad: 'legs', quads: 'legs', quadriceps: 'legs',
    hamstring: 'legs', hamstrings: 'legs', calf: 'legs', calves: 'legs',
    glute: 'glutes', glutes: 'glutes', gluteus: 'glutes', hip: 'glutes', hips: 'glutes',
    core: 'core', ab: 'core', abs: 'core', abdominal: 'core', oblique: 'core', obliques: 'core',
    cardio: 'cardio', 'full body': 'cardio', full_body: 'cardio',
    flexibility: null,
  };

  // Direct match
  if (mapping[lower] !== undefined) return mapping[lower];

  // Check if any key is a prefix
  for (const [key, val] of Object.entries(mapping)) {
    if (lower.startsWith(key)) return val;
  }

  return null;
};

// Body silhouette component
function BodySilhouette({ activeMuscles, secondaryMuscles, side = 'front' }) {
  const muscleDefs = side === 'front' ? FRONT_MUSCLES : BACK_MUSCLES;

  return (
    <svg
      viewBox={`0 0 ${BODY_WIDTH} ${BODY_HEIGHT}`}
      width="100%"
      height="100%"
      style={{ maxWidth: 120, maxHeight: 260 }}
    >
      {/* Head */}
      <ellipse cx="80" cy="28" rx="18" ry="20" className="muscle-map-inactive" />

      {/* Neck */}
      <rect x="74" y="48" width="12" height="10" className="muscle-map-inactive" style={{ stroke: 'none' }} />

      {/* Torso outline */}
      <path
        d="M56,58 L56,140 Q56,146 60,146 L100,146 Q104,146 104,140 L104,58 Q104,54 96,54 L64,54 Q56,54 56,58 Z"
        className="muscle-map-inactive"
      />

      {/* Arms */}
      <path d="M56,60 Q46,62 40,68 L32,92 L38,96 L48,74 L56,68" className="muscle-map-inactive" />
      <path d="M104,60 Q114,62 120,68 L128,92 L122,96 L112,74 L104,68" className="muscle-map-inactive" />

      {/* Upper legs */}
      <path d="M58,146 L76,146 L72,216 L56,216 Z" className="muscle-map-inactive" />
      <path d="M84,146 L102,146 L104,216 L88,216 Z" className="muscle-map-inactive" />

      {/* Lower legs */}
      <path d="M58,218 L74,218 L70,300 L62,304 L56,300 Z" className="muscle-map-inactive" />
      <path d="M86,218 L102,218 L104,300 L98,304 L90,300 Z" className="muscle-map-inactive" />

      {/* Highlighted muscle groups */}
      {Object.entries(muscleDefs).map(([key, muscle]) => {
        const isPrimary = activeMuscles.has(key);
        const isSecondary = secondaryMuscles.has(key);
        if (!isPrimary && !isSecondary) return null;
        const cls = isPrimary ? 'muscle-map-primary' : 'muscle-map-secondary';
        return muscle.paths.map((d, i) => (
          <path
            key={`${key}-${i}`}
            d={d}
            className={cls}
          />
        ));
      })}

      {/* Label under silhouette */}
      <text x="80" y="330" textAnchor="middle" className="muscle-map-label" fontSize="11" fontFamily="inherit">
        {side === 'front' ? 'Front' : 'Back'}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main MuscleMap component
// Props:
//   exercises: array of exercise objects with muscle_group / secondary_muscles
//   compact: boolean - smaller version for inline use
// ---------------------------------------------------------------------------
export default function MuscleMap({ exercises = [], compact = false }) {
  const { primaryMuscles, secondaryMuscles, muscleLabels } = useMemo(() => {
    const primary = new Set();
    const secondary = new Set();
    const labels = new Set();

    exercises.forEach(ex => {
      const mainMuscle = normalizeMuscle(ex.muscle_group || ex.muscleGroup);
      if (mainMuscle) {
        primary.add(mainMuscle);
        labels.add(mainMuscle);
      }

      // Parse secondary muscles (can be comma-separated string or array)
      const secRaw = ex.secondary_muscles || ex.secondaryMuscles || '';
      const secList = Array.isArray(secRaw) ? secRaw : secRaw.split(',');
      secList.forEach(s => {
        const norm = normalizeMuscle(s.trim());
        if (norm && !primary.has(norm)) {
          secondary.add(norm);
          labels.add(norm);
        }
      });
    });

    return { primaryMuscles: primary, secondaryMuscles: secondary, muscleLabels: labels };
  }, [exercises]);

  if (primaryMuscles.size === 0 && secondaryMuscles.size === 0) return null;

  // Determine which muscles are best shown on front vs back
  const frontMuscles = new Set(['chest', 'biceps', 'core', 'shoulders']);
  const backMuscles = new Set(['back', 'glutes', 'triceps']);
  const bothSides = new Set(['legs', 'shoulders']);

  const hasFrontMuscles = [...primaryMuscles, ...secondaryMuscles].some(m => frontMuscles.has(m) || bothSides.has(m));
  const hasBackMuscles = [...primaryMuscles, ...secondaryMuscles].some(m => backMuscles.has(m) || bothSides.has(m));

  // Always show both views for a complete picture, like the reference image
  const showFront = true;
  const showBack = true;

  return (
    <div className={`muscle-map${compact ? ' muscle-map-compact' : ''}`}>
      <div className="muscle-map-bodies">
        {showFront && (
          <div className="muscle-map-body">
            <BodySilhouette
              activeMuscles={primaryMuscles}
              secondaryMuscles={secondaryMuscles}
              side="front"
            />
          </div>
        )}
        {showBack && (
          <div className="muscle-map-body">
            <BodySilhouette
              activeMuscles={primaryMuscles}
              secondaryMuscles={secondaryMuscles}
              side="back"
            />
          </div>
        )}
      </div>
      {!compact && (
        <div className="muscle-map-legend">
          {[...primaryMuscles].map(m => (
            <span key={m} className="muscle-tag muscle-tag-primary">
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </span>
          ))}
          {[...secondaryMuscles].map(m => (
            <span key={m} className="muscle-tag muscle-tag-secondary">
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
