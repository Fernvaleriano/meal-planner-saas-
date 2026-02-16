import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import ReadinessCheckin from '../components/adaptive/ReadinessCheckin';
import HealthSpanCard from '../components/adaptive/HealthSpanCard';
import NutritionRecommendations from '../components/adaptive/NutritionRecommendations';
import {
  Brain, Activity, ChevronRight,
  TrendingUp, TrendingDown, Minus, Dumbbell, Heart
} from 'lucide-react';

function AdaptiveCoach() {
  const { clientData } = useAuth();
  const [readinessData, setReadinessData] = useState(null);
  const [gamificationData, setGamificationData] = useState(null);
  const [nutritionRecs, setNutritionRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  const clientId = clientData?.id;

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiGet(`/.netlify/functions/daily-readiness?clientId=${clientId}&days=7`),
        apiGet(`/.netlify/functions/gamification?clientId=${clientId}`),
        apiGet(`/.netlify/functions/contextual-nutrition?clientId=${clientId}`)
      ]);

      if (results[0].status === 'fulfilled') setReadinessData(results[0].value);
      if (results[1].status === 'fulfilled') setGamificationData(results[1].value);
      if (results[2].status === 'fulfilled') setNutritionRecs(results[2].value?.recommendations || []);
    } catch (err) {
      console.error('Failed to fetch adaptive coach data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReadinessSubmit = async (data) => {
    try {
      const result = await apiPost('/.netlify/functions/daily-readiness', {
        clientId,
        ...data
      });
      setShowReadinessModal(false);

      // Refresh all data + recompute Health Span
      await Promise.allSettled([
        fetchData(),
        apiPost('/.netlify/functions/gamification', { clientId })
      ]);

      return result;
    } catch (err) {
      console.error('Readiness submit error:', err);
      throw err;
    }
  };

  const todayReadiness = readinessData?.stats?.todayScore;
  const todayIntensity = readinessData?.stats?.todayIntensity;
  const healthSpan = gamificationData?.healthSpan;
  const streaks = gamificationData?.streaks || {};

  const getIntensityColor = (intensity) => {
    const colors = {
      peak: '#ef4444',
      hard: '#f97316',
      moderate: '#eab308',
      easy: '#22c55e',
      deload: '#06b6d4',
      rest: '#6b7280'
    };
    return colors[intensity] || '#6b7280';
  };

  const getTrendIcon = (change) => {
    if (change > 0) return <TrendingUp size={16} style={{ color: '#22c55e' }} />;
    if (change < 0) return <TrendingDown size={16} style={{ color: '#ef4444' }} />;
    return <Minus size={16} style={{ color: '#6b7280' }} />;
  };

  if (loading) {
    return (
      <div className="adaptive-coach-loading">
        <div className="loading-spinner" />
        <p>Loading your coaching data...</p>
      </div>
    );
  }

  return (
    <div className="adaptive-coach-page">
      {/* Header */}
      <div className="adaptive-coach-header">
        <h1>
          <Brain size={24} />
          Adaptive Coach
        </h1>
        <p className="adaptive-subtitle">
          Personalized training guidance based on how your body feels today
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="adaptive-quick-stats">
        <button
          className="adaptive-stat-card clickable"
          onClick={() => setShowReadinessModal(true)}
        >
          <div className="stat-icon-wrapper" style={{ background: todayReadiness ? getIntensityColor(todayIntensity) + '20' : 'var(--gray-100)' }}>
            <Activity size={20} style={{ color: todayReadiness ? getIntensityColor(todayIntensity) : 'var(--gray-400)' }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">
              {todayReadiness != null ? todayReadiness : '--'}
            </span>
            <span className="stat-label">Readiness</span>
          </div>
          {readinessData?.stats?.trend != null && getTrendIcon(readinessData.stats.trend)}
          <ChevronRight size={16} className="stat-chevron" />
        </button>

        <div className="adaptive-stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#8b5cf620' }}>
            <Dumbbell size={20} style={{ color: '#8b5cf6' }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{streaks.workout?.current || 0}</span>
            <span className="stat-label">Day Streak</span>
          </div>
        </div>

        <div className="adaptive-stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#06b6d420' }}>
            <Heart size={20} style={{ color: '#06b6d4' }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">
              {healthSpan?.score != null ? healthSpan.score : '--'}
            </span>
            <span className="stat-label">Health Span</span>
          </div>
          {healthSpan?.change != null && getTrendIcon(healthSpan.change)}
        </div>
      </div>

      {/* Today's Intensity Recommendation */}
      {todayIntensity && (
        <div className="adaptive-intensity-banner" style={{ borderLeftColor: getIntensityColor(todayIntensity) }}>
          <div className="intensity-indicator" style={{ background: getIntensityColor(todayIntensity) }}>
            {todayIntensity.toUpperCase()}
          </div>
          <div className="intensity-text">
            <strong>Today's Training Intensity</strong>
            <span>
              {readinessData?.readiness?.[0]?.ai_recommendation || `Based on your readiness score of ${todayReadiness}, today is a ${todayIntensity} day.`}
            </span>
          </div>
        </div>
      )}

      {/* No readiness yet today - CTA */}
      {!todayReadiness && (
        <button
          className="adaptive-cta-banner"
          onClick={() => setShowReadinessModal(true)}
        >
          <Activity size={20} />
          <div>
            <strong>How are you feeling today?</strong>
            <span>Complete your daily readiness check to get personalized training recommendations</span>
          </div>
          <ChevronRight size={20} />
        </button>
      )}

      {/* Health Span Score */}
      <HealthSpanCard
        healthSpan={healthSpan}
        history={gamificationData?.healthSpanHistory || []}
      />

      {/* Readiness History (last 7 days) */}
      {readinessData?.readiness?.length > 0 && (
        <div className="readiness-history-card">
          <h3>Readiness This Week</h3>
          <div className="readiness-history-bars">
            {readinessData.readiness.slice(0, 7).reverse().map((day) => {
              const score = day.readiness_score || 0;
              const dayLabel = new Date(day.assessment_date + 'T12:00:00Z')
                .toLocaleDateString('en-US', { weekday: 'short' });
              const isToday = day.assessment_date === new Date().toISOString().split('T')[0];

              return (
                <div key={day.assessment_date} className={`readiness-bar-item ${isToday ? 'today' : ''}`}>
                  <div className="readiness-bar-track">
                    <div
                      className="readiness-bar-fill"
                      style={{
                        height: `${score}%`,
                        background: getIntensityColor(day.intensity_recommendation)
                      }}
                    />
                  </div>
                  <span className="readiness-bar-score">{score}</span>
                  <span className="readiness-bar-day">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contextual Nutrition */}
      {nutritionRecs.length > 0 && (
        <NutritionRecommendations recommendations={nutritionRecs} />
      )}

      {/* Readiness Check-in Modal */}
      {showReadinessModal && (
        <ReadinessCheckin
          onSubmit={handleReadinessSubmit}
          onClose={() => setShowReadinessModal(false)}
          existingData={readinessData?.readiness?.[0]}
        />
      )}
    </div>
  );
}

export default AdaptiveCoach;
