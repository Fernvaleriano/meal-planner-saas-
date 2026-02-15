import { Calendar, RefreshCw, AlertCircle } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function WeeklyPlanner({ schedule, wasAutoAdjusted, adjustmentReason, getIntensityColor, expanded, readinessHistory }) {
  const today = new Date().getDay();

  if (!schedule || !Array.isArray(schedule)) {
    return (
      <div className="weekly-planner-card">
        <div className="planner-header">
          <Calendar size={20} />
          <h3>Weekly Training Plan</h3>
        </div>
        <div className="planner-empty">
          <p>Complete your readiness check to generate your adaptive weekly plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="weekly-planner-card">
      <div className="planner-header">
        <Calendar size={20} />
        <h3>Weekly Training Plan</h3>
        {wasAutoAdjusted && (
          <div className="planner-adjusted-badge">
            <RefreshCw size={12} />
            Auto-adjusted
          </div>
        )}
      </div>

      {wasAutoAdjusted && adjustmentReason && (
        <div className="planner-adjustment-notice">
          <AlertCircle size={14} />
          <span>{adjustmentReason}</span>
        </div>
      )}

      <div className={`planner-week ${expanded ? 'expanded' : ''}`}>
        {schedule.map((day) => {
          const isToday = day.day === today;
          const isPast = day.day < today;
          const color = getIntensityColor(day.intensity);

          return (
            <div
              key={day.day}
              className={`planner-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
            >
              <div className="planner-day-header">
                <span className="planner-day-name">
                  {expanded ? DAY_NAMES_FULL[day.day] : DAY_NAMES[day.day]}
                </span>
                {isToday && <span className="planner-today-badge">Today</span>}
              </div>

              <div
                className="planner-intensity-pill"
                style={{ background: color + '20', color, borderColor: color + '40' }}
              >
                {day.intensity}
              </div>

              {day.focus && (
                <span className="planner-focus">{day.focus}</span>
              )}

              {expanded && day.notes && (
                <span className="planner-notes">{day.notes}</span>
              )}

              {expanded && readinessHistory && (
                (() => {
                  const readinessForDay = readinessHistory.find(r => {
                    const rDate = new Date(r.assessment_date + 'T12:00:00Z');
                    return rDate.getUTCDay() === day.day;
                  });
                  if (readinessForDay) {
                    return (
                      <span className="planner-readiness-score">
                        Readiness: {readinessForDay.readiness_score}
                      </span>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WeeklyPlanner;
