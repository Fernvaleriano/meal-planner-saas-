import { Utensils, Zap, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

function NutritionRecommendations({ recommendations, expanded }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  if (!recommendations || recommendations.length === 0) {
    if (!expanded) return null;
    return (
      <div className="nutrition-recs-card">
        <div className="nutrition-recs-header">
          <Utensils size={20} />
          <h3>Contextual Nutrition</h3>
        </div>
        <div className="nutrition-recs-empty">
          <p>No nutrition recommendations yet today. Complete a workout or readiness check to get personalized nutrition guidance.</p>
        </div>
      </div>
    );
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getTriggerColor = (type) => {
    const colors = {
      post_workout: '#8b5cf6',
      pre_workout: '#f97316',
      rest_day: '#06b6d4',
      carb_up: '#eab308',
      recovery: '#22c55e'
    };
    return colors[type] || '#6b7280';
  };

  const getTriggerLabel = (type) => {
    const labels = {
      post_workout: 'Post-Workout',
      pre_workout: 'Pre-Workout',
      rest_day: 'Rest Day',
      carb_up: 'Carb Loading',
      recovery: 'Recovery'
    };
    return labels[type] || type;
  };

  return (
    <div className="nutrition-recs-card">
      <div className="nutrition-recs-header">
        <Utensils size={20} />
        <h3>Contextual Nutrition</h3>
      </div>

      <div className="nutrition-recs-list">
        {recommendations.map(rec => {
          const isExpanded = expandedIds.has(rec.id);
          const macros = rec.macro_adjustments || {};
          const triggerColor = getTriggerColor(rec.trigger_type);

          return (
            <div key={rec.id} className="nutrition-rec-item">
              <div
                className="nutrition-rec-main"
                onClick={() => toggleExpand(rec.id)}
              >
                <div className="nutrition-rec-trigger" style={{ background: triggerColor + '20', color: triggerColor }}>
                  {getTriggerLabel(rec.trigger_type)}
                </div>
                <div className="nutrition-rec-content">
                  <strong>{rec.title}</strong>
                  <p>{rec.message}</p>
                </div>
                <button className="nutrition-rec-toggle">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {isExpanded && (macros.protein_add || macros.carbs_add || macros.fat_add) && (
                <div className="nutrition-rec-details">
                  <h4>Macro Adjustments</h4>
                  <div className="macro-adjustments">
                    {macros.protein_add !== 0 && (
                      <div className="macro-adj-item">
                        <span className="macro-adj-label">Protein</span>
                        <span className={`macro-adj-value ${macros.protein_add > 0 ? 'positive' : 'negative'}`}>
                          {macros.protein_add > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {macros.protein_add > 0 ? '+' : ''}{macros.protein_add}g
                        </span>
                      </div>
                    )}
                    {macros.carbs_add !== 0 && (
                      <div className="macro-adj-item">
                        <span className="macro-adj-label">Carbs</span>
                        <span className={`macro-adj-value ${macros.carbs_add > 0 ? 'positive' : 'negative'}`}>
                          {macros.carbs_add > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {macros.carbs_add > 0 ? '+' : ''}{macros.carbs_add}g
                        </span>
                      </div>
                    )}
                    {macros.fat_add !== 0 && (
                      <div className="macro-adj-item">
                        <span className="macro-adj-label">Fat</span>
                        <span className={`macro-adj-value ${macros.fat_add > 0 ? 'positive' : 'negative'}`}>
                          {macros.fat_add > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {macros.fat_add > 0 ? '+' : ''}{macros.fat_add}g
                        </span>
                      </div>
                    )}
                  </div>
                  {macros.reasoning && (
                    <p className="macro-reasoning">{macros.reasoning}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NutritionRecommendations;
