import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../utils/api'
import { Utensils, Calendar, Flame } from 'lucide-react'

export default function Plans() {
  const { clientData } = useAuth()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState([])

  useEffect(() => {
    async function loadPlans() {
      if (!clientData?.id) return

      try {
        const data = await apiGet(`/.netlify/functions/get-client-plans?clientId=${clientData.id}`)
        setPlans(data.plans || [])
      } catch (err) {
        console.error('Error loading plans:', err)
      } finally {
        setLoading(false)
      }
    }

    loadPlans()
  }, [clientData])

  const viewPlan = (planId) => {
    // Redirect to legacy view-plan page for now
    window.location.href = `/view-plan.html?id=${planId}`
  }

  if (loading) {
    return (
      <div className="plans">
        <div className="welcome-header">
          <h1>Meal Plans</h1>
          <p>Your personalized nutrition plans</p>
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 150 }} />
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="plans">
      <div className="welcome-header">
        <h1>Meal Plans</h1>
        <p>Your personalized nutrition plans</p>
      </div>

      {plans.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No Meal Plans Yet</h3>
            <p>Your coach hasn't created any meal plans for you yet. Check back soon!</p>
          </div>
        </div>
      ) : (
        plans.map(plan => (
          <div
            key={plan.id}
            className="card"
            onClick={() => viewPlan(plan.id)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ color: 'var(--brand-primary)', fontWeight: 700, marginBottom: 4 }}>
                  {plan.plan_name || 'Meal Plan'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                  Created {new Date(plan.created_at).toLocaleDateString()}
                </p>
              </div>
              {plan.is_active && (
                <span style={{
                  background: 'var(--success)',
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}>
                  Active
                </span>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              padding: 16,
              background: 'var(--gray-50)',
              borderRadius: 12
            }}>
              <div style={{ textAlign: 'center' }}>
                <Flame size={20} style={{ color: 'var(--brand-primary)', marginBottom: 4 }} />
                <div style={{ fontWeight: 700 }}>{plan.daily_calories}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>cal/day</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Utensils size={20} style={{ color: 'var(--brand-primary)', marginBottom: 4 }} />
                <div style={{ fontWeight: 700 }}>{plan.meals_per_day}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>meals</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Calendar size={20} style={{ color: 'var(--brand-primary)', marginBottom: 4 }} />
                <div style={{ fontWeight: 700 }}>{plan.plan_duration || 7}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>days</div>
              </div>
            </div>

            {plan.plan_summary && (
              <p style={{
                marginTop: 12,
                padding: 12,
                background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(2, 132, 199, 0.08) 100%)',
                borderLeft: '3px solid var(--brand-primary)',
                borderRadius: 8,
                fontSize: '0.9rem',
                color: 'var(--gray-600)'
              }}>
                {plan.plan_summary}
              </p>
            )}

            <button
              style={{
                width: '100%',
                marginTop: 16,
                padding: 12,
                background: 'var(--brand-gradient)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View Plan Details
            </button>
          </div>
        ))
      )}
    </div>
  )
}
