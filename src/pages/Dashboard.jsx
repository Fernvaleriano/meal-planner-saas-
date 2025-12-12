import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { apiGet, apiPost } from '../utils/api'
import { Camera, Search, Heart, Tag, Send, Mic } from 'lucide-react'

export default function Dashboard() {
  const { clientData } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [todayProgress, setTodayProgress] = useState(null)
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 200, fat: 65 })
  const [mealPlans, setMealPlans] = useState([])
  const [selectedMealType, setSelectedMealType] = useState('lunch')
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pendingFood, setPendingFood] = useState(null)
  const [servings, setServings] = useState(1)

  // Get today's date in local timezone
  const formatLocalDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Auto-select meal type based on time
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 11) setSelectedMealType('breakfast')
    else if (hour >= 11 && hour < 15) setSelectedMealType('lunch')
    else if (hour >= 15 && hour < 21) setSelectedMealType('dinner')
    else setSelectedMealType('snack')
  }, [])

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    if (!clientData?.id) return

    try {
      setLoading(true)
      const today = formatLocalDate(new Date())

      // Load today's progress
      const diaryData = await apiGet(
        `/.netlify/functions/food-diary?clientId=${clientData.id}&date=${today}`
      )

      // Calculate totals
      const entries = diaryData.entries || []
      const totals = entries.reduce(
        (acc, entry) => ({
          calories: acc.calories + (entry.calories || 0),
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0)
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )

      setTodayProgress(totals)

      // Load client goals
      if (clientData.daily_calories) {
        setGoals({
          calories: clientData.daily_calories || 2000,
          protein: clientData.daily_protein || 150,
          carbs: clientData.daily_carbs || 200,
          fat: clientData.daily_fat || 65
        })
      }

      // Load meal plans
      const plansData = await apiGet(
        `/.netlify/functions/get-client-plans?clientId=${clientData.id}`
      )
      setMealPlans(plansData.plans || [])

    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [clientData])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // Calculate remaining calories
  const remaining = goals.calories - (todayProgress?.calories || 0)
  const caloriePercent = Math.min(100, ((todayProgress?.calories || 0) / goals.calories) * 100)
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
        todayEntries: [],
        goals,
        totals: todayProgress || { calories: 0, protein: 0, carbs: 0, fat: 0 }
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
        entryDate: formatLocalDate(new Date()),
        servingSize: 1,
        servingUnit: 'serving',
        numberOfServings: servings
      })

      showToast(`Added "${food.food_name}"!`, 'View Diary', () => navigate('/diary'))
      setAiInput('')
      setPendingFood(null)
      loadDashboardData()
    } catch (err) {
      console.error('Error adding food:', err)
      showToast('Failed to add food. Please try again.')
    }
  }

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const firstName = clientData?.client_name?.split(' ')[0] || 'there'

  return (
    <div className="dashboard">
      {/* Welcome Header */}
      <div className="welcome-header">
        <h1>{getGreeting()}, {firstName}!</h1>
        <p>Track your nutrition journey</p>
      </div>

      {/* Today's Progress */}
      <div className="summary-card">
        <div className="summary-header">
          <h3 className="summary-title">Today's Progress</h3>
        </div>

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

            <div className="calorie-equation" style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
              <span style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{goals.calories}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Goal</div>
              </span>
              <span style={{ color: 'var(--gray-400)' }}>−</span>
              <span style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{todayProgress?.calories || 0}</div>
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
              <MacroBar
                label="P"
                current={todayProgress?.protein || 0}
                goal={goals.protein}
                color="protein"
              />
              <MacroBar
                label="C"
                current={todayProgress?.carbs || 0}
                goal={goals.carbs}
                color="carbs"
              />
              <MacroBar
                label="F"
                current={todayProgress?.fat || 0}
                goal={goals.fat}
                color="fat"
              />
            </div>
          </>
        )}
      </div>

      {/* AI Input Section */}
      <div className="ai-input-section">
        <div className="meal-type-selector">
          {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
            <button
              key={type}
              className={`meal-type-btn ${selectedMealType === type ? 'active' : ''}`}
              onClick={() => setSelectedMealType(type)}
            >
              {type === 'breakfast' && '☀️ '}
              {type === 'lunch' && '🌤️ '}
              {type === 'dinner' && '🌙 '}
              {type === 'snack' && '🍎 '}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        <div className="ai-input-wrapper">
          <input
            type="text"
            className="ai-input"
            placeholder="What did you eat? (e.g., 2 eggs and toast)"
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
          <div className="pending-food" style={{ marginTop: 16, padding: 16, background: 'var(--gray-50)', borderRadius: 12 }}>
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
                Add to {selectedMealType.charAt(0).toUpperCase() + selectedMealType.slice(1)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => showToast('Photo feature coming soon!')}>
          <span className="quick-action-icon">📷</span>
          <span className="quick-action-label">Photo</span>
        </button>
        <button className="quick-action-btn" onClick={() => showToast('Search feature coming soon!')}>
          <span className="quick-action-icon">🔍</span>
          <span className="quick-action-label">Search</span>
        </button>
        <button className="quick-action-btn" onClick={() => showToast('Favorites feature coming soon!')}>
          <span className="quick-action-icon">❤️</span>
          <span className="quick-action-label">Favorites</span>
        </button>
        <button className="quick-action-btn" onClick={() => showToast('Scan feature coming soon!')}>
          <span className="quick-action-icon">📋</span>
          <span className="quick-action-label">Scan</span>
        </button>
      </div>

      {/* Meal Plans */}
      {mealPlans.length > 0 && (
        <div className="card">
          <h3 className="section-title">
            <span className="section-icon">📋</span>
            Your Meal Plans
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mealPlans.slice(0, 2).map(plan => (
              <div
                key={plan.id}
                onClick={() => window.location.href = `/view-plan.html?id=${plan.id}`}
                style={{
                  padding: 16,
                  background: 'var(--gray-50)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  border: '1px solid var(--gray-100)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--brand-primary)', marginBottom: 4 }}>
                  {plan.plan_name || 'Meal Plan'}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                  {plan.daily_calories} cal/day • {plan.meals_per_day} meals
                </div>
              </div>
            ))}
          </div>
        </div>
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
