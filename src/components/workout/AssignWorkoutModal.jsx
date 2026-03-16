import { useState, useEffect } from 'react';
import { X, Users, Loader2, Search, Calendar, Check } from 'lucide-react';
import { apiGet, apiPost } from '../../utils/api';
import { useToast } from '../Toast';

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

function AssignWorkoutModal({ program, coachId, onClose, onAssigned }) {
  const { showError, showSuccess } = useToast();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClients, setSelectedClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedDays, setSelectedDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [weeksAmount, setWeeksAmount] = useState(12);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!coachId) return;
    setLoadingClients(true);
    apiGet(`/.netlify/functions/get-clients?coachId=${coachId}`)
      .then(data => setClients(data?.clients || []))
      .catch(() => showError('Failed to load clients'))
      .finally(() => setLoadingClients(false));
  }, [coachId]);

  const toggleClient = (clientId) => {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const toggleDay = (dayKey) => {
    setSelectedDays(prev =>
      prev.includes(dayKey)
        ? prev.filter(d => d !== dayKey)
        : [...prev, dayKey]
    );
  };

  const filteredClients = clients.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return name.includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  const handleAssign = async () => {
    if (selectedClients.length === 0) {
      showError('Select at least one client');
      return;
    }
    if (selectedDays.length === 0) {
      showError('Select at least one day');
      return;
    }

    setAssigning(true);
    try {
      const schedule = {
        selectedDays,
        weeksAmount,
        startDate,
      };

      let successCount = 0;
      for (const clientId of selectedClients) {
        try {
          await apiPost('/.netlify/functions/workout-assignments', {
            clientId,
            coachId,
            programId: program.id,
            name: program.name,
            startDate,
            workoutData: program.program_data,
            schedule,
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to assign to client ${clientId}:`, err);
        }
      }

      if (successCount > 0) {
        showSuccess(`Program assigned to ${successCount} client${successCount !== 1 ? 's' : ''}`);
        onAssigned?.();
        onClose();
      } else {
        showError('Failed to assign program');
      }
    } catch (err) {
      showError('Failed to assign program');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="wp-delete-overlay" onClick={onClose}>
      <div
        className="assign-workout-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="assign-modal-header">
          <div className="assign-modal-title-row">
            <Users size={20} />
            <h3>Assign Program</h3>
          </div>
          <button className="assign-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="assign-modal-program-name">{program.name}</p>

        {/* Client Selection */}
        <div className="assign-modal-section">
          <label className="assign-modal-label">Select Clients</label>
          <div className="assign-modal-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="assign-modal-client-list">
            {loadingClients ? (
              <div className="assign-modal-loading">
                <Loader2 size={20} className="wp-spinner" />
                <span>Loading clients...</span>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="assign-modal-empty">No clients found</div>
            ) : (
              filteredClients.map(client => (
                <label key={client.id} className="assign-modal-client-row">
                  <input
                    type="checkbox"
                    checked={selectedClients.includes(client.id)}
                    onChange={() => toggleClient(client.id)}
                  />
                  <span className="assign-client-name">
                    {client.first_name || ''} {client.last_name || ''}
                  </span>
                  {client.email && (
                    <span className="assign-client-email">{client.email}</span>
                  )}
                </label>
              ))
            )}
          </div>
          {selectedClients.length > 0 && (
            <div className="assign-modal-selected-count">
              {selectedClients.length} client{selectedClients.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="assign-modal-section">
          <label className="assign-modal-label">Schedule</label>
          <div className="assign-modal-schedule-row">
            <div className="assign-modal-field">
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="assign-modal-field">
              <label>Duration (weeks)</label>
              <input
                type="number"
                min={1}
                max={52}
                value={weeksAmount}
                onChange={e => setWeeksAmount(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="assign-modal-days">
            <label>Workout Days</label>
            <div className="assign-modal-day-pills">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.key}
                  className={`assign-day-pill ${selectedDays.includes(day.key) ? 'active' : ''}`}
                  onClick={() => toggleDay(day.key)}
                  type="button"
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="assign-modal-actions">
          <button className="assign-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="assign-modal-confirm"
            onClick={handleAssign}
            disabled={assigning || selectedClients.length === 0}
          >
            {assigning ? (
              <>
                <Loader2 size={16} className="wp-spinner" />
                Assigning...
              </>
            ) : (
              <>
                <Check size={16} />
                Assign to {selectedClients.length || ''} Client{selectedClients.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignWorkoutModal;
