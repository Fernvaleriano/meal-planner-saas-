import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, CheckCircle, ChevronRight, Dumbbell, X } from 'lucide-react';
import { apiGet } from '../utils/api';

/**
 * Dashboard widget showing workout programs that are ending soon or have expired.
 * Displayed at the top of the coach Feed page for maximum visibility.
 */
export default function ProgramsEndingSoon({ coachId }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissedEndingPrograms') || '[]');
    } catch { return []; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!coachId) return;

    const fetchPrograms = async () => {
      try {
        const result = await apiGet(`/.netlify/functions/programs-ending-soon?coachId=${coachId}`);
        setPrograms(result.programs || []);
      } catch (err) {
        console.error('Failed to fetch ending programs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrograms();
  }, [coachId]);

  const handleDismiss = (assignmentId) => {
    const newDismissed = [...dismissed, assignmentId];
    setDismissed(newDismissed);
    localStorage.setItem('dismissedEndingPrograms', JSON.stringify(newDismissed));
  };

  // Filter out dismissed and programs that already have replacements
  const visiblePrograms = programs.filter(
    p => !dismissed.includes(p.assignmentId) && !p.hasReplacement
  );

  if (loading || visiblePrograms.length === 0) return null;

  const expiredCount = visiblePrograms.filter(p => p.isExpired).length;
  const upcomingCount = visiblePrograms.length - expiredCount;

  return (
    <div className="programs-ending-widget">
      <div className="programs-ending-header">
        <div className="programs-ending-title">
          <AlertTriangle size={18} />
          <span>Programs Ending Soon</span>
          <span className="programs-ending-count">{visiblePrograms.length}</span>
        </div>
      </div>

      <div className="programs-ending-list">
        {visiblePrograms.map(program => (
          <div
            key={program.assignmentId}
            className={`programs-ending-card ${program.isExpired ? 'expired' : program.daysRemaining <= 3 ? 'urgent' : ''}`}
          >
            <div className="programs-ending-card-main">
              <div className="programs-ending-card-info">
                <div className="programs-ending-client-name">{program.clientName}</div>
                <div className="programs-ending-program-name">{program.programName}</div>
                <div className="programs-ending-meta">
                  {program.isExpired ? (
                    <span className="programs-ending-badge expired">
                      <AlertTriangle size={12} />
                      Ended
                    </span>
                  ) : (
                    <span className={`programs-ending-badge ${program.daysRemaining <= 3 ? 'urgent' : 'upcoming'}`}>
                      <Clock size={12} />
                      {program.daysRemaining}d left
                    </span>
                  )}
                  {program.plannedWorkouts > 0 && (
                    <span className="programs-ending-completion">
                      <Dumbbell size={12} />
                      {program.completedWorkouts}/{program.plannedWorkouts}
                    </span>
                  )}
                </div>
              </div>

              <div className="programs-ending-card-actions">
                <button
                  className="programs-ending-assign-btn"
                  onClick={() => navigate('/workout-plans')}
                  title="Assign new program"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="programs-ending-dismiss-btn"
                  onClick={(e) => { e.stopPropagation(); handleDismiss(program.assignmentId); }}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {program.plannedWorkouts > 0 && (
              <div className="programs-ending-progress-bar">
                <div
                  className="programs-ending-progress-fill"
                  style={{ width: `${Math.min(Math.round((program.completedWorkouts / program.plannedWorkouts) * 100), 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
