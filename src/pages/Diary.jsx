import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiGet, apiPost, apiDelete } from '../utils/api'
import { ChevronLeft, ChevronRight, Trash2, Plus, Send } from 'lucide-react'

export default function Diary() {
  const { clientData } = useAuth()
  const { showToast } = useToast()

  // State
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 200, fat: 65 })
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [expandedMeal, setExpandedMeal] = useState(null)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [selectedMealType, setSelectedMealType] = useState('lunch')
  const [pendingFood, setPendingFood] = useState(null)
  const [servings, setServings] = useState(1)

  // Format date for API
  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Format date for display
  const formatDisplayDate = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (formatLocalDate(date) === formatLocalDate(today)) {
      return 'Today'
    } else if (formatLocalDate(date) === formatLocalDate(yesterday)) {
      return 'Yesterday'
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Auto-select meal type based on time
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 11) setSelectedMealType('breakfast')
    else if (hour >= 11 && hour < 15) setSelectedMealType('lunch')
    else if (hour >= 15 && hour < 21) setSelectedMealType('dinner')
    else setSelectedMealType('snack')
  }, [])

  // Load diary data
  const loadDiaryData = useCallback(async () => {
    if (!clientData?.id) return

    try {
      setLoading(true)
      const dateStr = formatLocalDate(currentDate)

      const data = await apiGet(
        `/.netlify/functions/food-diary?clientId=${clientData.id}&date=${dateStr}`
      )

      setEntries(data.entries || [])

      // Calculate totals
      const newTotals = (data.entries || []).reduce(
        (acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0)
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
      setTotals(newTotals)

      // Load goals
      if (clientData.daily_calories) {
        setGoals({
          calories: clientData.daily_calories || 2000,
          protein: clientData.daily_protein || 150,
          carbs: clientData.daily_carbs || 200,
          fat: clientData.daily_fat || 65
        })
      }

    } catch (err) {
      console.error('Error loading diary:', err)
    } finally {
      setLoading(false)
    }
  }, [clientData, currentDate])

  useEffect(() => {
    loadDiaryData()
  }, [loadDiaryData])

  // Navigation
  const goToPrevDay = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() - 1)
    setCurrentDate(newDate)
  }

  const goToNextDay = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + 1)
    setCurrentDate(newDate)
  }

  // Delete entry
  const deleteEntry = async (entryId) => {
    if (!confirm('Delete this entry?')) return

    try {
      await apiDelete(`/.netlify/functions/food-diary?entryId=${entryId}`)
      showToast('Entry deleted')
      loadDiaryData()
    } catch (err) {
      console.error('Error deleting entry:', err)
      showToast('Failed to delete entry')
    }
  }

  // Group entries by meal type
  const groupedEntries = entries.reduce((acc, entry) => {
    const mealType = entry.meal_type || 'snack'
    if (!acc[mealType]) acc[mealType] = []
    acc[mealType].push(entry)
    return acc
  }, {})

  // Calculate meal totals
  const getMealTotals = (mealEntries) => {
    return mealEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0)
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }

  // Calculate remaining
  const remaining = goals.calories - totals.calories
  const caloriePercent = Math.min(100, (totals.calories / goals.calories) * 100)
  const circumference = 2 * Math.PI * 54
  const dashOffset = circumference - (caloriePercent / 100) * circumference

  // Handle AI food input
  const handleAiSubmit = async () => {
    if (!aiInput.trim() || !clientData?.id) return

    setAiLoading(true)
    try {
      const data = await apiPost('/.netlify/functions/client-diary-ai', {
        clientId: clientData.id,
        clientFirstName: clientData.name?.split(' ')[0] || 'there',
        message: `Log for ${selectedMealType}: ${aiInput}`,
        todayEntries: entries,
        goals,
        totals
      })

      if (data.parsed && data.parsed.action === 'log_food') {
        data.parsed.meal_type = selectedMealType
        setPendingFood(data.parsed)
        setServings(1)
      } else {
        showToast(data.response || "Couldn't parse that food. Try being more specific.")
      }
    } catch (err) {
      console.error('AI error:', err)
      showToast("Couldn't connect to AI. Please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  // Confirm and add food
  const confirmFood = async () => {
    if (!pendingFood || !clientData?.id) return

    const food = {
      ...pendingFood,
      calories: Math.round(pendingFood.calories * servings),
      protein: Math.round(pendingFood.protein * servings),
      carbs: Math.round(pendingFood.carbs * servings),
      fat: Math.round(pendingFood.fat * servings)
    }

    try {
      await apiPost('/.netlify/functions/food-diary', {
        clientId: clientData.id,
        foodName: food.food_name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        mealType: selectedMealType,
        entryDate: formatLocalDate(currentDate),
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: servings
      })

      showToast(`Added "${food.food_name}"!`)
      setAiInput('')
      setPendingFood(null)
      loadDiaryData()
    } catch (err) {
      console.error('Error adding food:', err)
      showToast('Failed to add food. Please try again.')
    }
  }

  const mealTypes = [
    { key: 'breakfast', label: 'Breakfast', icon: '☀️' },
    { key: 'lunch', label: 'Lunch', icon: '🌤️' },
    { key: 'dinner', label: 'Dinner', icon: '🌙' },
    { key: 'snack', label: 'Snack', icon: '🍎' }
  ]

  return (
    <div className="diary">
      {/* Date Navigation */}
      <div className="date-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px 0' }}>
        <button
          onClick={goToPrevDay}
          className="date-nav-btn"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--gray-100)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatDisplayDate(currentDate)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <button
          onClick={goToNextDay}
          className="date-nav-btn"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--gray-100)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Summary Card */}
      <div className="summary-card">
        {loading ? (
          <div className="calorie-display">
            <div className="skeleton" style={{ width: 140, height: 140, borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : (
          <>
            <div className="calorie-display">
              <div className="calorie-ring">
                <svg viewBox="0 0 120 120">
                  <circle className="calorie-ring-bg" cx="60" cy="60" r="54" />
                  <circle
                    className="calorie-ring-progress"
                    cx="60"
                    cy="60"
                    r="54"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{
                      stroke: remaining < 0 ? '#ef4444' : 'var(--brand-primary)'
                    }}
                  />
                </svg>
                <div className="calorie-ring-text">
                  <div className="calorie-remaining" style={{ color: remaining < 0 ? '#ef4444' : undefined }}>
                    {Math.abs(remaining)}
                  </div>
                  <div className="calorie-label">
                    {remaining >= 0 ? 'remaining' : 'over'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
              <span style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>{goals.calories}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Goal</div>
              </span>
              <span style={{ color: 'var(--gray-400)' }}>−</span>
              <span style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>{totals.calories}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Eaten</div>
              </span>
              <span style={{ color: 'var(--gray-400)' }}>=</span>
              <span style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: remaining < 0 ? '#ef4444' : 'var(--brand-primary)' }}>
                  {remaining}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                  {remaining >= 0 ? 'Left' : 'Over'}
                </div>
              </span>
            </div>

            <div className="macro-bars">
              <MacroBar label="P" current={totals.protein} goal={goals.protein} color="protein" />
              <MacroBar label="C" current={totals.carbs} goal={goals.carbs} color="carbs" />
              <MacroBar label="F" current={totals.fat} goal={goals.fat} color="fat" />
            </div>
          </>
        )}
      </div>

      {/* AI Input */}
      <div className="ai-input-section">
        <div className="meal-type-selector">
          {mealTypes.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`meal-type-btn ${selectedMealType === key ? 'active' : ''}`}
              onClick={() => setSelectedMealType(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="ai-input-wrapper">
          <input
            type="text"
            className="ai-input"
            placeholder="What did you eat?"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
            disabled={aiLoading}
          />
          <button
            className="ai-input-btn"
            onClick={handleAiSubmit}
            disabled={aiLoading || !aiInput.trim()}
          >
            {aiLoading ? (
              <div className="app-loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        {/* Pending Food Preview */}
        {pendingFood && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--gray-50)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--brand-primary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span style={{ fontWeight: 600 }}>Ready to log</span>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 8 }}>{pendingFood.food_name}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>Servings:</label>
              <input
                type="number"
                value={servings}
                min="0.5"
                step="0.5"
                onChange={(e) => setServings(parseFloat(e.target.value) || 1)}
                style={{
                  width: 70,
                  padding: '6px 8px',
                  border: '1px solid var(--gray-300)',
                  borderRadius: 6,
                  textAlign: 'center'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{Math.round(pendingFood.calories * servings)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Cal</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#3b82f6' }}>{Math.round(pendingFood.protein * servings)}g</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Protein</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#f59e0b' }}>{Math.round(pendingFood.carbs * servings)}g</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Carbs</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#ef4444' }}>{Math.round(pendingFood.fat * servings)}g</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Fat</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setPendingFood(null); setAiInput('') }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'var(--gray-200)',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmFood}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'var(--brand-gradient)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Meal Sections */}
      {loading ? (
        <div className="card">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : (
        mealTypes.map(({ key, label, icon }) => {
          const mealEntries = groupedEntries[key] || []
          const mealTotals = getMealTotals(mealEntries)
          const isExpanded = expandedMeal === key || mealEntries.length > 0

          return (
            <div key={key} className="card" style={{ marginBottom: 12 }}>
              <div
                onClick={() => setExpandedMeal(expandedMeal === key ? null : key)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  {mealEntries.length > 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                      ({mealEntries.length})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                  {mealTotals.calories} cal
                </div>
              </div>

              {isExpanded && mealEntries.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
                  {mealEntries.map(entry => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid var(--gray-50)'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{entry.food_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                          {entry.calories} cal • {entry.protein}g P • {entry.carbs}g C • {entry.fat}g F
                        </div>
                      </div>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--gray-400)',
                          cursor: 'pointer',
                          padding: 8
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {mealEntries.length === 0 && (
                <div style={{
                  marginTop: 12,
                  padding: '20px 0',
                  textAlign: 'center',
                  color: 'var(--gray-400)',
                  fontSize: '0.9rem'
                }}>
                  No entries yet
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// Macro Bar Component
function MacroBar({ label, current, goal, color }) {
  const percent = Math.min(100, (current / goal) * 100)

  return (
    <div className="macro-bar">
      <div className="macro-bar-header">
        <span className={`macro-bar-label ${color}`}>{label}</span>
        <span className="macro-bar-value">{current}/{goal}g</span>
      </div>
      <div className="macro-bar-track">
        <div
          className={`macro-bar-fill ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
