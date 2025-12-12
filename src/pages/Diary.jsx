import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function Diary() {
  const { clientData } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [goals, setGoals] = useState({ calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 65 });

  // Format date for display
  const formatDateDisplay = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(currentDate);
    selected.setHours(0, 0, 0, 0);

    const diffDays = Math.round((selected - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 1) return 'Tomorrow';
    return currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Navigate date
  const changeDate = (days) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  // Load diary entries
  useEffect(() => {
    const loadEntries = async () => {
      if (!clientData?.id) return;
      setLoading(true);

      try {
        const dateStr = formatDate(currentDate);
        const data = await apiGet(`/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateStr}`);

        setEntries(data.entries || []);

        if (data.goals) {
          setGoals(data.goals);
        }

        // Calculate totals
        const calculatedTotals = (data.entries || []).reduce((acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        setTotals(calculatedTotals);
      } catch (err) {
        console.error('Error loading diary:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [clientData?.id, currentDate]);

  // Handle action from URL params
  useEffect(() => {
    const action = searchParams.get('action');
    if (action) {
      // TODO: Open modals based on action
      console.log('Action requested:', action);
    }
  }, [searchParams]);

  // Group entries by meal type
  const groupedEntries = {
    breakfast: entries.filter(e => e.meal_type === 'breakfast'),
    lunch: entries.filter(e => e.meal_type === 'lunch'),
    dinner: entries.filter(e => e.meal_type === 'dinner'),
    snack: entries.filter(e => e.meal_type === 'snack')
  };

  // Calculate remaining
  const remaining = goals.calorie_goal - totals.calories;
  const progress = Math.min(100, Math.round((totals.calories / goals.calorie_goal) * 100));

  // Render meal section
  const MealSection = ({ title, entries, mealType }) => {
    const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);

    return (
      <div className="card" style={{ padding: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: entries.length > 0 ? '12px' : '0'
        }}>
          <h3 style={{ fontWeight: '600', color: 'var(--gray-900)' }}>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--gray-500)' }}>{mealCals} cal</span>
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {entries.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(entry => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: 'var(--gray-50)',
                  borderRadius: '10px'
                }}
              >
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--gray-900)' }}>
                    {entry.food_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                    {entry.number_of_servings || 1} serving
                  </div>
                </div>
                <div style={{ fontWeight: '600', color: 'var(--gray-700)' }}>
                  {entry.calories || 0}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)', textAlign: 'center' }}>
            No items logged
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Date Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => changeDate(-1)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--gray-600)'
          }}
        >
          <ChevronLeft size={24} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--gray-900)' }}>
            {formatDateDisplay()}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            {currentDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
        </div>

        <button
          onClick={() => changeDate(1)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--gray-600)'
          }}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Calorie Summary */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--gray-900)' }}>
              {totals.calories}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Consumed</div>
          </div>
          <div>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: remaining >= 0 ? 'var(--brand-primary)' : 'var(--error)'
            }}>
              {remaining}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Remaining</div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--gray-900)' }}>
              {goals.calorie_goal}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Goal</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: '8px',
          background: 'var(--gray-200)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: progress > 100 ? 'var(--error)' : 'var(--brand-gradient)',
              borderRadius: '4px',
              transition: 'width 0.3s'
            }}
          ></div>
        </div>

        {/* Macros */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          marginTop: '16px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#3b82f6' }}>{Math.round(totals.protein)}g</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Protein</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#f59e0b' }}>{Math.round(totals.carbs)}g</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Carbs</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', color: '#ef4444' }}>{Math.round(totals.fat)}g</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Fat</div>
          </div>
        </div>
      </div>

      {/* Meal Sections */}
      {loading ? (
        <div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card skeleton" style={{ height: '100px', marginBottom: '12px' }}></div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <MealSection title="Breakfast" entries={groupedEntries.breakfast} mealType="breakfast" />
          <MealSection title="Lunch" entries={groupedEntries.lunch} mealType="lunch" />
          <MealSection title="Dinner" entries={groupedEntries.dinner} mealType="dinner" />
          <MealSection title="Snacks" entries={groupedEntries.snack} mealType="snack" />
        </div>
      )}
    </div>
  );
}

export default Diary;
