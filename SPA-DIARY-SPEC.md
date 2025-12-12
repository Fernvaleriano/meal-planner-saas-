# Diary SPA Specification
## client-diary.html Analysis (8258 lines)

This document contains a complete analysis for pixel-perfect SPA rebuild.

---

## 1. API Endpoints Used

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/.netlify/functions/food-diary` | GET, POST, PUT, DELETE | Food diary CRUD operations |
| `/.netlify/functions/calorie-goals` | GET, POST | Get/save calorie/macro goals |
| `/.netlify/functions/client-diary-ai` | POST | AI chat assistant for nutrition help |
| `/.netlify/functions/analyze-food-photo` | POST | AI photo analysis |
| `/.netlify/functions/analyze-food-text` | POST | AI text/voice food parsing |
| `/.netlify/functions/analyze-nutrition-label` | POST | Nutrition label scanning |
| `/.netlify/functions/food-search` | GET | Search food database |
| `/.netlify/functions/toggle-favorite` | GET, POST | Get favorites / save meal to favorites |

---

## 2. UI Components

### 2.1 Top Navigation
- Date display with navigation arrows (prev/next day)
- Date picker (tap to select any date)
- Today/Yesterday/Tomorrow labels
- Greeting with client name

### 2.2 Calorie Summary Card
- Large calorie ring (SVG progress circle)
- Calories consumed / remaining
- Macro progress bars (Protein, Carbs, Fat)
- Skeleton loading states

### 2.3 Quick Actions Bar (Horizontal scroll)
- Photo Log (`openAIPhotoModal()`)
- Type/Voice (`openAITextModal()`)
- Food Search (`openFoodSearch()`)
- Scan Label (`openScanLabelModal()`)
- From Meal Plan (`openMealPlanPicker()`)
- From Favorites (`openFavoritesPicker()`)
- Barcode Scanner (`openBarcodeScanner()`)
- Copy Day (`openCopyDayModal()`)
- Daily Report (`openDailyReport()`)
- Weekly Summary (`openWeeklySummary()`)
- Log Weight (`openWeightLogModal()`)

### 2.4 Water Tracking Card (Blue gradient)
- Glass visualization
- Current / goal display
- Add glass (+1) button
- Complete goal button
- Goal adjustment button

### 2.5 Meal Sections (4 collapsible)
- Breakfast (`#breakfastEntries`, `#breakfastCals`)
- Lunch (`#lunchEntries`, `#lunchCals`)
- Dinner (`#dinnerEntries`, `#dinnerCals`)
- Snack (`#snackEntries`, `#snackCals`)
- Each with:
  - Add button (opens food search with meal type)
  - Save to favorites button (when has entries)
  - Swipe-to-delete entries
  - Calories total per meal

### 2.6 AI Nutrition Assistant Card
- Expandable chat interface
- Macro-based suggestions chips
- Chat input with send button
- Food logging from chat
- Meal type selector for logging

### 2.7 Weight Tracking Card
- Current weight display
- Weight change indicator (up/down)
- Mini chart (canvas)
- Stats: Start, Lowest, Highest, Total change
- Log weight button

### 2.8 Bottom Navigation
- Home, Diary (active), Meal Plans, Profile
- Lucide icons

### 2.9 Modals
1. **Food Search Modal** (`#foodSearchModal`)
   - Search input with debounce
   - Results list
   - Food selection with serving adjustment
2. **Quick Add Modal** (`#quickAddModal`)
   - Manual food entry form
   - Name, calories, protein, carbs, fat fields
3. **Goals Modal** (`#goalsModal`)
   - Edit calorie/macro goals (if permitted)
4. **Edit Entry Modal** (`#editModal`)
   - Edit existing food entry
   - Delete entry button
5. **AI Photo Modal** (`#aiPhotoModal`)
   - Camera/upload interface
   - Photo preview
   - AI analysis results
   - Multi-food detection
   - Remove/add detected items
6. **AI Text Modal** (`#aiTextModal`)
   - Voice input button
   - Text input
   - AI analysis results
7. **Scan Label Modal** (`#scanLabelModal`)
   - Camera/upload for nutrition labels
   - Detected nutrition display
   - Serving adjustment
8. **Meal Plan Picker Modal** (`#mealPlanPickerModal`)
   - Plan selection view
   - Meals within plan view
9. **Favorites Picker Modal** (`#favoritesPickerModal`)
   - List of favorites
   - Quick add to diary
10. **Save Meal Modal** (`#saveMealModal`)
    - Save entire meal as favorite
    - Custom name input
11. **Daily Report Modal** (`#dailyReportModal`)
    - Score circle
    - Macro adherence bars
    - Insights section
12. **Weekly Summary Modal** (`#weeklySummaryModal`)
    - Bar chart (7 days)
    - Stats: days logged, avg calories, total
    - Weekly insights
13. **Weight Log Modal** (`#weightLogModal`)
    - Weight input
    - Date picker
    - Notes field
14. **Copy Day Modal** (`#copyDayModal`)
    - Copy from yesterday
    - Copy from date picker
    - Copy to date picker
15. **Water Goal Modal** (`#waterGoalModal`)
    - Glasses per day input
16. **Barcode Scanner Modal** (`#barcodeModal`)
    - Camera viewfinder
    - Uses html5-qrcode library

---

## 3. JavaScript Functions

### 3.1 Initialization
```javascript
checkAuth()                    // Verify session, load client data
loadDiaryEntries()            // Load food entries for current date
loadGoals()                   // Load calorie/macro goals
loadWaterIntake()             // Load water tracking
loadWeightData()              // Load weight history
updateDateDisplay()           // Update date header
updateSummary()               // Update macro totals
```

### 3.2 Date Navigation
```javascript
changeDate(days)              // Navigate +/- days
showDatePicker()              // Open native date picker
formatDate(date)              // YYYY-MM-DD format (local timezone)
```

### 3.3 Food Diary CRUD
```javascript
loadDiaryEntries()            // GET entries for date
addOptimisticEntry()          // Optimistic UI update
updateOptimisticEntryWithRealId()
removeOptimisticEntry()
openEditModal(entryId)        // Edit existing entry
saveEditEntry(event)          // PUT update entry
deleteEntry()                 // DELETE via modal
swipeDeleteEntry(entryId)     // DELETE via swipe
```

### 3.4 Food Search
```javascript
openFoodSearch(mealType)      // Open search modal
closeFoodSearch()
setupSearchListener()         // Debounced search
searchFood()                  // GET food-search endpoint
selectFood(idx)               // Select from results
openFoodSelect(food)          // Open serving selector
closeFoodSelect()
addSelectedFood()             // POST to diary
recalculateMacros()           // Update based on servings
```

### 3.5 AI Photo Analysis
```javascript
openAIPhotoModal()
closeAIPhotoModal()
resetAIPhoto()
handlePhotoSelect(event)      // File input handler
compressImage(file, maxWidth, quality)
analyzePhoto()                // POST analyze-food-photo
renderAIPhotoResults()
updateAIPhotoMacros(idx, servings)
removeAIPhotoFood(idx)
addAIDetectedFoods()          // Add all to diary
```

### 3.6 AI Text/Voice Analysis
```javascript
openAITextModal()
closeAITextModal()
resetAIText()
checkVoiceSupport()           // Check Web Speech API
toggleVoiceInput()
startVoiceInput()             // SpeechRecognition
stopVoiceInput()
analyzeTextWithAI()           // POST analyze-food-text
renderAITextResults()
updateAITextFood(idx, field, value)
removeAITextFood(idx)
addAITextFoods()              // Add all to diary
```

### 3.7 Nutrition Label Scanner
```javascript
openScanLabelModal()
closeScanLabelModal()
resetScanLabel()
handleScanLabelSelect(event)
analyzeScanLabel()            // POST analyze-nutrition-label
recalculateScanLabelMacros()
addScanLabelFood()
```

### 3.8 Barcode Scanner
```javascript
openBarcodeScanner()
closeBarcodeScanner()
onBarcodeScanSuccess(code)
lookupBarcode(code)           // GET food-search?barcode=
```

### 3.9 Meal Plan Picker
```javascript
openMealPlanPicker()
closeMealPlanPicker()
loadMealPlans()
showPlanMeals(planId)
showPlanSelection()
addMealFromPlan(meal)
```

### 3.10 Favorites
```javascript
openFavoritesPicker()
closeFavoritesPicker()
loadFavorites()
addFavoriteToEntry(fav)
openSaveMealModal(mealType)
closeSaveMealModal()
saveMealToFavorites()
updateSaveMealButtons()
```

### 3.11 Goals
```javascript
openGoalsModal()
closeGoalsModal()
saveGoals(event)              // POST calorie-goals
```

### 3.12 Swipe-to-Delete
```javascript
initSwipeHandlers(container)
initSwipeOnElement(element)
swipeDeleteEntry(entryId, mealType)
```

### 3.13 Copy Day
```javascript
openCopyDayModal()
closeCopyDayModal()
openCopyFromDatePicker()
openCopyToDatePicker()
executeCopyDate()
copyFromYesterday()
copyEntriesFromDate(fromDate, toDate)
```

### 3.14 Water Tracking
```javascript
renderWaterGlasses()
addWater(glasses)
removeWater(glasses)
completeWaterGoal()
openWaterGoalModal()
closeWaterGoalModal()
saveWaterGoal()
loadWaterIntake()             // Supabase direct
saveWaterIntake()             // Supabase direct
```

### 3.15 Daily Report
```javascript
openDailyReport()
closeDailyReport()
generateDailyReport()
```

### 3.16 Weekly Summary
```javascript
openWeeklySummary()
closeWeeklySummary()
generateWeeklySummary()       // Supabase direct query
```

### 3.17 Weight Tracking
```javascript
openWeightLogModal()
closeWeightLogModal()
saveWeight()                  // Supabase direct
loadWeightData()              // Supabase direct
renderWeightCard()
drawWeightChart()             // Canvas API
```

### 3.18 AI Assistant
```javascript
toggleAIExpand()              // Expand/collapse chat
updateAISuggestions()         // Update suggestion chips
sendAIMessage()               // POST client-diary-ai
askAI(question)               // Quick ask helper
handleAIKeydown(event)        // Enter to send
parseFoodSuggestions(text)    // Parse [[FOOD:...]] format
addChatMessage(text, type)
handleFoodSuggestionClick(idx)
showFoodSuggestionActions(food, btn)
logFoodSuggestion(btn)
getFoodDetails(btn)
reviseFoodSuggestion(btn)
requestMoreIdeas()
showFoodLogPreview(foodData)
selectAIMealType(mealType)
confirmAIFoodLog()
cancelAIFoodLog()
initAIAssistant()
```

### 3.19 Utility Functions
```javascript
showToast(message)
showLoadingState()
hideLoadingState()
updateMacroBar(type, value, goal)
updateRemainingCaloriesDisplay(remaining)
goToMealPlan()
```

---

## 4. Global Variables

```javascript
// Client state
let clientId = null;
let coachId = null;
let clientFirstName = null;
let currentDate = new Date();
let currentMealType = 'breakfast'; // Auto-set based on time

// Goals and entries
let goals = { calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 65 };
let entries = [];
let currentTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

// Search state
let searchTimeout = null;
let searchResults = [];
let selectedFood = null;
let currentServingIdx = 0;
let currentServingWeight = 0;
let currentServingUnit = '';

// AI Photo state
let aiPhotoBase64 = null;
let aiDetectedFoods = [];
let aiPhotoBaseValues = [];

// AI Text state
let aiTextDetectedFoods = [];
let speechRecognition = null;
let isListening = false;

// Scan Label state
let scanLabelBase64 = null;
let scanLabelBaseValues = null;

// Edit state
let editBaseValues = null;

// Save meal state
let saveMealData = null;

// Copy day state
let copyMode = 'from';

// Water tracking
let waterIntake = 0;
let waterGoal = 8;

// Weight tracking
let weightData = [];

// AI Assistant state
let aiChatHistory = [];
let pendingFoodLog = null;
let aiExpanded = false;
let lastSuggestionContext = null;
let selectedAIMealType = null;

// Barcode scanner
let barcodeScanner = null;
```

---

## 5. CSS Classes & Styles

### Layout
- `.main-content` - Main scrollable area
- `.calorie-card` - Summary card with ring
- `.meal-section` - Collapsible meal group
- `.water-card` - Blue gradient water tracker
- `.weight-card` - Weight tracking card
- `.ai-assistant-card` - Expandable AI chat

### Calorie Ring (SVG)
```css
.calorie-ring { width: 120px; height: 120px; }
#calorieRing { stroke: var(--brand-primary); stroke-dasharray: 251.2; }
```

### Macro Bars
```css
.macro-bar { background: var(--gray-200); height: 6px; border-radius: 3px; }
.macro-bar-fill { transition: width 0.3s; }
.macro-bar-fill.protein { background: #3b82f6; }
.macro-bar-fill.carbs { background: #f59e0b; }
.macro-bar-fill.fat { background: #ef4444; }
```

### Swipe-to-Delete
```css
.swipe-container { position: relative; overflow: hidden; }
.swipe-content { transform: translateX(0); transition: transform 0.3s; }
.delete-action { position: absolute; right: 0; background: var(--error); }
```

### AI Assistant
```css
.ai-assistant-card.expanded { position: fixed; z-index: 9999; }
.ai-message.user { background: var(--brand-primary); color: white; }
.ai-message.assistant { background: var(--gray-100); }
.ai-food-suggestion-btn { border: 1px solid var(--gray-200); }
```

---

## 6. Local Storage Caching

```javascript
const DIARY_CACHE_PREFIX = 'zique_diary_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

getDiaryCacheKey(date)
getCachedDiary(date)
setCachedDiary(date, data)
invalidateDiaryCache(date)
cleanupOldCaches()           // Keep only last 7 days
```

---

## 7. External Dependencies

- **Supabase JS SDK** (`@supabase/supabase-js`)
- **Lucide Icons** (lucide.createIcons())
- **html5-qrcode** (barcode scanning)
- **Web Speech API** (voice input)
- **Canvas API** (weight chart)
- **Service Worker** (`/sw.js`)
- **PWA Install Prompt** (`/js/pwa-install-prompt.js`)
- **API Helper** (`/js/api-helper.js`)

---

## 8. Key Implementation Notes

1. **Time-based meal type**: Auto-selects meal type based on hour:
   - 5-11: breakfast
   - 11-15: lunch
   - 15-21: dinner
   - else: snack

2. **Optimistic Updates**: Food entries added instantly, then synced with server

3. **Swipe Gesture**: Left swipe reveals delete button (80px threshold)

4. **Voice Input**: Uses Web Speech API with fallback message for unsupported browsers

5. **Image Compression**: Client-side compression to 1200px max width, 0.8 quality

6. **AI Food Format**: `[[FOOD: name | calories | protein | carbs | fat]]`

7. **Cache Strategy**: 24-hour cache per date, invalidated on any write

8. **Supabase Direct**: Water/weight tracking uses Supabase directly (not API functions)

---

## 9. Responsive Breakpoints

```css
/* Mobile first - default styles */
@media (min-width: 768px) {
  .bottom-nav { display: none; }
  .main-content { padding-bottom: 32px; }
}
```

---

## 10. Data Flow

1. **Page Load:**
   - Check auth session
   - Load client data
   - Show skeleton loading
   - Load diary entries (with cache check)
   - Load water, weight data
   - Update all summaries
   - Init AI suggestions

2. **Add Food Flow:**
   - User opens search/photo/voice/scan modal
   - Gets food data (AI or database)
   - Shows preview with serving adjustment
   - Optimistic UI update
   - POST to food-diary
   - Update real ID on success
   - Invalidate cache

3. **AI Chat Flow:**
   - User sends message
   - Refresh diary data first
   - POST to client-diary-ai
   - If `action: log_food`, show food preview
   - User confirms meal type
   - Add to diary

4. **Copy Day Flow:**
   - User selects source date
   - GET entries from source
   - POST each entry to target date
   - Reload if target is current date
