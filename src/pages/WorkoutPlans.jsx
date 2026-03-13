import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Dumbbell, Clock, Users, Filter, ChevronRight, Trash2, Copy, Edit3, MoreVertical, X, Loader2, Calendar, TrendingUp, Layers, FileDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import { useToast } from '../components/Toast';
import SmartThumbnail from '../components/workout/SmartThumbnail';
import PrintPlanModal from '../components/workout/PrintPlanModal';

const CATEGORY_OPTIONS = [
  { key: '', label: 'All Types' },
  { key: 'strength', label: 'Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'hiit', label: 'HIIT' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'weight_loss', label: 'Weight Loss' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'full_body', label: 'Full Body' },
  { key: 'general', label: 'General' }
];

const DIFFICULTY_OPTIONS = [
  { key: '', label: 'All Levels' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' }
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'alphabetical-desc', label: 'Z-A' }
];

function WorkoutPlans() {
  const { clientData, user } = useAuth();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const isCoach = clientData?.is_coach === true;

  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [duplicating, setDuplicating] = useState(null);
  const [pdfProgram, setPdfProgram] = useState(null);

  // Fetch programs
  const fetchPrograms = useCallback(async () => {
    if (!user?.id && !clientData?.coach_id) return;
    try {
      setLoading(true);
      const coachId = isCoach ? user.id : clientData.coach_id;
      const data = await apiGet(`/.netlify/functions/workout-programs?coachId=${coachId}`);
      setPrograms(data?.programs || []);
    } catch (err) {
      console.error('Error fetching programs:', err);
      showError('Failed to load workout plans');
    } finally {
      setLoading(false);
    }
  }, [user?.id, clientData?.coach_id, isCoach]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Filter and sort programs
  const filteredPrograms = useMemo(() => {
    let filtered = [...programs];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p =>
        (p.program_type || '').toLowerCase() === selectedCategory ||
        (p.program_data?.category || '').toLowerCase() === selectedCategory
      );
    }

    // Difficulty filter
    if (selectedDifficulty) {
      filtered = filtered.filter(p =>
        (p.difficulty || '').toLowerCase() === selectedDifficulty ||
        (p.program_data?.difficulty || '').toLowerCase() === selectedDifficulty
      );
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
        break;
      case 'alphabetical':
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'alphabetical-desc':
        filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
    }

    return filtered;
  }, [programs, searchQuery, selectedCategory, selectedDifficulty, sortBy]);

  // Delete program
  const handleDelete = async (programId) => {
    try {
      await apiDelete(`/.netlify/functions/workout-programs?programId=${programId}`);
      setPrograms(prev => prev.filter(p => p.id !== programId));
      setDeleteConfirmId(null);
      setMenuOpenId(null);
      showSuccess('Program deleted');
    } catch (err) {
      showError('Failed to delete program');
    }
  };

  // Duplicate program
  const handleDuplicate = async (program) => {
    try {
      setDuplicating(program.id);
      const coachId = isCoach ? user.id : clientData.coach_id;
      await apiPost('/.netlify/functions/workout-programs', {
        coachId,
        name: `${program.name} (Copy)`,
        description: program.description,
        programType: program.program_type,
        difficulty: program.difficulty,
        durationWeeks: program.duration_weeks,
        daysPerWeek: program.days_per_week,
        programData: program.program_data,
        isTemplate: program.is_template,
        isPublished: false,
        heroImageUrl: program.hero_image_url
      });
      setMenuOpenId(null);
      await fetchPrograms();
      showSuccess('Program duplicated');
    } catch (err) {
      showError('Failed to duplicate program');
    } finally {
      setDuplicating(null);
    }
  };

  // Get days count from program data
  const getDaysCount = (program) => {
    return program.program_data?.days?.length || program.days_per_week || 0;
  };

  // Get exercise count from program data
  const getExerciseCount = (program) => {
    const days = program.program_data?.days || [];
    return days.reduce((sum, day) => sum + (day.exercises?.length || 0), 0);
  };

  const activeFilters = (selectedCategory ? 1 : 0) + (selectedDifficulty ? 1 : 0);

  return (
    <div className="workout-plans-page">
      {/* Header */}
      <div className="wp-header">
        <div className="wp-header-top">
          <h1 className="wp-title">Workout Plans</h1>
          {isCoach && (
            <button
              className="wp-new-btn"
              onClick={() => navigate('/workouts/builder')}
            >
              <Plus size={20} />
              <span>New Plan</span>
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="wp-search-bar">
          <Search size={18} className="wp-search-icon" />
          <input
            type="text"
            placeholder="Search workout plans..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="wp-search-input"
          />
          {searchQuery && (
            <button className="wp-search-clear" onClick={() => setSearchQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="wp-filter-bar">
          <button
            className={`wp-filter-toggle ${showFilters ? 'active' : ''} ${activeFilters > 0 ? 'has-filters' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            <span>Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}</span>
          </button>
          <select
            className="wp-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Expandable Filters */}
        {showFilters && (
          <div className="wp-filters-panel">
            <div className="wp-filter-group">
              <label>Type</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="wp-filter-group">
              <label>Level</label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
              >
                {DIFFICULTY_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            {(selectedCategory || selectedDifficulty) && (
              <button
                className="wp-clear-filters"
                onClick={() => { setSelectedCategory(''); setSelectedDifficulty(''); }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Programs List */}
      <div className="wp-content">
        {loading ? (
          <div className="wp-loading">
            <Loader2 size={32} className="wp-spinner" />
            <span>Loading workout plans...</span>
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="wp-empty">
            <Dumbbell size={48} strokeWidth={1.5} />
            {programs.length === 0 ? (
              <>
                <h3>No workout plans yet</h3>
                <p>Create your first workout plan to get started.</p>
                {isCoach && (
                  <button className="wp-empty-btn" onClick={() => navigate('/workouts/builder')}>
                    <Plus size={18} />
                    Create Plan
                  </button>
                )}
              </>
            ) : (
              <>
                <h3>No results</h3>
                <p>Try adjusting your search or filters.</p>
              </>
            )}
          </div>
        ) : (
          <div className="wp-grid">
            {filteredPrograms.map(program => {
              const daysCount = getDaysCount(program);
              const exerciseCount = getExerciseCount(program);
              const coverImage = program.hero_image_url || program.program_data?.image_url;
              const difficulty = (program.difficulty || program.program_data?.difficulty || '').toLowerCase();

              return (
                <div
                  key={program.id}
                  className="wp-card"
                  onClick={() => navigate(`/workouts/builder/${program.id}`)}
                >
                  {/* Card Image */}
                  <div className="wp-card-image">
                    {coverImage ? (
                      <img src={coverImage} alt={program.name} />
                    ) : (
                      <div className="wp-card-placeholder">
                        <Dumbbell size={32} strokeWidth={1.5} />
                      </div>
                    )}
                    {difficulty && (
                      <span className={`wp-card-badge ${difficulty}`}>
                        {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                      </span>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="wp-card-body">
                    <h3 className="wp-card-title">{program.name}</h3>
                    {program.description && (
                      <p className="wp-card-desc">{program.description}</p>
                    )}
                    <div className="wp-card-meta">
                      {daysCount > 0 && (
                        <span className="wp-card-stat">
                          <Calendar size={14} />
                          {daysCount} {daysCount === 1 ? 'day' : 'days'}
                        </span>
                      )}
                      {exerciseCount > 0 && (
                        <span className="wp-card-stat">
                          <Dumbbell size={14} />
                          {exerciseCount} exercises
                        </span>
                      )}
                      {program.days_per_week && (
                        <span className="wp-card-stat">
                          <TrendingUp size={14} />
                          {program.days_per_week}x/week
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  {isCoach && (
                    <div className="wp-card-actions">
                      <button
                        className="wp-card-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === program.id ? null : program.id);
                        }}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {menuOpenId === program.id && (
                        <div className="wp-card-dropdown" onClick={e => e.stopPropagation()}>
                          <button onClick={() => navigate(`/workouts/builder/${program.id}`)}>
                            <Edit3 size={16} />
                            Edit
                          </button>
                          <button onClick={() => { setPdfProgram(program); setMenuOpenId(null); }}>
                            <FileDown size={16} />
                            Download PDF
                          </button>
                          <button onClick={() => handleDuplicate(program)} disabled={duplicating === program.id}>
                            {duplicating === program.id ? <Loader2 size={16} className="wp-spinner" /> : <Copy size={16} />}
                            Duplicate
                          </button>
                          <button
                            className="danger"
                            onClick={() => setDeleteConfirmId(program.id)}
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="wp-stats-bar">
        <span>{filteredPrograms.length} plan{filteredPrograms.length !== 1 ? 's' : ''}</span>
      </div>

      {/* PDF Download Modal */}
      {pdfProgram && (
        <PrintPlanModal
          program={pdfProgram}
          onClose={() => setPdfProgram(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="wp-delete-overlay" onClick={() => { setDeleteConfirmId(null); setMenuOpenId(null); }}>
          <div className="wp-delete-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Workout Plan?</h3>
            <p>This will permanently delete this workout plan. This action cannot be undone.</p>
            <div className="wp-delete-actions">
              <button className="wp-delete-cancel" onClick={() => { setDeleteConfirmId(null); setMenuOpenId(null); }}>
                Cancel
              </button>
              <button className="wp-delete-confirm" onClick={() => handleDelete(deleteConfirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkoutPlans;
