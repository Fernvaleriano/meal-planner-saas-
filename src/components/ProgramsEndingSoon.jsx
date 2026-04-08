import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, CheckCircle, ChevronRight, Dumbbell, X, UserX } from 'lucide-react';
import { apiGet } from '../utils/api';

/**
 * Dashboard widget showing:
 * 1. Workout programs that are ending soon or have expired
 * 2. Clients with no active workout program at all
 * Displayed at the top of the coach Feed page for maximum visibility.
 */
export default function ProgramsEndingSoon({ coachId }) {
  const [programs, setPrograms] = useState([]);
  const [clientsWithoutPrograms, setClientsWithoutPrograms] = useState([]);
  const [clientsWithExpiredOnly, setClientsWithExpiredOnly] = useState([]);
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
        setClientsWithoutPrograms(result.clientsWithoutPrograms || []);
        setClientsWithExpiredOnly(result.clientsWithExpiredOnly || []);
      } catch (err) {
      } finally {
        setLoading(false);
      }
    };

    fetchPrograms();
  }, [coachId]);

  const handleDismiss = (id) => {
    const newDismissed = [...dismissed, id];
    setDismissed(newDismissed);
    localStorage.setItem('dismissedEndingPrograms', JSON.stringify(newDismissed));
  };

  // Filter out dismissed and programs that already have replacements
  const visiblePrograms = programs.filter(
    p => !dismissed.includes(p.assignmentId) && !p.hasReplacement
  );
  const visibleNoProgram = clientsWithoutPrograms.filter(
    c => !dismissed.includes(`no-program-${c.clientId}`)
  );
  const visibleExpired = clientsWithExpiredOnly.filter(
    c => !dismissed.includes(`expired-${c.clientId}`)
  );

  const totalVisible = visiblePrograms.length + visibleNoProgram.length + visibleExpired.length;

  if (loading || totalVisible === 0) return null;

  const expiredCount = visiblePrograms.filter(p => p.isExpired).length;

  return (
    <div className="programs-ending-widget">
      <div className="programs-ending-header">
        <div className="programs-ending-title">
          <AlertTriangle size={18} />
          <span>Program Alerts</span>
          <span className="programs-ending-count">{totalVisible}</span>
        </div>
      </div>

      <div className="programs-ending-list">
        {/* Clients with NO program at all */}
        {visibleNoProgram.map(client => (
          <div
            key={`no-program-${client.clientId}`}
            className="programs-ending-card expired"
          >
            <div className="programs-ending-card-main">
              <div className="programs-ending-card-info">
                <div className="programs-ending-client-name">{client.clientName}</div>
                <div className="programs-ending-program-name">No workout program assigned</div>
                <div className="programs-ending-meta">
                  <span className="programs-ending-badge expired">
                    <UserX size={12} />
                    No program
                  </span>
                </div>
              </div>
              <div className="programs-ending-card-actions">
                <button
                  className="programs-ending-assign-btn"
                  onClick={() => navigate('/workout-plans')}
                  title="Assign program"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  className="programs-ending-dismiss-btn"
                  onClick={(e) => { e.stopPropagation(); handleDismiss(`no-program-${client.clientId}`); }}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Clients whose programs expired long ago */}
        {visibleExpired.map(client => (
          <div
            key={`expired-${client.clientId}`}
            className="programs-ending-card expired"
          >
            <div className="programs-ending-card-main">
              <div className="programs-ending-card-info">
                <div className="programs-ending-client-name">{client.clientName}</div>
                <div className="programs-ending-program-name">"{client.lastProgramName}" ended {client.lastProgramEndDate}</div>
                <div className="programs-ending-meta">
                  <span className="programs-ending-badge expired">
                    <AlertTriangle size={12} />
                    Needs new program
                  </span>
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
                  onClick={(e) => { e.stopPropagation(); handleDismiss(`expired-${client.clientId}`); }}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Programs ending soon / recently expired */}
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
