import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/api';
import ReadinessCheckin from '../components/adaptive/ReadinessCheckin';
import WeeklyPlanner from '../components/adaptive/WeeklyPlanner';
import HealthSpanCard from '../components/adaptive/HealthSpanCard';
import BadgesPanel from '../components/adaptive/BadgesPanel';
import NutritionRecommendations from '../components/adaptive/NutritionRecommendations';
import TriageFlagsPanel from '../components/adaptive/TriageFlagsPanel';
import {
  Brain, Activity, Trophy, Utensils, AlertTriangle, ChevronRight,
  TrendingUp, TrendingDown, Minus, Zap, Moon, Dumbbell
} from 'lucide-react';

function AdaptiveCoach() {
  const { clientData } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [readinessData, setReadinessData] = useState(null);
  const [weekSchedule, setWeekSchedule] = useState(null);
  const [gamificationData, setGamificationData] = useState(null);
  const [nutritionRecs, setNutritionRecs] = useState([]);
  const [triageFlags, setTriageFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  const clientId = clientData?.id;
  const isCoach = clientData?.is_coach === true;

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiGet(`/.netlify/functions/daily-readiness?clientId=${clientId}&days=7`),
        apiGet(`/.netlify/functions/adaptive-planner?clientId=${clientId}`),
        apiGet(`/.netlify/functions/gamification?clientId=${clientId}`),
        apiGet(`/.netlify/functions/contextual-nutrition?clientId=${clientId}`),
        ...(isCoach ? [apiGet(`/.netlify/functions/coach-triage?coachId=${clientData?.coach_id || clientId}`)] : [])
      ]);

      if (results[0].status === 'fulfilled') setReadinessData(results[0].value);
      if (results[1].status === 'fulfilled') setWeekSchedule(results[1].value);
      if (results[2].status === 'fulfilled') setGamificationData(results[2].value);
      if (results[3].status === 'fulfilled') setNutritionRecs(results[3].value?.recommendations || []);
      if (results[4]?.status === 'fulfilled') setTriageFlags(results[4].value?.flags || []);
    } catch (err) {
      console.error('Failed to fetch adaptive coach data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, isCoach, clientData?.coach_id]);

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

      // Refresh data and update gamification
      await Promise.allSettled([
        fetchData(),
        apiPost('/.netlify/functions/gamification', { clientId }),
        apiPost('/.netlify/functions/adaptive-planner', { clientId }),
        apiPost('/.netlify/functions/coach-triage', { clientId })
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
  const points = gamificationData?.points || {};

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Brain },
    { id: 'planner', label: 'Planner', icon: Activity },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'nutrition', label: 'Nutrition', icon: Utensils },
    ...(isCoach ? [{ id: 'triage', label: 'Triage', icon: AlertTriangle }] : [])
  ];

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
        <p>Loading your adaptive coaching data...</p>
      </div>
    );
  }

  return (
    <div className="adaptive-coach-page">
      <div className="adaptive-coach-header">
        <div className="adaptive-header-top">
          <h1>
            <Brain size={24} />
            Adaptive Coach
          </h1>
          {points.level && (
            <div className="level-badge">
              <Zap size={14} />
              Level {points.level}
            </div>
          )}
        </div>
        <p className="adaptive-subtitle">
          Your AI-powered fitness brain that adapts to your body every day
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
            <Moon size={20} style={{ color: '#06b6d4' }} />
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

      {/* No readiness yet today - prompt */}
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

      {/* Tab Navigation */}
      <div className="adaptive-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`adaptive-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="adaptive-tab-content">
        {activeTab === 'overview' && (
          <div className="adaptive-overview">
            {healthSpan && (
              <HealthSpanCard
                healthSpan={healthSpan}
                history={gamificationData?.healthSpanHistory || []}
              />
            )}

            <WeeklyPlanner
              schedule={weekSchedule?.schedule}
              wasAutoAdjusted={weekSchedule?.wasAutoAdjusted}
              adjustmentReason={weekSchedule?.adjustmentReason}
              getIntensityColor={getIntensityColor}
            />

            {nutritionRecs.length > 0 && (
              <NutritionRecommendations recommendations={nutritionRecs.slice(0, 2)} />
            )}

            <BadgesPanel
              badges={gamificationData?.badges}
              compact
            />
          </div>
        )}

        {activeTab === 'planner' && (
          <WeeklyPlanner
            schedule={weekSchedule?.schedule}
            wasAutoAdjusted={weekSchedule?.wasAutoAdjusted}
            adjustmentReason={weekSchedule?.adjustmentReason}
            getIntensityColor={getIntensityColor}
            expanded
            readinessHistory={readinessData?.readiness || []}
          />
        )}

        {activeTab === 'achievements' && (
          <div className="adaptive-achievements">
            <HealthSpanCard
              healthSpan={healthSpan}
              history={gamificationData?.healthSpanHistory || []}
            />
            <BadgesPanel
              badges={gamificationData?.badges}
              streaks={streaks}
              points={points}
              stats={gamificationData?.stats}
            />
          </div>
        )}

        {activeTab === 'nutrition' && (
          <NutritionRecommendations
            recommendations={nutritionRecs}
            expanded
          />
        )}

        {activeTab === 'triage' && isCoach && (
          <TriageFlagsPanel
            flags={triageFlags}
            onResolve={async (flagId, notes) => {
              await apiPost('/.netlify/functions/coach-triage', {
                flagId,
                status: 'resolved',
                resolutionNotes: notes
              });
              fetchData();
            }}
          />
        )}
      </div>

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
