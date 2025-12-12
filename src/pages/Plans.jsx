import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function Plans() {
  const { clientData } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      if (!clientData?.id) return;

      try {
        // TODO: Load meal plans from API
        setLoading(false);
      } catch (err) {
        console.error('Error loading plans:', err);
        setLoading(false);
      }
    };

    loadPlans();
  }, [clientData?.id]);

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px' }}>
          Meal Plans
        </h1>
        <div className="skeleton" style={{ height: '200px' }}></div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px' }}>
        Meal Plans
      </h1>

      {plans.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3 className="empty-state-title">No meal plans yet</h3>
            <p className="empty-state-text">
              Your coach will assign meal plans to you here.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {plans.map(plan => (
            <div key={plan.id} className="card">
              <h3 style={{ fontWeight: '600', marginBottom: '12px' }}>{plan.name}</h3>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                {plan.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Plans;
