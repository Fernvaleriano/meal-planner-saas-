import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Star, Camera, Search, Heart, Copy, ArrowLeft, FileText, Sunrise, Sun, Moon, Apple, Droplets, Bot, Maximize2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../utils/api';

function Diary() {
  const { clientData } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [goals, setGoals] = useState({ calorie_goal: 2600, protein_goal: 221, carbs_goal: 260, fat_goal: 75 });
  const [waterIntake, setWaterIntake] = useState(0);
  const [waterGoal] = useState(8);

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

  const formatFullDate = () => {
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
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

        if (data.waterIntake !== undefined) {
          setWaterIntake(data.waterIntake);
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

  // Group entries by meal type
  const groupedEntries = {
    breakfast: entries.filter(e => e.meal_type === 'breakfast'),
    lunch: entries.filter(e => e.meal_type === 'lunch'),
    dinner: entries.filter(e => e.meal_type === 'dinner'),
    snack: entries.filter(e => e.meal_type === 'snack')
  };

  // Calculate remaining and progress
  const remaining = goals.calorie_goal - totals.calories;
  const calorieProgress = Math.min(100, Math.round((totals.calories / goals.calorie_goal) * 100));
  const proteinProgress = Math.min(100, Math.round((totals.protein / goals.protein_goal) * 100));
  const carbsProgress = Math.min(100, Math.round((totals.carbs / goals.carbs_goal) * 100));
  const fatProgress = Math.min(100, Math.round((totals.fat / goals.fat_goal) * 100));

  // Calorie ring component
  const CalorieRing = () => {
    const radius = 85;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (calorieProgress / 100) * circumference;

    return (
      <div className="calorie-ring-container">
        <svg viewBox="0 0 200 200" className="calorie-ring-svg">
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="calorie-ring-bg"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="calorie-ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="calorie-ring-value">
          <span className="calorie-remaining">{remaining}</span>
          <span className="calorie-label">Remaining</span>
        </div>
      </div>
    );
  };

  // Meal section icons
  const getMealIcon = (mealType) => {
    switch (mealType) {
      case 'breakfast': return <Sunrise size={18} className="meal-section-icon breakfast" />;
      case 'lunch': return <Sun size={18} className="meal-section-icon lunch" />;
      case 'dinner': return <Moon size={18} className="meal-section-icon dinner" />;
      case 'snack': return <Apple size={18} className="meal-section-icon snack" />;
      default: return null;
    }
  };

  // Meal section component
  const MealSection = ({ title, entries, mealType }) => {
    const mealCals = entries.reduce((sum, e) => sum + (e.calories || 0), 0);

    return (
      <div className="meal-section">
        <div className="meal-section-header">
          <div className="meal-section-title">
            {getMealIcon(mealType)}
            <span>{title}</span>
          </div>
          <div className="meal-section-actions">
            <span className="meal-section-cals">{mealCals} cal</span>
            <button className="meal-add-btn">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="meal-entries">
            {entries.map(entry => (
              <div key={entry.id} className="meal-entry">
                <div className="meal-entry-info">
                  <span className="meal-entry-name">{entry.food_name}</span>
                  <span className="meal-entry-serving">{entry.number_of_servings || 1} serving</span>
                </div>
                <span className="meal-entry-cals">{entry.calories || 0}</span>
              </div>
            ))}
          </div>
        )}

        <div className="meal-section-footer">
          <button className="meal-footer-btn add">
            <Plus size={16} />
            Add Food
          </button>
          <button className="meal-footer-btn save">
            <Heart size={16} />
            Save Meal
          </button>
        </div>
      </div>
    );
  };

  // Water glass visual
  const WaterGlasses = () => {
    const glasses = Array(waterGoal).fill(0);
    return (
      <div className="water-glasses">
        {glasses.map((_, i) => (
          <div
            key={i}
            className={`water-glass ${i < waterIntake ? 'filled' : ''}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="diary-page">
      {/* Date Navigation */}
      <div className="date-navigator">
        <button className="date-nav-btn" onClick={() => changeDate(-1)}>
          <ChevronLeft size={24} />
        </button>
        <div className="date-display">
          <span className="date-label">{formatDateDisplay()}</span>
          <span className="date-full">{formatFullDate()}</span>
        </div>
        <button className="date-nav-btn" onClick={() => changeDate(1)}>
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Quick Actions Row */}
      <div className="diary-quick-actions">
        <button className="diary-action-btn">
          <Copy size={16} />
          Copy Day
        </button>
        <button className="diary-action-btn">
          <ArrowLeft size={16} />
          Copy Yesterday
        </button>
        <button className="diary-action-btn">
          <FileText size={16} />
          Daily
        </button>
      </div>

      {/* Add Food Section */}
      <div className="add-food-section">
        <div className="add-food-header">
          <Plus size={18} className="add-food-icon" />
          <span>Add Food</span>
        </div>
        <div className="add-food-options">
          <button className="add-food-option">
            <Star size={20} />
            <span>AI Log</span>
          </button>
          <button className="add-food-option">
            <Camera size={20} />
            <span>Photo</span>
          </button>
          <button className="add-food-option">
            <Search size={20} />
            <span>Search</span>
          </button>
          <button className="add-food-option">
            <Heart size={20} />
            <span>Favorites</span>
          </button>
        </div>
      </div>

      {/* Calorie Summary */}
      <div className="calorie-summary">
        <h3 className="calorie-title">Calories</h3>
        <CalorieRing />
        <div className="calorie-breakdown">
          <div className="calorie-stat">
            <span className="calorie-stat-value">{goals.calorie_goal}</span>
            <span className="calorie-stat-label">Goal</span>
          </div>
          <span className="calorie-operator">-</span>
          <div className="calorie-stat">
            <span className="calorie-stat-value">{totals.calories}</span>
            <span className="calorie-stat-label">Food</span>
          </div>
          <span className="calorie-operator">=</span>
          <div className="calorie-stat">
            <span className="calorie-stat-value remaining">{remaining}</span>
            <span className="calorie-stat-label">Left</span>
          </div>
        </div>

        {/* Macro Progress Bars */}
        <div className="macro-progress-bars">
          <div className="macro-bar-item">
            <span className="macro-bar-label protein">P:</span>
            <span className="macro-bar-value">{Math.round(totals.protein)}/{goals.protein_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill protein" style={{ width: `${proteinProgress}%` }} />
            </div>
          </div>
          <div className="macro-bar-item">
            <span className="macro-bar-label carbs">C:</span>
            <span className="macro-bar-value">{Math.round(totals.carbs)}/{goals.carbs_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill carbs" style={{ width: `${carbsProgress}%` }} />
            </div>
          </div>
          <div className="macro-bar-item">
            <span className="macro-bar-label fat">F:</span>
            <span className="macro-bar-value">{Math.round(totals.fat)}/{goals.fat_goal}g</span>
            <div className="macro-bar-track">
              <div className="macro-bar-fill fat" style={{ width: `${fatProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Meal Sections */}
      {loading ? (
        <div className="meal-sections-loading">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton meal-section-skeleton" />
          ))}
        </div>
      ) : (
        <div className="meal-sections">
          <MealSection title="Breakfast" entries={groupedEntries.breakfast} mealType="breakfast" />
          <MealSection title="Lunch" entries={groupedEntries.lunch} mealType="lunch" />
          <MealSection title="Dinner" entries={groupedEntries.dinner} mealType="dinner" />
          <MealSection title="Snacks" entries={groupedEntries.snack} mealType="snack" />
        </div>
      )}

      {/* Water Intake */}
      <div className="water-intake-card">
        <div className="water-intake-header">
          <div className="water-intake-title">
            <Droplets size={18} className="water-icon" />
            <span>Water Intake</span>
          </div>
          <span className="water-goal-badge">Goal: {waterGoal} glasses</span>
        </div>
        <div className="water-intake-content">
          <WaterGlasses />
          <div className="water-intake-count">
            <span className="water-count">{waterIntake}/{waterGoal}</span>
            <span className="water-label">glasses today</span>
          </div>
        </div>
        <div className="water-intake-actions">
          <button className="water-btn add">+1 Glass</button>
          <button className="water-btn add">+2 Glasses</button>
          <button className="water-btn remove">-1</button>
          <button className="water-btn complete">Complete Goal</button>
        </div>
      </div>

      {/* AI Nutrition Assistant */}
      <div className="ai-assistant-card">
        <div className="ai-assistant-header">
          <div className="ai-assistant-title">
            <Bot size={18} className="ai-icon" />
            <span>AI Nutrition Assistant</span>
          </div>
          <button className="ai-expand-btn">
            <Maximize2 size={16} />
            Expand
          </button>
        </div>
        <div className="ai-assistant-suggestions">
          <button className="ai-suggestion protein">Need {Math.max(0, goals.protein_goal - Math.round(totals.protein))}g more protein</button>
          <button className="ai-suggestion recipe">What can I make?</button>
        </div>
        <div className="ai-assistant-chips">
          <button className="ai-chip">Need protein</button>
          <button className="ai-chip">Snack ideas</button>
          <button className="ai-chip">My progress</button>
          <button className="ai-chip">Dinner ideas</button>
        </div>
        <div className="ai-input-row">
          <input
            type="text"
            className="ai-input"
            placeholder="Ask me anything or log food..."
          />
          <button className="ai-send-btn">Send</button>
        </div>
      </div>
    </div>
  );
}

export default Diary;
